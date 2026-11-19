package com.medcord.cases;

import com.medcord.cases.CaseDtos.*;
import com.medcord.common.ApiException;
import com.medcord.community.Channel;
import com.medcord.community.ChannelRepository;
import com.medcord.outbreak.OutbreakService;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Service
public class CaseService {
    private static final Set<String> OUTCOMES = Set.of("IMPROVED", "SAME", "WORSE");
    private static final Pattern WORD = Pattern.compile("[\\p{L}]{4,}");

    private final JdbcClient jdbc;
    private final ChannelRepository channels;
    private final CaseTriage triage;
    private final OutbreakService outbreaks;
    private final JsonMapper json = JsonMapper.builder().build();

    public CaseService(JdbcClient jdbc, ChannelRepository channels, CaseTriage triage, OutbreakService outbreaks) {
        this.jdbc = jdbc; this.channels = channels; this.triage = triage; this.outbreaks = outbreaks;
    }

    // ---------- submit + routing ----------

    public SubmitResult submit(UUID me, SubmitCaseRequest r) { return submit(me, r, false); }

    /** {@code demo} marks the case so the admin demo can be reset without touching real data. */
    @Transactional
    public SubmitResult submit(UUID me, SubmitCaseRequest r, boolean demo) {
        Map<String, Object> vitals = r.vitals() == null ? Map.of() : r.vitals();
        CaseTriage.Result t = triage.assess(r.chiefComplaint(), r.patientAge(), r.patientSex(), r.village(), vitals);

        UUID caseId = UUID.randomUUID();
        Channel ch = new Channel();
        ch.setType(Channel.Type.CASE);
        ch.setName("case");
        ch.setDmKey("case:" + caseId);
        ch = channels.saveAndFlush(ch);
        jdbc.sql("INSERT INTO dm_participants (channel_id, user_id) VALUES (:c, :u)").param("c", ch.getId()).param("u", me).update();

        // No region given: use the reporter's home area so the impact map counts the case.
        UUID regionId = r.regionId() != null ? r.regionId()
            : jdbc.sql("SELECT region_id FROM health_worker_profiles WHERE user_id = :u").param("u", me).query(UUID.class).optional().orElse(null);
        Instant escalateAt = switch (t.urgency()) {
            case "RED" -> Instant.now().plus(java.time.Duration.ofMinutes(5));
            case "AMBER" -> Instant.now().plus(java.time.Duration.ofMinutes(15));
            default -> null;
        };
        String lang = r.language() == null ? "en" : r.language();
        jdbc.sql("""
            INSERT INTO cases (id, channel_id, reporter_id, village, region_id, patient_age, patient_sex, chief_complaint, vitals,
                               original_language, original_text, sbar, urgency, red_flags, specialty_needed, status, escalate_at, is_demo)
            VALUES (:id, :ch, :me, :village, :region, :age, :sex, :cc, CAST(:vitals AS jsonb), :lang, :cc,
                    CAST(:sbar AS jsonb), :urgency, CAST(:flags AS jsonb), :spec, 'OPEN', :esc, :demo)
            """)
            .param("id", caseId).param("ch", ch.getId()).param("me", me)
            .param("village", r.village()).param("region", regionId)
            .param("age", r.patientAge()).param("sex", r.patientSex()).param("cc", r.chiefComplaint())
            .param("vitals", write(vitals)).param("lang", lang)
            .param("sbar", write(t.sbar())).param("urgency", t.urgency()).param("flags", write(t.flags()))
            .param("spec", t.specialty()).param("esc", escalateAt != null ? Timestamp.from(escalateAt) : null).param("demo", demo).update();

        event(caseId, me, "SUBMITTED", Map.of("language", lang));
        event(caseId, null, "STRUCTURED", Map.of("urgency", t.urgency(), "flags", t.flags().size(), "specialty", t.specialty()));

        List<UUID> doctors = candidates(t.specialty(), 5);
        String title = t.urgency() + " case for " + t.specialty() + (r.village() == null ? "" : " from " + r.village());
        for (UUID d : doctors) notify(d, "CASE_OFFER", caseId, title, String.valueOf(t.sbar().get("situation")));
        event(caseId, null, "ROUTED", Map.of("doctors", doctors.size()));

        // Outbreak radar: a new case may complete a cluster. Never let it block a patient case.
        try { outbreaks.evaluateRegion(regionId); } catch (RuntimeException ex) { /* radar is best-effort */ }

        postMessage(ch.getId(), me, "Case submitted.\nS: " + t.sbar().get("situation") + "\nB: " + t.sbar().get("background")
            + "\nA: " + t.sbar().get("assessment") + "\nR: " + t.sbar().get("recommendation"));

        return new SubmitResult(load(caseId), similar(r.chiefComplaint()));
    }

