package com.medcord.outbreak;

import com.medcord.common.ApiException;
import com.medcord.outbreak.OutbreakDtos.*;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Outbreak Radar. After every new case (and on a timer) it groups the last 72 hours of cases in a region by
 * symptom group. When a group reaches its threshold it opens an alert and tells doctors, admins and the
 * health workers of that area. Everything is rule-based, so each alert can be explained.
 */
@Service
public class OutbreakService {
    private static final Logger log = LoggerFactory.getLogger(OutbreakService.class);
    public static final int WINDOW_HOURS = 72;
    private static final int BUCKET_HOURS = 12;

    private final JdbcClient jdbc;

    public OutbreakService(JdbcClient jdbc) { this.jdbc = jdbc; }

    // ---------- detection ----------

    /** Re-evaluates one region. Safe to call often; it only writes when something changed. */
    @Transactional
    public void evaluateRegion(UUID regionId) {
        if (regionId == null) return;
        List<Map<String, Object>> rows = jdbc.sql("""
            SELECT id, chief_complaint, urgency,
                   CASE WHEN vitals->>'temperature' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (vitals->>'temperature')::numeric END AS temp
            FROM cases
            WHERE region_id = :r AND created_at >= now() - make_interval(hours => :h)
            """).param("r", regionId).param("h", WINDOW_HOURS).query().listOfRows();

        Map<Syndrome, List<UUID>> groups = new EnumMap<>(Syndrome.class);
        for (Syndrome s : Syndrome.values()) groups.put(s, new ArrayList<>());
        for (Map<String, Object> r : rows) {
            Double temp = r.get("temp") instanceof BigDecimal b ? b.doubleValue() : null;
            for (Syndrome s : Syndrome.classify((String) r.get("chief_complaint"), temp)) groups.get(s).add((UUID) r.get("id"));
        }

        for (Syndrome s : Syndrome.values()) {
            List<UUID> ids = groups.get(s);
            Optional<UUID> live = jdbc.sql("SELECT id FROM outbreak_alerts WHERE region_id = :r AND syndrome = :s AND status <> 'RESOLVED'")
                .param("r", regionId).param("s", s.name()).query(UUID.class).optional();

            if (live.isEmpty()) {
                if (ids.size() < s.threshold()) continue;
                UUID id = UUID.randomUUID();
                jdbc.sql("INSERT INTO outbreak_alerts (id, region_id, syndrome) VALUES (:id, :r, :s)")
                    .param("id", id).param("r", regionId).param("s", s.name()).update();
                refresh(id, ids);
                setSeverity(id, s);
                notifyStaffAndArea(id, regionId, s, false);
                log.info("outbreak alert opened: region={} syndrome={} cases={}", regionId, s, ids.size());
            } else if (ids.isEmpty()) {
                // No similar case in the window any more: the cluster has faded.
                jdbc.sql("UPDATE outbreak_alerts SET status = 'RESOLVED', resolved_at = now(), updated_at = now() WHERE id = :id")
                    .param("id", live.get()).update();
            } else {
                // Keep the alert while any case remains (so it does not flicker), and refresh its numbers.
                refresh(live.get(), ids);
                if (setSeverity(live.get(), s)) notifyStaffAndArea(live.get(), regionId, s, true);
            }
        }
    }

    /** Timer entry point: every region that has recent cases or a live alert. */
    @Transactional
    public int evaluateAll() {
        List<UUID> regions = jdbc.sql("""
            SELECT region_id FROM cases WHERE region_id IS NOT NULL AND created_at >= now() - make_interval(hours => :h)
            UNION SELECT region_id FROM outbreak_alerts WHERE status <> 'RESOLVED'
            """).param("h", WINDOW_HOURS).query(UUID.class).list();
        for (UUID r : regions) evaluateRegion(r);
        return regions.size();
    }

    private void refresh(UUID alertId, List<UUID> caseIds) {
        jdbc.sql("DELETE FROM outbreak_alert_cases WHERE alert_id = :a").param("a", alertId).update();
        for (UUID c : caseIds) {
            jdbc.sql("INSERT INTO outbreak_alert_cases (alert_id, case_id) VALUES (:a, :c) ON CONFLICT DO NOTHING").param("a", alertId).param("c", c).update();
        }
        jdbc.sql("""
            UPDATE outbreak_alerts a SET case_count = s.n, red_count = s.red, first_case_at = s.first, last_case_at = s.last,
                   is_demo = s.demo, updated_at = now()
            FROM (SELECT count(*) AS n, count(*) FILTER (WHERE c.urgency = 'RED') AS red, min(c.created_at) AS first,
                         max(c.created_at) AS last, coalesce(bool_and(c.is_demo), false) AS demo
                  FROM outbreak_alert_cases l JOIN cases c ON c.id = l.case_id WHERE l.alert_id = :a) s
            WHERE a.id = :a AND s.n > 0
            """).param("a", alertId).update();
    }

