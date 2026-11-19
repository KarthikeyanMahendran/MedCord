package com.medcord.network;

import com.medcord.common.ApiException;
import java.sql.Array;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/**
 * Care network map: the areas MedCord covers and the people working in them.
 * Admins and verified doctors see every area; a health worker sees only their own area. Licence and NHM numbers are never returned.
 */
@RestController
@RequestMapping("/api/v1/network")
public class NetworkController {
    public record Person(UUID id, String name, String kind, String detail, String organisation, List<String> languages, int cases72h, Instant lastCaseAt) {}
    public record Area(UUID id, String name, String district, String state, Double lat, Double lng, int cases72h, int liveAlerts, List<Person> people) {}
    public record Doctor(UUID id, String name, String specialty) {}
    public record Network(String scope, List<Area> areas, List<Doctor> doctors, UUID myAreaId) {}

    private final JdbcClient jdbc;

    public NetworkController(JdbcClient jdbc) { this.jdbc = jdbc; }

    @GetMapping
    @Transactional(readOnly = true)
    public Network network(@AuthenticationPrincipal Jwt jwt) {
        UUID me = UUID.fromString(jwt.getSubject());
        boolean staff = jdbc.sql("""
            SELECT EXISTS (SELECT 1 FROM users u WHERE u.id = :u AND u.status = 'ACTIVE' AND (u.platform_role = 'ADMIN'
                OR EXISTS (SELECT 1 FROM professional_profiles p WHERE p.user_id = u.id AND p.verification_status = 'APPROVED')))
            """).param("u", me).query(Boolean.class).single();
        UUID myArea = jdbc.sql("SELECT region_id FROM health_worker_profiles WHERE user_id = :u").param("u", me).query(UUID.class).optional().orElse(null);
        if (!staff && myArea == null) throw new ApiException(HttpStatus.FORBIDDEN, "The care network map is for health workers with an area, verified doctors and admins");

        List<Map<String, Object>> regions = jdbc.sql("""
            SELECT r.id, r.name, r.district, r.state, r.lat, r.lng,
                   (SELECT count(*) FROM cases c WHERE c.region_id = r.id AND c.created_at >= now() - interval '72 hours') AS cases72,
                   (SELECT count(*) FROM outbreak_alerts a WHERE a.region_id = r.id AND a.status <> 'RESOLVED') AS alerts
            FROM regions r WHERE (:all OR r.id = :mine)
              AND (EXISTS (SELECT 1 FROM health_worker_profiles h WHERE h.region_id = r.id)
                   OR EXISTS (SELECT 1 FROM cases c WHERE c.region_id = r.id AND c.created_at >= now() - interval '72 hours')
                   OR EXISTS (SELECT 1 FROM outbreak_alerts a WHERE a.region_id = r.id AND a.status <> 'RESOLVED'))
            ORDER BY r.state, r.name
            """).param("all", staff).param("mine", myArea).query().listOfRows();

        Map<UUID, List<Person>> byArea = new HashMap<>();
        jdbc.sql("""
            SELECT h.region_id, u.id, u.display_name, h.training_level, h.organisation, h.languages,
                   (SELECT count(*) FROM cases c WHERE c.reporter_id = u.id AND c.created_at >= now() - interval '72 hours') AS cases72,
                   (SELECT max(c.created_at) FROM cases c WHERE c.reporter_id = u.id) AS last_case
            FROM health_worker_profiles h JOIN users u ON u.id = h.user_id
            WHERE u.status = 'ACTIVE' AND h.region_id IS NOT NULL AND (:all OR h.region_id = :mine)
            ORDER BY u.display_name
            """).param("all", staff).param("mine", myArea).query((rs, i) -> {
                Array langs = rs.getArray("languages");
                List<String> l = langs == null ? List.of() : Arrays.stream((Object[]) langs.getArray()).map(String::valueOf).toList();
                Timestamp last = rs.getTimestamp("last_case");
                String level = rs.getString("training_level");
                Person p = new Person(rs.getObject("id", UUID.class), rs.getString("display_name"), "ASHA".equals(level) ? "ASHA worker" : "Health worker",
                    "ASHA".equals(level) ? "Accredited Social Health Activist" : "Community health worker", rs.getString("organisation"), l,
                    rs.getInt("cases72"), last == null ? null : last.toInstant());
                byArea.computeIfAbsent(rs.getObject("region_id", UUID.class), k -> new ArrayList<>()).add(p);
                return 0;
            }).list();

        List<Area> areas = new ArrayList<>();
        for (Map<String, Object> r : regions) {
            UUID id = (UUID) r.get("id");
            areas.add(new Area(id, (String) r.get("name"), (String) r.get("district"), (String) r.get("state"),
                r.get("lat") == null ? null : ((Number) r.get("lat")).doubleValue(), r.get("lng") == null ? null : ((Number) r.get("lng")).doubleValue(),
                ((Number) r.get("cases72")).intValue(), ((Number) r.get("alerts")).intValue(), byArea.getOrDefault(id, List.of())));
        }
        List<Doctor> doctors = !staff ? List.of() : jdbc.sql("""
            SELECT u.id, u.display_name, p.specialty FROM professional_profiles p JOIN users u ON u.id = p.user_id
            WHERE u.status = 'ACTIVE' AND p.verification_status = 'APPROVED' AND u.platform_role <> 'ADMIN' ORDER BY p.specialty, u.display_name
            """).query((rs, i) -> new Doctor(rs.getObject("id", UUID.class), rs.getString("display_name"), rs.getString("specialty"))).list();
        return new Network(staff ? "ALL" : "AREA", areas, doctors, myArea);
    }
}