    private List<UUID> candidates(String specialty, int limit) {
        String base = """
            SELECT u.id FROM users u JOIN professional_profiles p ON p.user_id = u.id
            LEFT JOIN doctor_availability a ON a.user_id = u.id
            WHERE u.status = 'ACTIVE' AND u.account_type = 'DOCTOR' AND p.verification_status = 'APPROVED'
            """;
        String order = " ORDER BY coalesce(a.on_duty, false) DESC, u.last_seen_at DESC NULLS LAST LIMIT :n";
        List<UUID> ids = jdbc.sql(base + " AND lower(p.specialty) = lower(:s)" + order).param("s", specialty).param("n", limit).query(UUID.class).list();
        if (ids.isEmpty()) ids = jdbc.sql(base + " AND lower(p.specialty) = 'general medicine'" + order).param("n", limit).query(UUID.class).list();
        if (ids.isEmpty()) ids = jdbc.sql(base + order).param("n", limit).query(UUID.class).list();
        return ids;
    }

    // ---------- doctor actions ----------

    @Transactional
    public CaseDto accept(UUID me, UUID id) {
        requireDoctor(me);
        int n = jdbc.sql("UPDATE cases SET status='ASSIGNED', assigned_doctor_id=:me, accepted_at=now(), escalate_at=NULL WHERE id=:id AND status='OPEN'")
            .param("me", me).param("id", id).update();
        if (n == 0) throw new ApiException(HttpStatus.CONFLICT, "This case was already accepted or is closed");
        CaseDto c = load(id);
        jdbc.sql("INSERT INTO dm_participants (channel_id, user_id) VALUES (:c, :u) ON CONFLICT DO NOTHING").param("c", c.channelId()).param("u", me).update();
        event(id, me, "ACCEPTED", Map.of());
        notify(c.reporterId(), "CASE_ACCEPTED", id, "A doctor accepted your case", c.assignedDoctorName() + " is reviewing it now.");
        postMessage(c.channelId(), me, c.assignedDoctorName() + " accepted this case and will reply here.");
        return c;
    }

    @Transactional
    public CaseDto answer(UUID me, UUID id, String answer) {
        CaseDto c = load(id);
        if (!me.equals(c.assignedDoctorId())) throw new ApiException(HttpStatus.FORBIDDEN, "Only the assigned doctor can answer this case");
        postMessage(c.channelId(), me, answer);
        String summary = (c.patientAge() == null ? "" : c.patientAge() + "y ") + (c.patientSex() == null ? "" : c.patientSex() + ": ") + c.chiefComplaint();
        jdbc.sql("""
            INSERT INTO case_answers (case_id, doctor_id, specialty, question_summary, answer)
            VALUES (:c, :d, :s, :q, :a)
            ON CONFLICT (case_id) DO UPDATE SET answer = EXCLUDED.answer, verified_at = now()
            """).param("c", id).param("d", me).param("s", c.specialtyNeeded()).param("q", summary).param("a", answer).update();
        jdbc.sql("UPDATE cases SET status='RESOLVED', resolved_at=now() WHERE id=:id").param("id", id).update();
        jdbc.sql("INSERT INTO case_followups (case_id, due_at) VALUES (:id, now() + interval '24 hours')").param("id", id).update();
        event(id, me, "ANSWERED", Map.of());
        event(id, me, "RESOLVED", Map.of());
        notify(c.reporterId(), "CASE_ANSWERED", id, "Your case has an answer", c.assignedDoctorName() + " replied. Tap to read.");
        return load(id);
    }

