package com.medcord.fundraiser;

import com.medcord.common.ApiException;
import com.medcord.common.FieldValidationException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Care Fund. A verified doctor or a health worker raises money for a patient inside a community; members give small amounts.
 * Doctors' and admins' fundraisers go live at once. A health worker's waits until a verified doctor or an admin confirms it.
 * Payment is simulated in this demo: contributions are recorded with a reference but no real money moves.
 */
@Service
public class FundraiserService {
    public record Card(UUID id, UUID communityId, String communityName, UUID caseId, String title, String beneficiary, String need, long goalAmount,
                       long raisedAmount, int supporters, String status, String organiserName, boolean organiserDoctor, String verifiedByName,
                       LocalDate deadline, Integer daysLeft, Instant createdAt) {}
    public record Update(UUID id, String authorName, String kind, String body, Instant createdAt) {}
    public record Supporter(String name, long amount, String message, Instant createdAt) {}
    public record Detail(Card card, String story, String rejectReason, List<Update> updates, List<Supporter> recent,
                         boolean member, boolean organiser, boolean canVerify, boolean canManage, boolean canContribute, String blockedReason, long myTotal) {}
    public record Summary(long totalRaised, long active, long supporters, long fundedCount) {}
    public record CreateRequest(UUID communityId, UUID caseId, String title, String story, String beneficiary, String need, Long goalAmount, LocalDate deadline) {}
    public record ContributeRequest(Long amount, Boolean anonymous, String message) {}
    public record UpdateRequest(String body, String kind) {}
    public record ReasonRequest(String reason) {}

    private static final Set<String> NEEDS = Set.of("MEDICINE", "SURGERY", "TESTS", "TRANSPORT", "OTHER");
    /** A run of 8+ digits looks like a phone or ID number. We never want those on a public page. */
    private static final Pattern LONG_DIGITS = Pattern.compile("\\d[\\d\\s-]{6,}\\d");

    private final JdbcClient jdbc;

    public FundraiserService(JdbcClient jdbc) { this.jdbc = jdbc; }

