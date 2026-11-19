package com.medcord.support;

import com.medcord.common.ApiException;
import com.medcord.common.FieldValidationException;
import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Volunteer dispatch rooms and peer-support check-ins. */
@Service
public class SupportService {
    public record Dispatch(UUID id, String kind, String urgency, String title, String details, String area, String status,
                           UUID requesterId, String requesterName, UUID volunteerId, String volunteerName, Instant createdAt, boolean mine, boolean mineAsVolunteer) {}
    public record DispatchRequest(String kind, String urgency, String title, String details, String area) {}
    public record Checkin(UUID id, int mood, String note, Instant createdAt) {}
    public record CircleItem(UUID id, UUID userId, String name, int mood, String note, Instant createdAt, int cheers, boolean cheered, boolean needsKindWord) {}
    public record Mine(List<Checkin> recent, int streak, boolean doneToday) {}
    public record CheckinRequest(Integer mood, String note, Boolean shared) {}

    private static final Set<String> KINDS = Set.of("TRANSPORT", "MEDICINE", "VISIT", "FOOD", "OTHER");
    private static final Pattern LONG_DIGITS = Pattern.compile("\\d[\\d\\s-]{6,}\\d");
    private final JdbcClient jdbc;

    public SupportService(JdbcClient jdbc) { this.jdbc = jdbc; }

    // ---------- dispatch ----------
    private static final String DSQL = """
        SELECT d.id, d.kind, d.urgency, d.title, d.details, d.area, d.status, d.requester_id, r.display_name AS rname,
               d.volunteer_id, v.display_name AS vname, d.created_at
        FROM dispatch_requests d JOIN users r ON r.id = d.requester_id LEFT JOIN users v ON v.id = d.volunteer_id
        """;

    private Dispatch dto(java.sql.ResultSet rs, UUID me) throws java.sql.SQLException {
        UUID req = rs.getObject("requester_id", UUID.class), vol = rs.getObject("volunteer_id", UUID.class);
        return new Dispatch(rs.getObject("id", UUID.class), rs.getString("kind"), rs.getString("urgency"), rs.getString("title"), rs.getString("details"),
            rs.getString("area"), rs.getString("status"), req, rs.getString("rname"), vol, rs.getString("vname"), rs.getTimestamp("created_at").toInstant(),
            req.equals(me), me.equals(vol));
    }

    @Transactional(readOnly = true)
    public List<Dispatch> listDispatch(UUID me, String scope) {
        String where = "mine".equals(scope) ? "(d.requester_id = :me OR d.volunteer_id = :me)" : "d.status = 'OPEN'";
        return jdbc.sql(DSQL + " WHERE " + where + " ORDER BY (d.urgency = 'URGENT') DESC, d.created_at DESC LIMIT 100").param("me", me).query((rs, i) -> dto(rs, me)).list();
    }

    @Transactional
    public Dispatch createDispatch(UUID me, DispatchRequest r) {
        Map<String, String> e = new LinkedHashMap<>();
        String title = clean(r.title()), details = clean(r.details()), area = clean(r.area());
        String kind = r.kind() == null ? "" : r.kind().toUpperCase(Locale.ROOT);
        if (!KINDS.contains(kind)) e.put("kind", "Choose what you need");
        if (title.length() < 5 || title.length() > 100) e.put("title", "Say what you need in 5 to 100 characters");
        if (details.length() > 600) e.put("details", "Keep the details under 600 characters");
        if (area.length() > 120) e.put("area", "Keep the area short");
        for (String[] f : new String[][] {{"title", title}, {"details", details}, {"area", area}}) {
            if (!e.containsKey(f[0]) && LONG_DIGITS.matcher(f[1]).find()) e.put(f[0], "Remove phone numbers and ID numbers. Volunteers will message you here");
        }
        if (!e.isEmpty()) throw new FieldValidationException(e);
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO dispatch_requests (id, requester_id, kind, urgency, title, details, area) VALUES (:id, :r, :k, :u, :t, :d, :a)")
            .param("id", id).param("r", me).param("k", kind).param("u", "URGENT".equalsIgnoreCase(r.urgency()) ? "URGENT" : "NORMAL")
            .param("t", title).param("d", details.isEmpty() ? null : details).param("a", area.isEmpty() ? null : area).update();
        return one(me, id);
    }