    // ---------- health worker follow-up ----------

    @Transactional
    public CaseDto followup(UUID me, UUID id, FollowupRequest r) {
        CaseDto c = load(id);
        if (!me.equals(c.reporterId())) throw new ApiException(HttpStatus.FORBIDDEN, "Only the reporting health worker can answer the follow-up");
        String outcome = r.outcome().toUpperCase(Locale.ROOT);
        if (!OUTCOMES.contains(outcome)) throw new ApiException(HttpStatus.BAD_REQUEST, "Outcome must be IMPROVED, SAME or WORSE");
        int n = jdbc.sql("""
            UPDATE case_followups SET responded_at = now(), outcome = :o, note = :n
            WHERE id = (SELECT id FROM case_followups WHERE case_id = :c AND responded_at IS NULL ORDER BY due_at LIMIT 1)
            """).param("o", outcome).param("n", r.note()).param("c", id).update();
        if (n == 0) throw new ApiException(HttpStatus.NOT_FOUND, "No follow-up is waiting for this case");
        event(id, me, "FOLLOWUP_DONE", Map.of("outcome", outcome));
        if ("WORSE".equals(outcome)) {
            jdbc.sql("UPDATE cases SET status='OPEN', urgency='RED', escalate_at = now() + interval '5 minutes', resolved_at = NULL WHERE id = :id").param("id", id).update();
            event(id, me, "REOPENED", Map.of());
            if (c.assignedDoctorId() != null) notify(c.assignedDoctorId(), "CASE_REOPENED", id, "Patient got worse", "Follow-up reported the patient is worse.");
        } else {
            jdbc.sql("UPDATE cases SET status='CLOSED' WHERE id = :id").param("id", id).update();
        }
        return load(id);
    }

    // ---------- reads ----------

    @Transactional(readOnly = true)
    public CaseDto get(UUID me, UUID id) {
        CaseDto c = load(id);
        boolean allowed = c.reporterId().equals(me) || me.equals(c.assignedDoctorId())
            || jdbc.sql("SELECT EXISTS (SELECT 1 FROM dm_participants WHERE channel_id = :c AND user_id = :u)").param("c", c.channelId()).param("u", me).query(Boolean.class).single()
            || ("OPEN".equals(c.status()) && isDoctor(me));
        if (!allowed) throw new ApiException(HttpStatus.NOT_FOUND, "Case not found");
        return c;
    }

    @Transactional(readOnly = true)
    public List<CaseDto> mine(UUID me) {
        return select("WHERE c.reporter_id = :me OR c.assigned_doctor_id = :me ORDER BY c.created_at DESC LIMIT 100").param("me", me).query(this::map).list();
    }

    /** Open cases waiting for a doctor, most urgent first. */
    @Transactional(readOnly = true)
    public List<CaseDto> queue(UUID me) {
        requireDoctor(me);
        return select("WHERE c.status = 'OPEN' ORDER BY CASE c.urgency WHEN 'RED' THEN 0 WHEN 'AMBER' THEN 1 ELSE 2 END, c.created_at LIMIT 100").query(this::map).list();
    }

    @Transactional(readOnly = true)
    public List<LibraryHit> library(String q) {
        if (q == null || q.isBlank()) return jdbc.sql("SELECT * FROM case_answers ORDER BY helpful_count DESC, verified_at DESC LIMIT 20").query(this::hit).list();
        return jdbc.sql("""
            SELECT * FROM case_answers
            WHERE to_tsvector('simple', question_summary || ' ' || answer) @@ websearch_to_tsquery('simple', :q)
            ORDER BY ts_rank(to_tsvector('simple', question_summary || ' ' || answer), websearch_to_tsquery('simple', :q)) DESC, helpful_count DESC LIMIT 20
            """).param("q", q).query(this::hit).list();
    }