    // ---------- who is who ----------
    private boolean isAdmin(UUID me) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM users WHERE id = :u AND platform_role = 'ADMIN' AND status = 'ACTIVE')").param("u", me).query(Boolean.class).single();
    }
    private boolean isDoctor(UUID me) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM users u JOIN professional_profiles p ON p.user_id = u.id WHERE u.id = :u AND u.status = 'ACTIVE' AND p.verification_status = 'APPROVED')").param("u", me).query(Boolean.class).single();
    }
    private boolean isWorker(UUID me) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM health_worker_profiles h JOIN users u ON u.id = h.user_id WHERE h.user_id = :u AND u.status = 'ACTIVE')").param("u", me).query(Boolean.class).single();
    }
    private boolean isMember(UUID me, UUID community) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM memberships WHERE user_id = :u AND community_id = :c)").param("u", me).param("c", community).query(Boolean.class).single();
    }
    private boolean staff(UUID me) { return isAdmin(me) || isDoctor(me); }

    // ---------- reading ----------
    private static final String CARD_SQL = """
        SELECT f.id, f.community_id, c.name AS community_name, f.case_id, f.title, f.beneficiary, f.need, f.goal_amount, f.raised_amount, f.supporters,
               f.status, o.display_name AS organiser_name, f.deadline, f.created_at, v.display_name AS verifier_name,
               EXISTS (SELECT 1 FROM professional_profiles p WHERE p.user_id = f.organiser_id AND p.verification_status = 'APPROVED') AS organiser_doctor
        FROM fundraisers f JOIN communities c ON c.id = f.community_id JOIN users o ON o.id = f.organiser_id LEFT JOIN users v ON v.id = f.verified_by
        """;
    private static final String VISIBLE = """
        (c.visibility = 'PUBLIC' OR EXISTS (SELECT 1 FROM memberships m WHERE m.community_id = c.id AND m.user_id = :me) OR :admin)
        """;

    private Card card(ResultSet rs, int i) throws SQLException {
        java.sql.Date d = rs.getDate("deadline");
        LocalDate dl = d == null ? null : d.toLocalDate();
        Timestamp ts = rs.getTimestamp("created_at");
        return new Card(rs.getObject("id", UUID.class), rs.getObject("community_id", UUID.class), rs.getString("community_name"), rs.getObject("case_id", UUID.class),
            rs.getString("title"), rs.getString("beneficiary"), rs.getString("need"), rs.getLong("goal_amount"), rs.getLong("raised_amount"), rs.getInt("supporters"),
            rs.getString("status"), rs.getString("organiser_name"), rs.getBoolean("organiser_doctor"), rs.getString("verifier_name"), dl,
            dl == null ? null : (int) ChronoUnit.DAYS.between(LocalDate.now(), dl), ts.toInstant());
    }

    @Transactional(readOnly = true)
    public List<Card> list(UUID me, UUID communityId, String scope) {
        boolean admin = isAdmin(me), staff = admin || isDoctor(me);
        String sc = scope == null ? "live" : scope;
        String filter = switch (sc) {
            case "mine" -> "f.organiser_id = :me";
            case "pending" -> staff ? "f.status = 'PENDING'" : "f.status = 'PENDING' AND f.organiser_id = :me";
            case "funded" -> "f.status IN ('FUNDED','CLOSED')";
            default -> "(f.status IN ('ACTIVE','FUNDED') OR (f.status = 'PENDING' AND f.organiser_id = :me))";
        };
        return jdbc.sql(CARD_SQL + " WHERE " + VISIBLE + " AND " + filter + (communityId == null ? "" : " AND f.community_id = :cid")
                + " ORDER BY (f.status = 'ACTIVE') DESC, f.created_at DESC LIMIT 100")
            .param("me", me).param("admin", admin).param("cid", communityId, java.sql.Types.OTHER).query(this::card).list();
    }

    @Transactional(readOnly = true)
    public Summary summary(UUID me) {
        Map<String, Object> r = jdbc.sql("""
            SELECT coalesce(sum(f.raised_amount),0) AS raised, count(*) FILTER (WHERE f.status = 'ACTIVE') AS active,
                   coalesce(sum(f.supporters),0) AS sup, count(*) FILTER (WHERE f.status IN ('FUNDED','CLOSED') AND f.raised_amount >= f.goal_amount) AS funded
            FROM fundraisers f JOIN communities c ON c.id = f.community_id WHERE f.status IN ('ACTIVE','FUNDED','CLOSED') AND """ + VISIBLE)
            .param("me", me).param("admin", isAdmin(me)).query().singleRow();
        return new Summary(((Number) r.get("raised")).longValue(), ((Number) r.get("active")).longValue(), ((Number) r.get("sup")).longValue(), ((Number) r.get("funded")).longValue());
    }

    @Transactional(readOnly = true)
    public Detail detail(UUID me, UUID id) {
        boolean admin = isAdmin(me);
        Card c = jdbc.sql(CARD_SQL + " WHERE f.id = :id AND " + VISIBLE).param("id", id).param("me", me).param("admin", admin).query(this::card).optional()
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Fundraiser not found"));
        Map<String, Object> raw = jdbc.sql("SELECT story, reject_reason, organiser_id FROM fundraisers WHERE id = :id").param("id", id).query().singleRow();
        UUID organiserId = (UUID) raw.get("organiser_id");
        boolean organiser = organiserId.equals(me), member = admin || isMember(me, c.communityId()), staff = admin || isDoctor(me);
        boolean canVerify = "PENDING".equals(c.status()) && staff && (admin || !organiser);
        boolean canManage = (organiser || admin) && ("ACTIVE".equals(c.status()) || "FUNDED".equals(c.status()) || "CLOSED".equals(c.status()));
        String blocked = null;
        if (!"ACTIVE".equals(c.status())) blocked = "FUNDED".equals(c.status()) ? "This fundraiser has reached its goal. Thank you!" : "This fundraiser is not open for contributions.";
        else if (c.deadline() != null && c.deadline().isBefore(LocalDate.now())) blocked = "This fundraiser has ended.";
        else if (organiser) blocked = "You are raising this fund, so you cannot contribute to it.";
        else if (!member) blocked = "Join this community to contribute.";
        List<Update> updates = jdbc.sql("""
            SELECT u.id, a.display_name, u.kind, u.body, u.created_at FROM fundraiser_updates u JOIN users a ON a.id = u.author_id
            WHERE u.fundraiser_id = :id ORDER BY u.created_at DESC LIMIT 50""").param("id", id)
            .query((rs, i) -> new Update(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getString(4), rs.getTimestamp(5).toInstant())).list();
        List<Supporter> recent = jdbc.sql("""
            SELECT CASE WHEN k.anonymous THEN NULL ELSE d.display_name END, k.amount, k.message, k.created_at
            FROM fundraiser_contributions k JOIN users d ON d.id = k.donor_id WHERE k.fundraiser_id = :id ORDER BY k.created_at DESC LIMIT 20""").param("id", id)
            .query((rs, i) -> new Supporter(rs.getString(1) == null ? "Anonymous" : rs.getString(1), rs.getLong(2), rs.getString(3), rs.getTimestamp(4).toInstant())).list();
        long mine = jdbc.sql("SELECT coalesce(sum(amount),0) FROM fundraiser_contributions WHERE fundraiser_id = :id AND donor_id = :me").param("id", id).param("me", me).query(Long.class).single();
        String rejectReason = (String) raw.get("reject_reason");
        return new Detail(c, (String) raw.get("story"), organiser || admin ? rejectReason : null, updates, recent, member, organiser, canVerify, canManage, blocked == null, blocked, mine);
    }

    // ---------- creating ----------
    @Transactional
    public Card create(UUID me, CreateRequest r) {
        Map<String, String> e = new LinkedHashMap<>();
        String title = clean(r.title()), story = clean(r.story()), who = clean(r.beneficiary());
        if (r.communityId() == null) e.put("communityId", "Choose a community");
        if (title.length() < 5) e.put("title", "Give it a short, clear title (at least 5 characters)");
        if (title.length() > 120) e.put("title", "Keep the title under 120 characters");
        if (who.isEmpty()) e.put("beneficiary", "Who is it for? First name and age is enough");
        if (who.length() > 80) e.put("beneficiary", "Keep this short");
        if (story.length() < 30) e.put("story", "Tell the community what happened and what is needed (at least 30 characters)");
        if (story.length() > 2000) e.put("story", "Keep the story under 2000 characters");
        String need = r.need() == null ? "" : r.need().toUpperCase(Locale.ROOT);
        if (!NEEDS.contains(need)) e.put("need", "Choose what the money is for");
        if (r.goalAmount() == null || r.goalAmount() < 100 || r.goalAmount() > 5_000_000) e.put("goalAmount", "Enter a goal between ₹100 and ₹50,00,000");
        if (r.deadline() != null && !r.deadline().isAfter(LocalDate.now())) e.put("deadline", "Pick a date in the future");
        for (String[] f : new String[][] {{"title", title}, {"story", story}, {"beneficiary", who}}) {
            if (!e.containsKey(f[0]) && LONG_DIGITS.matcher(f[1]).find()) e.put(f[0], "Remove phone, ID or account numbers. Never share private details here");
        }
        if (!e.isEmpty()) throw new FieldValidationException(e);

        boolean admin = isAdmin(me), staff = admin || isDoctor(me);
        if (!staff && !isWorker(me)) throw new ApiException(HttpStatus.FORBIDDEN, "Only doctors, ASHA and health workers can raise a fundraiser");
        Optional<String> comm = jdbc.sql("SELECT name FROM communities WHERE id = :c").param("c", r.communityId()).query(String.class).optional();
        if (comm.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Community not found");
        if (!admin && !isMember(me, r.communityId())) throw new ApiException(HttpStatus.FORBIDDEN, "Join the community first, then raise the fundraiser there");
        if (r.caseId() != null) {
            boolean ok = jdbc.sql("SELECT EXISTS (SELECT 1 FROM cases WHERE id = :c AND (reporter_id = :u OR :s))").param("c", r.caseId()).param("u", me).param("s", staff).query(Boolean.class).single();
            if (!ok) throw new ApiException(HttpStatus.FORBIDDEN, "You can only link a case you reported");
        }
        UUID id = UUID.randomUUID();
        String status = staff ? "ACTIVE" : "PENDING";
        jdbc.sql("""
            INSERT INTO fundraisers (id, community_id, case_id, organiser_id, title, story, beneficiary, need, goal_amount, status, verified_by, verified_at, deadline)
            VALUES (:id, :c, :case, :o, :t, :s, :b, :n, :g, :st, :vb, :va, :d)""")
            .param("id", id).param("c", r.communityId()).param("case", r.caseId(), java.sql.Types.OTHER).param("o", me).param("t", title).param("s", story)
            .param("b", who).param("n", need).param("g", r.goalAmount()).param("st", status)
            .param("vb", staff ? me : null, java.sql.Types.OTHER).param("va", staff ? Timestamp.from(Instant.now()) : null, java.sql.Types.TIMESTAMP)
            .param("d", r.deadline() == null ? null : java.sql.Date.valueOf(r.deadline()), java.sql.Types.DATE).update();
        if (staff) announce(id, r.communityId(), me, title, comm.get());
        else notifyVerifiers(id, title);
        return one(me, id);
    }

    private Card one(UUID me, UUID id) {
        return jdbc.sql(CARD_SQL + " WHERE f.id = :id").param("id", id).query(this::card).single();
    }

    // ---------- verification ----------
    @Transactional
    public Card verify(UUID me, UUID id) {
        Map<String, Object> f = lock(id);
        if (!"PENDING".equals(f.get("status"))) throw new ApiException(HttpStatus.CONFLICT, "This fundraiser is not waiting for review");
        boolean admin = isAdmin(me);
        if (!admin && !isDoctor(me)) throw new ApiException(HttpStatus.FORBIDDEN, "Only a verified doctor or an admin can approve a fundraiser");
        if (!admin && ((UUID) f.get("organiser_id")).equals(me)) throw new ApiException(HttpStatus.FORBIDDEN, "Another doctor must approve your fundraiser");
        jdbc.sql("UPDATE fundraisers SET status = 'ACTIVE', verified_by = :v, verified_at = now() WHERE id = :id").param("v", me).param("id", id).update();
        UUID community = (UUID) f.get("community_id");
        String name = jdbc.sql("SELECT name FROM communities WHERE id = :c").param("c", community).query(String.class).single();
        announce(id, community, (UUID) f.get("organiser_id"), (String) f.get("title"), name);
        notifyOne((UUID) f.get("organiser_id"), id, "Your fundraiser is approved", "It is now live in the community.");
        return one(me, id);
    }

    @Transactional
    public Card reject(UUID me, UUID id, String reason) {
        Map<String, Object> f = lock(id);
        if (!"PENDING".equals(f.get("status"))) throw new ApiException(HttpStatus.CONFLICT, "This fundraiser is not waiting for review");
        boolean admin = isAdmin(me);
        if (!admin && !isDoctor(me)) throw new ApiException(HttpStatus.FORBIDDEN, "Only a verified doctor or an admin can review a fundraiser");
        String why = clean(reason);
        if (why.length() < 5) throw new FieldValidationException(Map.of("reason", "Tell them briefly what to fix"));
        jdbc.sql("UPDATE fundraisers SET status = 'REJECTED', reject_reason = :r WHERE id = :id").param("r", why.length() > 300 ? why.substring(0, 300) : why).param("id", id).update();
        notifyOne((UUID) f.get("organiser_id"), id, "Your fundraiser needs changes", why);
        return one(me, id);
    }

    // ---------- giving ----------
    @Transactional
    public Detail contribute(UUID me, UUID id, ContributeRequest r) {
        Map<String, Object> f = lock(id);
        long amount = r.amount() == null ? 0 : r.amount();
        if (amount < 10 || amount > 100_000) throw new FieldValidationException(Map.of("amount", "Enter an amount from ₹10 to ₹1,00,000"));
        String msg = r.message() == null ? null : clean(r.message());
        if (msg != null && msg.length() > 200) throw new FieldValidationException(Map.of("message", "Keep the message under 200 characters"));
        if (msg != null && LONG_DIGITS.matcher(msg).find()) throw new FieldValidationException(Map.of("message", "Please do not include phone or ID numbers"));
        UUID community = (UUID) f.get("community_id");
        if (!"ACTIVE".equals(f.get("status"))) throw new ApiException(HttpStatus.CONFLICT, "This fundraiser is not open for contributions");
        java.sql.Date dl = (java.sql.Date) f.get("deadline");
        if (dl != null && dl.toLocalDate().isBefore(LocalDate.now())) throw new ApiException(HttpStatus.CONFLICT, "This fundraiser has ended");
        if (((UUID) f.get("organiser_id")).equals(me)) throw new ApiException(HttpStatus.FORBIDDEN, "You cannot contribute to your own fundraiser");
        if (!isAdmin(me) && !isMember(me, community)) throw new ApiException(HttpStatus.FORBIDDEN, "Join this community to contribute");

        String ref = "DEMO-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
        jdbc.sql("INSERT INTO fundraiser_contributions (fundraiser_id, donor_id, amount, anonymous, message, payment_ref, created_at) VALUES (:f, :d, :a, :an, :m, :p, clock_timestamp())")
            .param("f", id).param("d", me).param("a", amount).param("an", Boolean.TRUE.equals(r.anonymous())).param("m", msg == null || msg.isBlank() ? null : msg).param("p", ref).update();
        long raised = jdbc.sql("SELECT coalesce(sum(amount),0) FROM fundraiser_contributions WHERE fundraiser_id = :f").param("f", id).query(Long.class).single();
        int sup = jdbc.sql("SELECT count(DISTINCT donor_id) FROM fundraiser_contributions WHERE fundraiser_id = :f").param("f", id).query(Integer.class).single();
        long goal = ((Number) f.get("goal_amount")).longValue();
        boolean reached = raised >= goal;
        jdbc.sql("UPDATE fundraisers SET raised_amount = :r, supporters = :s, status = :st WHERE id = :id").param("r", raised).param("s", sup).param("st", reached ? "FUNDED" : "ACTIVE").param("id", id).update();
        UUID organiser = (UUID) f.get("organiser_id");
        String who = Boolean.TRUE.equals(r.anonymous()) ? "Someone" : jdbc.sql("SELECT display_name FROM users WHERE id = :u").param("u", me).query(String.class).single();
        notifyOne(organiser, id, who + " contributed ₹" + amount, "₹" + raised + " raised of ₹" + goal + ".");
        if (reached) {
            notifyOne(organiser, id, "Goal reached: " + f.get("title"), "Thank you to everyone who helped. Post how the money was used when you can.");
            jdbc.sql("""
                INSERT INTO notifications (user_id, kind, title, body, fundraiser_id)
                SELECT DISTINCT donor_id, 'FUNDRAISER', :t, 'You helped make this happen. Thank you.', :f FROM fundraiser_contributions WHERE fundraiser_id = :f AND donor_id <> :o""")
                .param("t", trunc("Goal reached: " + f.get("title"), 160)).param("f", id).param("o", organiser).update();
        }
        return detail(me, id);
    }

    // ---------- updates and closing ----------
    @Transactional
    public Detail postUpdate(UUID me, UUID id, UpdateRequest r) {
        Map<String, Object> f = lock(id);
        if (!((UUID) f.get("organiser_id")).equals(me) && !isAdmin(me)) throw new ApiException(HttpStatus.FORBIDDEN, "Only the person raising the fund can post updates");
        String status = (String) f.get("status");
        if ("PENDING".equals(status) || "REJECTED".equals(status)) throw new ApiException(HttpStatus.CONFLICT, "Updates open once the fundraiser is live");
        String kind = "FUNDS_USED".equalsIgnoreCase(r.kind()) ? "FUNDS_USED" : "UPDATE";
        if ("FUNDS_USED".equals(kind) && !"FUNDED".equals(status) && !"CLOSED".equals(status) && ((Number) f.get("raised_amount")).longValue() == 0)
            throw new ApiException(HttpStatus.CONFLICT, "Nothing has been raised yet");
        String body = clean(r.body());
        if (body.length() < 5 || body.length() > 1000) throw new FieldValidationException(Map.of("body", "Write 5 to 1000 characters"));
        if (LONG_DIGITS.matcher(body).find()) throw new FieldValidationException(Map.of("body", "Remove phone, ID or account numbers"));
        jdbc.sql("INSERT INTO fundraiser_updates (fundraiser_id, author_id, kind, body, created_at) VALUES (:f, :a, :k, :b, clock_timestamp())").param("f", id).param("a", me).param("k", kind).param("b", body).update();
        jdbc.sql("""
            INSERT INTO notifications (user_id, kind, title, body, fundraiser_id)
            SELECT DISTINCT donor_id, 'FUNDRAISER', :t, :b, :f FROM fundraiser_contributions WHERE fundraiser_id = :f AND donor_id <> :a LIMIT 500""")
            .param("t", trunc(("FUNDS_USED".equals(kind) ? "How the money was used: " : "Update: ") + f.get("title"), 160)).param("b", trunc(body, 500)).param("f", id).param("a", me).update();
        return detail(me, id);
    }

    @Transactional
    public Card close(UUID me, UUID id) {
        Map<String, Object> f = lock(id);
        if (!((UUID) f.get("organiser_id")).equals(me) && !isAdmin(me)) throw new ApiException(HttpStatus.FORBIDDEN, "Only the person raising the fund can close it");
        String status = (String) f.get("status");
        if (!"ACTIVE".equals(status) && !"FUNDED".equals(status)) throw new ApiException(HttpStatus.CONFLICT, "This fundraiser is already closed");
        jdbc.sql("UPDATE fundraisers SET status = 'CLOSED', closed_at = now() WHERE id = :id").param("id", id).update();
        return one(me, id);
    }

    // ---------- helpers ----------
    private Map<String, Object> lock(UUID id) {
        List<Map<String, Object>> rows = jdbc.sql("SELECT * FROM fundraisers WHERE id = :id FOR UPDATE").param("id", id).query().listOfRows();
        if (rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "Fundraiser not found");
        return rows.get(0);
    }

    private void announce(UUID fundId, UUID community, UUID organiser, String title, String communityName) {
        jdbc.sql("""
            INSERT INTO notifications (user_id, kind, title, body, fundraiser_id)
            SELECT m.user_id, 'FUNDRAISER', :t, :b, :f FROM memberships m WHERE m.community_id = :c AND m.user_id <> :o LIMIT 500""")
            .param("t", trunc("New fundraiser: " + title, 160)).param("b", trunc("In " + communityName + ". Even a small amount helps.", 500)).param("f", fundId).param("c", community).param("o", organiser).update();
    }

    private void notifyVerifiers(UUID fundId, String title) {
        jdbc.sql("""
            INSERT INTO notifications (user_id, kind, title, body, fundraiser_id)
            SELECT u.id, 'FUNDRAISER', :t, 'A health worker asked for a fundraiser to be confirmed. Please review it.', :f FROM users u
            WHERE u.status = 'ACTIVE' AND (u.platform_role = 'ADMIN' OR EXISTS (SELECT 1 FROM professional_profiles p WHERE p.user_id = u.id AND p.verification_status = 'APPROVED')) LIMIT 100""")
            .param("t", trunc("Please review: " + title, 160)).param("f", fundId).update();
    }

    private void notifyOne(UUID user, UUID fundId, String title, String body) {
        jdbc.sql("INSERT INTO notifications (user_id, kind, title, body, fundraiser_id) VALUES (:u, 'FUNDRAISER', :t, :b, :f)")
            .param("u", user).param("t", trunc(title, 160)).param("b", trunc(body, 500)).param("f", fundId).update();
    }

    private static String clean(String s) { return s == null ? "" : s.strip().replaceAll("\\s+", " "); }
    private static String trunc(String s, int max) { return s == null || s.length() <= max ? s : s.substring(0, max); }
}