    @Transactional
    public Dispatch claim(UUID me, UUID id) {
        Map<String, Object> d = lock(id);
        if (me.equals(d.get("requester_id"))) throw new ApiException(HttpStatus.FORBIDDEN, "You cannot take your own request");
        if (!"OPEN".equals(d.get("status"))) throw new ApiException(HttpStatus.CONFLICT, "Someone has already taken this request");
        jdbc.sql("UPDATE dispatch_requests SET status = 'CLAIMED', volunteer_id = :v, claimed_at = now() WHERE id = :id").param("v", me).param("id", id).update();
        String who = jdbc.sql("SELECT display_name FROM users WHERE id = :u").param("u", me).query(String.class).single();
        notify((UUID) d.get("requester_id"), "DISPATCH", who + " can help: " + d.get("title"), "Open Volunteer help to message them.");
        return one(me, id);
    }

    @Transactional
    public Dispatch finish(UUID me, UUID id) {
        Map<String, Object> d = lock(id);
        boolean req = me.equals(d.get("requester_id")), vol = me.equals(d.get("volunteer_id"));
        if (!req && !vol) throw new ApiException(HttpStatus.FORBIDDEN, "Only the person asking or the volunteer can finish this");
        if (!"CLAIMED".equals(d.get("status"))) throw new ApiException(HttpStatus.CONFLICT, "This request is not in progress");
        jdbc.sql("UPDATE dispatch_requests SET status = 'DONE', done_at = now() WHERE id = :id").param("id", id).update();
        UUID other = req ? (UUID) d.get("volunteer_id") : (UUID) d.get("requester_id");
        notify(other, "DISPATCH", "Marked as done: " + d.get("title"), "Thank you for helping each other.");
        return one(me, id);
    }

    @Transactional
    public Dispatch cancel(UUID me, UUID id) {
        Map<String, Object> d = lock(id);
        if (!me.equals(d.get("requester_id"))) throw new ApiException(HttpStatus.FORBIDDEN, "Only the person asking can cancel");
        String st = (String) d.get("status");
        if (!"OPEN".equals(st) && !"CLAIMED".equals(st)) throw new ApiException(HttpStatus.CONFLICT, "This request is already closed");
        jdbc.sql("UPDATE dispatch_requests SET status = 'CANCELLED' WHERE id = :id").param("id", id).update();
        if (d.get("volunteer_id") != null) notify((UUID) d.get("volunteer_id"), "DISPATCH", "Request cancelled: " + d.get("title"), "The person no longer needs help. Thank you for offering.");
        return one(me, id);
    }

    private Dispatch one(UUID me, UUID id) {
        return jdbc.sql(DSQL + " WHERE d.id = :id").param("id", id).query((rs, i) -> dto(rs, me)).single();
    }