    @Transactional
    public void markHelpful(UUID me, UUID answerId) {
        if (!jdbc.sql("SELECT EXISTS (SELECT 1 FROM case_answers WHERE id = :a)").param("a", answerId).query(Boolean.class).single())
            throw new ApiException(HttpStatus.NOT_FOUND, "Answer not found");
        jdbc.sql("INSERT INTO case_answer_votes (answer_id, user_id) VALUES (:a, :u) ON CONFLICT DO NOTHING").param("a", answerId).param("u", me).update();
        jdbc.sql("UPDATE case_answers SET helpful_count = (SELECT count(*) FROM case_answer_votes WHERE answer_id = :a) WHERE id = :a").param("a", answerId).update();
    }

    @Transactional(readOnly = true)
    public ImpactDto impact() {
        Map<String, Object> t = jdbc.sql("""
            SELECT count(*) AS total, count(*) FILTER (WHERE status IN ('RESOLVED','CLOSED')) AS resolved,
                   count(*) FILTER (WHERE urgency = 'RED') AS red, count(*) FILTER (WHERE status = 'OPEN') AS open,
                   avg(extract(epoch FROM (accepted_at - created_at)) / 60) FILTER (WHERE accepted_at IS NOT NULL) AS avg_min
            FROM cases""").query().singleRow();
        Number avg = (Number) t.get("avg_min");
        List<Map<String, Object>> regions = jdbc.sql("SELECT name, district, state, lat, lng, cases, red_cases, open_cases FROM v_region_heat ORDER BY cases DESC").query().listOfRows();
        List<Map<String, Object>> daily = jdbc.sql("SELECT day::text AS day, cases, red_cases, resolved, avg_minutes_to_accept FROM v_case_impact_daily WHERE day >= current_date - 13 ORDER BY day").query().listOfRows();
        return new ImpactDto(((Number) t.get("total")).longValue(), ((Number) t.get("resolved")).longValue(), ((Number) t.get("red")).longValue(),
            ((Number) t.get("open")).longValue(), avg == null ? null : Math.round(avg.doubleValue() * 10) / 10.0, regions, daily);
    }

    // ---------- doctor availability + notifications ----------

    @Transactional
    public void setAvailability(UUID me, AvailabilityRequest r) {
        requireDoctor(me);
        String langs = r.languages() == null || r.languages().isEmpty() ? "en" : String.join(",", r.languages());
        jdbc.sql("""
            INSERT INTO doctor_availability (user_id, on_duty, languages, updated_at) VALUES (:u, :d, string_to_array(:l, ','), now())
            ON CONFLICT (user_id) DO UPDATE SET on_duty = EXCLUDED.on_duty, languages = EXCLUDED.languages, updated_at = now()
            """).param("u", me).param("d", r.onDuty()).param("l", langs).update();
    }

    @Transactional(readOnly = true)
    public List<NotificationDto> notifications(UUID me) {
        return jdbc.sql("""
            SELECT n.* FROM notifications n
            LEFT JOIN cases c ON c.id = n.case_id
            LEFT JOIN professional_profiles p ON p.user_id = :u
            LEFT JOIN users u ON u.id = :u
            WHERE n.user_id = :u
              AND (
                n.case_id IS NULL
                OR (
                  (n.kind IN ('CASE_ACCEPTED', 'CASE_ANSWERED', 'FOLLOWUP') AND c.reporter_id = :u)
                  OR (n.kind = 'CASE_REOPENED' AND c.assigned_doctor_id = :u)
                  OR (n.kind IN ('CASE_OFFER', 'CASE_ESCALATED') AND c.status = 'OPEN' AND (
                      (u.platform_role = 'ADMIN' AND n.kind = 'CASE_ESCALATED')
                      OR (
                          NOT (c.urgency = 'GREEN' AND n.kind = 'CASE_ESCALATED')
                          AND (
                              c.urgency = 'RED'
                              OR p.specialty IS NULL
                              OR lower(p.specialty) = 'general medicine'
                              OR lower(p.specialty) = lower(c.specialty_needed)
                          )
                      )
                  ))
                )
              )
            ORDER BY n.created_at DESC LIMIT 50
            """).param("u", me)
            .query((rs, i) -> new NotificationDto(rs.getObject("id", UUID.class), rs.getString("kind"), rs.getObject("case_id", UUID.class),
                rs.getObject("fundraiser_id", UUID.class), rs.getString("title"), rs.getString("body"), rs.getTimestamp("read_at") != null, rs.getTimestamp("created_at").toInstant())).list();
    }

