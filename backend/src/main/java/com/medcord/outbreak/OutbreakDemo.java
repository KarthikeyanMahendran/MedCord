package com.medcord.outbreak;

import com.medcord.cases.CaseDtos.SubmitCaseRequest;
import com.medcord.cases.CaseService;
import com.medcord.common.ApiException;
import com.medcord.outbreak.OutbreakDtos.DemoResult;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Admin-only demo helper: files a few realistic cases through the normal path so the radar fires live. */
@Service
public class OutbreakDemo {
    private static final String REGION_NAME = "Wayanad Hills";

    private record Sample(String text, int age, String sex, String village, double temp) {}
    private static final List<Sample> SAMPLES = List.of(
        new Sample("Child with fever and a red rash on the body for 2 days", 4, "male", "Meppadi", 38.6),
        new Sample("Girl with high fever, rash started on the face and spread to the chest", 6, "female", "Vythiri", 38.9),
        new Sample("Boy with fever, itchy rash and red eyes since yesterday", 5, "male", "Kalpetta", 38.4));

    private final JdbcClient jdbc;
    private final CaseService cases;
    private final OutbreakService radar;

    public OutbreakDemo(JdbcClient jdbc, CaseService cases, OutbreakService radar) { this.jdbc = jdbc; this.cases = cases; this.radar = radar; }

    /** Not transactional on purpose: each case commits on its own, exactly like real traffic. */
    public DemoResult run(UUID me) {
        requireAdmin(me);
        UUID region = jdbc.sql("SELECT id FROM regions WHERE name = :n").param("n", REGION_NAME).query(UUID.class).optional()
            .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "Demo region is missing"));
        UUID reporter = jdbc.sql("""
            SELECT id FROM users WHERE account_type = 'HEALTH_WORKER' AND status = 'ACTIVE'
            ORDER BY (lower(email) = 'kavitha.worker@medcord.dev') DESC, created_at LIMIT 1
            """).query(UUID.class).optional().orElse(me);
        for (Sample s : SAMPLES) {
            cases.submit(reporter, new SubmitCaseRequest(s.text(), s.age(), s.sex(), s.village(), region, "en", Map.of("temperature", s.temp())), true);
        }
        radar.evaluateRegion(region);
        int total = jdbc.sql("SELECT count(*) FROM cases WHERE is_demo").query(Integer.class).single();
        return new DemoResult(SAMPLES.size(), total, REGION_NAME);
    }

    @Transactional
    public int reset(UUID me) {
        requireAdmin(me);
        jdbc.sql("DELETE FROM notifications WHERE kind = 'OUTBREAK' AND title LIKE '%(demo)'").update();
        jdbc.sql("DELETE FROM outbreak_alerts WHERE is_demo").update();
        // Deleting the case's chat channel removes the case, its events and its notifications (all cascade).
        int n = jdbc.sql("DELETE FROM channels WHERE id IN (SELECT channel_id FROM cases WHERE is_demo)").update();
        radar.evaluateAll();
        return n;
    }

    private void requireAdmin(UUID me) {
        if (!radar.isAdmin(me)) throw new ApiException(HttpStatus.FORBIDDEN, "Only an admin can run the demo");
    }
}
