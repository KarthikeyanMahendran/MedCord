package com.medcord.auth;

import com.medcord.auth.AuthDtos.RegionOption;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Read-only lists the sign-up form needs before anyone is signed in. Nothing personal is exposed. */
@RestController
@RequestMapping("/api/v1/auth")
public class LookupController {
    private final JdbcClient jdbc;

    public LookupController(JdbcClient jdbc) { this.jdbc = jdbc; }

    @GetMapping("/regions")
    List<RegionOption> regions() {
        return jdbc.sql("SELECT id, name, district, state FROM regions ORDER BY state, name")
            .query((rs, i) -> new RegionOption(rs.getObject("id", java.util.UUID.class), rs.getString("name"), rs.getString("district"), rs.getString("state"))).list();
    }

    @GetMapping("/specialties")
    List<String> specialties() {
        return jdbc.sql("SELECT name FROM specialties ORDER BY name").query(String.class).list();
    }
}