    @Transactional
    public void markRead(UUID me, UUID id) {
        jdbc.sql("UPDATE notifications SET read_at = now() WHERE id = :id AND user_id = :u AND read_at IS NULL").param("id", id).param("u", me).update();
    }

    // ---------- scheduled jobs ----------

    /** Escalates open urgent cases nobody has accepted: first to relevant on-duty doctors, then to platform admins. */
    @Transactional
    public int escalateOverdue() {
        List<UUID> due = jdbc.sql("SELECT id FROM cases WHERE status = 'OPEN' AND urgency IN ('RED', 'AMBER') AND escalate_at IS NOT NULL AND escalate_at <= now() ORDER BY escalate_at LIMIT 50").query(UUID.class).list();
        for (UUID id : due) {
            CaseDto c = load(id);
            int level = c.escalationLevel() + 1;
            jdbc.sql("UPDATE cases SET escalation_level = :l, escalate_at = CASE WHEN :l < 2 THEN now() + interval '5 minutes' ELSE NULL END WHERE id = :id")
                .param("l", level).param("id", id).update();
            List<UUID> targets = level == 1
                ? ("RED".equals(c.urgency())
                    ? jdbc.sql("SELECT u.id FROM users u JOIN doctor_availability a ON a.user_id = u.id JOIN professional_profiles p ON p.user_id = u.id WHERE a.on_duty AND u.status = 'ACTIVE' AND p.verification_status = 'APPROVED' LIMIT 20").query(UUID.class).list()
                    : candidates(c.specialtyNeeded(), 10))
                : jdbc.sql("SELECT id FROM users WHERE platform_role = 'ADMIN' AND status = 'ACTIVE'").query(UUID.class).list();
            for (UUID t : targets) notify(t, "CASE_ESCALATED", id, "ESCALATED: " + c.urgency() + " case still unanswered", String.valueOf(c.sbar() == null ? "" : c.sbar().get("situation")));
            event(id, null, "ESCALATED", Map.of("level", level, "notified", targets.size()));
        }
        return due.size();
    }

    /** Sends the 24h "did the patient improve?" prompt once per follow-up. */
    @Transactional
    public int sendDueFollowups() {
        List<Map<String, Object>> due = jdbc.sql("""
            SELECT f.case_id, c.reporter_id FROM case_followups f JOIN cases c ON c.id = f.case_id
            WHERE f.responded_at IS NULL AND f.due_at <= now()
              AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.case_id = f.case_id AND n.kind = 'FOLLOWUP' AND n.created_at >= f.due_at)
            LIMIT 50""").query().listOfRows();
        for (Map<String, Object> r : due) {
            UUID caseId = (UUID) r.get("case_id");
            notify((UUID) r.get("reporter_id"), "FOLLOWUP", caseId, "Did the patient improve?", "Please tell us how the patient is doing.");
            event(caseId, null, "FOLLOWUP_SENT", Map.of());
        }
        return due.size();
    }

    // ---------- helpers ----------

    private List<LibraryHit> similar(String complaint) {
        List<String> words = WORD.matcher(complaint.toLowerCase(Locale.ROOT)).results().map(m -> m.group()).distinct().limit(8).toList();
        if (words.isEmpty()) return List.of();
        return library(String.join(" or ", words)).stream().limit(3).toList();
    }