    private Map<String, Object> lock(UUID id) {
        List<Map<String, Object>> rows = jdbc.sql("SELECT * FROM dispatch_requests WHERE id = :id FOR UPDATE").param("id", id).query().listOfRows();
        if (rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Request not found");
        return rows.get(0);
    }

    // ---------- check-ins ----------
    @Transactional
    public Mine checkin(UUID me, CheckinRequest r) {
        int mood = r.mood() == null ? 0 : r.mood();
        if (mood < 1 || mood > 5) throw new FieldValidationException(Map.of("mood", "Pick how you feel"));
        String note = clean(r.note());
        if (note.length() > 200) throw new FieldValidationException(Map.of("note", "Keep it under 200 characters"));
        if (LONG_DIGITS.matcher(note).find()) throw new FieldValidationException(Map.of("note", "Please do not include phone or ID numbers"));
        jdbc.sql("INSERT INTO checkins (user_id, mood, note, shared, created_at) VALUES (:u, :m, :n, :s, clock_timestamp())")
            .param("u", me).param("m", mood).param("n", note.isEmpty() ? null : note).param("s", !Boolean.FALSE.equals(r.shared())).update();
        return mine(me);
    }

    @Transactional(readOnly = true)
    public Mine mine(UUID me) {
        List<Checkin> recent = jdbc.sql("SELECT id, mood, note, created_at FROM checkins WHERE user_id = :u ORDER BY created_at DESC LIMIT 14").param("u", me)
            .query((rs, i) -> new Checkin(rs.getObject(1, UUID.class), rs.getInt(2), rs.getString(3), rs.getTimestamp(4).toInstant())).list();
        List<java.sql.Date> days = jdbc.sql("SELECT DISTINCT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS d FROM checkins WHERE user_id = :u ORDER BY d DESC LIMIT 60").param("u", me)
            .query((rs, i) -> rs.getDate(1)).list();
        java.time.LocalDate today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata"));
        int streak = 0; java.time.LocalDate expect = days.isEmpty() || !days.get(0).toLocalDate().equals(today) ? today.minusDays(1) : today;
        for (java.sql.Date d : days) { if (d.toLocalDate().equals(expect)) { streak++; expect = expect.minusDays(1); } else if (d.toLocalDate().isBefore(expect)) break; }
        return new Mine(recent, streak, !days.isEmpty() && days.get(0).toLocalDate().equals(today));
    }

    /** The latest shared check-in from each person who shares a community with me, from the last two days. */
    @Transactional(readOnly = true)
    public List<CircleItem> circle(UUID me) {
        return jdbc.sql("""
            SELECT DISTINCT ON (c.user_id) c.id, c.user_id, u.display_name, c.mood, c.note, c.created_at,
                   (SELECT count(*) FROM checkin_cheers k WHERE k.checkin_id = c.id) AS cheers,
                   EXISTS (SELECT 1 FROM checkin_cheers k WHERE k.checkin_id = c.id AND k.from_user = :me) AS cheered
            FROM checkins c JOIN users u ON u.id = c.user_id
            WHERE c.shared AND c.user_id <> :me AND c.created_at >= now() - interval '48 hours'
              AND EXISTS (SELECT 1 FROM memberships a JOIN memberships b ON b.community_id = a.community_id WHERE a.user_id = :me AND b.user_id = c.user_id)
            ORDER BY c.user_id, c.created_at DESC
            """).param("me", me).query((rs, i) -> new CircleItem(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3), rs.getInt(4), rs.getString(5),
                rs.getTimestamp(6).toInstant(), rs.getInt(7), rs.getBoolean(8), rs.getInt(4) <= 2)).list().stream()
            .sorted(Comparator.comparing(CircleItem::needsKindWord).reversed().thenComparing(CircleItem::createdAt, Comparator.reverseOrder())).toList();
    }

    @Transactional
    public void cheer(UUID me, UUID checkinId) {
        List<Map<String, Object>> rows = jdbc.sql("SELECT user_id, shared FROM checkins WHERE id = :id").param("id", checkinId).query().listOfRows();
        if (rows.isEmpty() || !Boolean.TRUE.equals(rows.get(0).get("shared"))) throw new ApiException(HttpStatus.NOT_FOUND, "Check-in not found");
        UUID owner = (UUID) rows.get(0).get("user_id");
        if (owner.equals(me)) throw new ApiException(HttpStatus.FORBIDDEN, "You cannot cheer for yourself");
        boolean shared = jdbc.sql("SELECT EXISTS (SELECT 1 FROM memberships a JOIN memberships b ON b.community_id = a.community_id WHERE a.user_id = :a AND b.user_id = :b)")
            .param("a", me).param("b", owner).query(Boolean.class).single();
        if (!shared) throw new ApiException(HttpStatus.FORBIDDEN, "You can cheer for people in your communities");
        int n = jdbc.sql("INSERT INTO checkin_cheers (checkin_id, from_user) VALUES (:c, :u) ON CONFLICT DO NOTHING").param("c", checkinId).param("u", me).update();
        if (n > 0) {
            String who = jdbc.sql("SELECT display_name FROM users WHERE id = :u").param("u", me).query(String.class).single();
            notify(owner, "CHECKIN", who + " is thinking of you", "Thank you for sharing how you feel. You are not alone.");
        }
    }

    private void notify(UUID user, String kind, String title, String body) {
        jdbc.sql("INSERT INTO notifications (user_id, kind, title, body) VALUES (:u, :k, :t, :b)")
            .param("u", user).param("k", kind).param("t", trunc(title, 160)).param("b", trunc(body, 500)).update();
    }

    private static String clean(String s) { return s == null ? "" : s.strip().replaceAll("\\s+", " "); }
    private static String trunc(String s, int max) { return s == null || s.length() <= max ? s : s.substring(0, max); }
}