    /** ALERT when the cluster has doubled its threshold or has two or more urgent cases; otherwise WATCH. Returns true if it just rose to ALERT. */
    private boolean setSeverity(UUID alertId, Syndrome s) {
        Map<String, Object> a = jdbc.sql("SELECT case_count, red_count, severity FROM outbreak_alerts WHERE id = :id").param("id", alertId).query().singleRow();
        int n = ((Number) a.get("case_count")).intValue(), red = ((Number) a.get("red_count")).intValue();
        String now = n >= s.threshold() * 2 || red >= 2 ? "ALERT" : "WATCH";
        String before = (String) a.get("severity");
        if (!now.equals(before)) {
            jdbc.sql("UPDATE outbreak_alerts SET severity = :v, updated_at = now() WHERE id = :id").param("v", now).param("id", alertId).update();
        }
        return "ALERT".equals(now) && "WATCH".equals(before);
    }

    private void notifyStaffAndArea(UUID alertId, UUID regionId, Syndrome s, boolean escalated) {
        Map<String, Object> a = jdbc.sql("""
            SELECT a.case_count, a.severity, a.is_demo, r.name FROM outbreak_alerts a JOIN regions r ON r.id = a.region_id WHERE a.id = :id
            """).param("id", alertId).query().singleRow();
        int n = ((Number) a.get("case_count")).intValue();
        String suffix = Boolean.TRUE.equals(a.get("is_demo")) ? " (demo)" : "";
        String where = String.valueOf(a.get("name"));
        String title = (escalated ? "Outbreak growing: " : "Possible outbreak: ") + s.label() + " near " + where + suffix;
        String body = n + " similar cases in " + WINDOW_HOURS + " hours (" + a.get("severity") + "). Open the Outbreak Radar for guidance.";
        jdbc.sql("""
            INSERT INTO notifications (user_id, kind, title, body)
            SELECT u.id, 'OUTBREAK', :t, :b FROM users u
            WHERE u.status = 'ACTIVE' AND (u.platform_role = 'ADMIN' OR EXISTS (
                SELECT 1 FROM professional_profiles p WHERE p.user_id = u.id AND p.verification_status = 'APPROVED'))
            LIMIT 200
            """).param("t", trunc(title, 160)).param("b", trunc(body, 500)).update();
        jdbc.sql("""
            INSERT INTO notifications (user_id, kind, title, body)
            SELECT h.user_id, 'OUTBREAK', :t, :b FROM health_worker_profiles h JOIN users u ON u.id = h.user_id
            WHERE h.region_id = :r AND u.status = 'ACTIVE' AND u.platform_role <> 'ADMIN'
              AND NOT EXISTS (SELECT 1 FROM professional_profiles p WHERE p.user_id = u.id AND p.verification_status = 'APPROVED')
            LIMIT 200
            """).param("t", trunc("Health notice: " + s.label() + " cases near you" + suffix, 160))
            .param("b", "Several similar cases were reported in your area. Take care and follow the guidance on the Radar.")
            .param("r", regionId).update();
    }

    // ---------- reads ----------

    @Transactional(readOnly = true)
    public RadarDto radar(UUID me) {
        List<AlertDto> alerts = jdbc.sql(SELECT_ALERT + """
            WHERE a.status <> 'RESOLVED' OR a.resolved_at >= now() - interval '7 days'
            ORDER BY (a.status = 'RESOLVED'), (a.severity = 'ALERT') DESC, a.updated_at DESC LIMIT 60
            """).query(this::mapAlert).list();
        List<RegionPoint> regions = jdbc.sql("""
            SELECT r.id, r.name, r.district, r.state, r.lat, r.lng,
                   (SELECT count(*) FROM cases c WHERE c.region_id = r.id AND c.created_at >= now() - make_interval(hours => :h)) AS n
            FROM regions r ORDER BY r.name
            """).param("h", WINDOW_HOURS).query((rs, i) -> new RegionPoint(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getString("district"), rs.getString("state"), dbl(rs.getBigDecimal("lat")), dbl(rs.getBigDecimal("lng")), rs.getInt("n"))).list();
        boolean admin = isAdmin(me);
        return new RadarDto(alerts, regions, WINDOW_HOURS, admin || isDoctor(me), admin);
    }