    private void requireDoctor(UUID me) {
        if (!isDoctor(me)) throw new ApiException(HttpStatus.FORBIDDEN, "Only verified doctors can do this");
    }

    private boolean isDoctor(UUID me) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM users u JOIN professional_profiles p ON p.user_id = u.id WHERE u.id = :u AND u.status = 'ACTIVE' AND p.verification_status = 'APPROVED')")
            .param("u", me).query(Boolean.class).single();
    }

    private JdbcClient.StatementSpec select(String tail) {
        return jdbc.sql("""
            SELECT c.*, ru.display_name AS reporter_name, du.display_name AS doctor_name
            FROM cases c JOIN users ru ON ru.id = c.reporter_id LEFT JOIN users du ON du.id = c.assigned_doctor_id
            """ + tail);
    }

    private CaseDto load(UUID id) {
        return select("WHERE c.id = :id").param("id", id).query(this::map).optional().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Case not found"));
    }

    @SuppressWarnings("unchecked")
    private CaseDto map(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        List<RedFlag> flags = new ArrayList<>();
        for (Object o : read(rs.getString("red_flags"), List.class, new ArrayList<>())) {
            Map<String, Object> m = (Map<String, Object>) o;
            flags.add(new RedFlag((String) m.get("code"), (String) m.get("label"), (String) m.get("advice")));
        }
        return new CaseDto(rs.getObject("id", UUID.class), rs.getObject("channel_id", UUID.class), rs.getObject("reporter_id", UUID.class),
            rs.getString("reporter_name"), rs.getObject("assigned_doctor_id", UUID.class), rs.getString("doctor_name"), rs.getString("village"),
            (Integer) rs.getObject("patient_age"), rs.getString("patient_sex"), rs.getString("chief_complaint"),
            read(rs.getString("vitals"), Map.class, new HashMap<>()), read(rs.getString("sbar"), Map.class, null),
            rs.getString("urgency"), flags, rs.getString("specialty_needed"), rs.getString("status"), rs.getInt("escalation_level"),
            inst(rs.getTimestamp("created_at")), inst(rs.getTimestamp("accepted_at")), inst(rs.getTimestamp("resolved_at")));
    }

    private LibraryHit hit(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        return new LibraryHit(rs.getObject("id", UUID.class), rs.getString("specialty"), rs.getString("question_summary"),
            rs.getString("answer"), rs.getInt("helpful_count"), inst(rs.getTimestamp("verified_at")));
    }

    private static Instant inst(Timestamp t) { return t == null ? null : t.toInstant(); }

    private String write(Object o) { return json.writeValueAsString(o); }

    @SuppressWarnings("unchecked")
    private <T> T read(String s, Class<T> type, T fallback) {
        if (s == null || s.isBlank()) return fallback;
        return json.readValue(s, type);
    }

    private void event(UUID caseId, UUID actor, String type, Map<String, Object> payload) {
        jdbc.sql("INSERT INTO case_events (case_id, actor_id, type, payload) VALUES (:c, :a, :t, CAST(:p AS jsonb))")
            .param("c", caseId).param("a", actor).param("t", type).param("p", write(payload)).update();
    }

    private void notify(UUID user, String kind, UUID caseId, String title, String body) {
        jdbc.sql("INSERT INTO notifications (user_id, kind, case_id, title, body) VALUES (:u, :k, :c, :t, :b)")
            .param("u", user).param("k", kind).param("c", caseId).param("t", truncate(title, 160)).param("b", truncate(body, 500)).update();
    }

    private void postMessage(UUID channelId, UUID author, String body) {
        jdbc.sql("INSERT INTO messages (channel_id, author_id, body) VALUES (:c, :a, :b)")
            .param("c", channelId).param("a", author).param("b", truncate(body, 4000)).update();
    }

    private static String truncate(String s, int max) { return s == null ? null : s.length() <= max ? s : s.substring(0, max); }
}