    @Transactional(readOnly = true)
    public AlertDetail detail(UUID me, UUID id) {
        AlertDto a = find(id);
        Syndrome s = Syndrome.valueOf(a.syndrome());
        boolean staff = isAdmin(me) || isDoctor(me);
        List<ClusterCase> cases = List.of();
        List<Integer> timeline = new ArrayList<>(Collections.nCopies(WINDOW_HOURS / BUCKET_HOURS, 0));
        if (staff) {
            cases = jdbc.sql("""
                SELECT c.village, c.patient_age, c.patient_sex, c.urgency, left(c.chief_complaint, 90) AS summary, c.created_at
                FROM outbreak_alert_cases l JOIN cases c ON c.id = l.case_id WHERE l.alert_id = :a ORDER BY c.created_at DESC
                """).param("a", id).query((rs, i) -> new ClusterCase(rs.getString("village"), (Integer) rs.getObject("patient_age"),
                    rs.getString("patient_sex"), rs.getString("urgency"), rs.getString("summary"), rs.getTimestamp("created_at").toInstant())).list();
        }
        // Newest bucket last, so the chart reads left (oldest) to right (now).
        Instant now = Instant.now();
        for (Instant at : jdbc.sql("SELECT c.created_at FROM outbreak_alert_cases l JOIN cases c ON c.id = l.case_id WHERE l.alert_id = :a")
                .param("a", id).query((rs, i) -> rs.getTimestamp("created_at").toInstant()).list()) {
            long hoursAgo = Math.max(0, java.time.Duration.between(at, now).toHours());
            int idx = timeline.size() - 1 - (int) Math.min(timeline.size() - 1, hoursAgo / BUCKET_HOURS);
            timeline.set(idx, timeline.get(idx) + 1);
        }
        return new AlertDetail(a, s.guidance(), Syndrome.DISCLAIMER, staff, cases, timeline, BUCKET_HOURS);
    }

    // ---------- actions ----------

    @Transactional
    public AlertDto acknowledge(UUID me, UUID id, String note) {
        requireStaff(me);
        AlertDto a = find(id);
        if ("RESOLVED".equals(a.status())) throw new ApiException(HttpStatus.CONFLICT, "This alert is already resolved");
        jdbc.sql("UPDATE outbreak_alerts SET status = 'ACKNOWLEDGED', acknowledged_by = :u, acknowledged_at = now(), note = :n, updated_at = now() WHERE id = :id")
            .param("u", me).param("n", note == null || note.isBlank() ? null : note.trim()).param("id", id).update();
        return find(id);
    }

    @Transactional
    public AlertDto resolve(UUID me, UUID id) {
        if (!isAdmin(me)) throw new ApiException(HttpStatus.FORBIDDEN, "Only an admin can close an alert");
        AlertDto a = find(id);
        if ("RESOLVED".equals(a.status())) return a;
        jdbc.sql("UPDATE outbreak_alerts SET status = 'RESOLVED', resolved_by = :u, resolved_at = now(), updated_at = now() WHERE id = :id")
            .param("u", me).param("id", id).update();
        return find(id);
    }

    // ---------- helpers ----------

    private static final String SELECT_ALERT = """
        SELECT a.*, r.name AS region_name, r.district, r.state, r.lat, r.lng, u.display_name AS ack_name
        FROM outbreak_alerts a JOIN regions r ON r.id = a.region_id LEFT JOIN users u ON u.id = a.acknowledged_by
        """;

    private AlertDto find(UUID id) {
        return jdbc.sql(SELECT_ALERT + " WHERE a.id = :id").param("id", id).query(this::mapAlert).optional()
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Alert not found"));
    }

    private AlertDto mapAlert(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        Syndrome s = Syndrome.valueOf(rs.getString("syndrome"));
        return new AlertDto(rs.getObject("id", UUID.class), rs.getObject("region_id", UUID.class), rs.getString("region_name"),
            rs.getString("district"), rs.getString("state"), dbl(rs.getBigDecimal("lat")), dbl(rs.getBigDecimal("lng")),
            s.name(), s.label(), rs.getString("severity"), rs.getString("status"), rs.getInt("case_count"), rs.getInt("red_count"),
            s.threshold(), inst(rs.getTimestamp("first_case_at")), inst(rs.getTimestamp("last_case_at")), rs.getBoolean("is_demo"),
            inst(rs.getTimestamp("acknowledged_at")), rs.getString("ack_name"), rs.getString("note"),
            inst(rs.getTimestamp("created_at")), inst(rs.getTimestamp("resolved_at")));
    }

    private static Instant inst(Timestamp t) { return t == null ? null : t.toInstant(); }
    private static Double dbl(BigDecimal b) { return b == null ? null : b.doubleValue(); }
    private static String trunc(String s, int max) { return s == null || s.length() <= max ? s : s.substring(0, max); }

    boolean isAdmin(UUID me) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM users WHERE id = :u AND platform_role = 'ADMIN' AND status = 'ACTIVE')")
            .param("u", me).query(Boolean.class).single();
    }

    boolean isDoctor(UUID me) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM users u JOIN professional_profiles p ON p.user_id = u.id WHERE u.id = :u AND u.status = 'ACTIVE' AND p.verification_status = 'APPROVED')")
            .param("u", me).query(Boolean.class).single();
    }

    void requireStaff(UUID me) {
        if (!isAdmin(me) && !isDoctor(me)) throw new ApiException(HttpStatus.FORBIDDEN, "Only verified doctors and admins can do this");
    }
}
