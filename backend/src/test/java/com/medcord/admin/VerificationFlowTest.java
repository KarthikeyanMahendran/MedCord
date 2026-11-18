package com.medcord.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.medcord.user.*;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class VerificationFlowTest {
    static final String PW = "Str0ngPassw0rd";
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired ProfessionalProfileRepository profiles;
    @Autowired VerificationDecisionRepository decisions;
    @Autowired PasswordEncoder encoder;
    final JsonMapper json = JsonMapper.builder().build();
    String adminToken;

    User mk(String prefix, User.PlatformRole role, ProfessionalProfile.Verification v) {
        User u = new User();
        u.setEmail(prefix + "-" + UUID.randomUUID() + "@test.dev");
        u.setPasswordHash(encoder.encode(PW));
        u.setDisplayName(prefix);
        u.setPlatformRole(role);
        u = users.saveAndFlush(u);
        ProfessionalProfile p = new ProfessionalProfile();
        p.setUserId(u.getId());
        p.setSpecialty("Cardiology");
        p.setLicenseCountry("IN");
        p.setLicenseNumber("LIC-" + UUID.randomUUID());
        p.setVerificationStatus(v);
        profiles.saveAndFlush(p);
        return u;
    }

    String token(User u) throws Exception {
        String body = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + u.getEmail() + "\",\"password\":\"" + PW + "\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("accessToken").asText();
    }

    @BeforeEach
    void admin() throws Exception {
        adminToken = token(mk("admin", User.PlatformRole.ADMIN, ProfessionalProfile.Verification.APPROVED));
    }

    String decide(UUID id, String body, int expected) throws Exception {
        return mvc.perform(patch("/api/v1/admin/verifications/" + id).header("Authorization", "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
    }

    @Test
    void listFiltersByStatusAndPaginates() throws Exception {
        User a = mk("p1", User.PlatformRole.USER, ProfessionalProfile.Verification.PENDING);
        mk("p2", User.PlatformRole.USER, ProfessionalProfile.Verification.REJECTED);
        mvc.perform(get("/api/v1/admin/verifications?status=PENDING&size=100").header("Authorization", "Bearer " + adminToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[?(@.userId=='" + a.getId() + "')].status").value("PENDING"))
            .andExpect(jsonPath("$.items[?(@.status!='PENDING')]").isEmpty());
        mvc.perform(get("/api/v1/admin/verifications?size=1").header("Authorization", "Bearer " + adminToken))
            .andExpect(jsonPath("$.items.length()").value(1))
            .andExpect(jsonPath("$.totalPages").isNumber());
    }

    @Test
    void approveActivatesAccountAndWritesAudit() throws Exception {
        User u = mk("doc", User.PlatformRole.USER, ProfessionalProfile.Verification.PENDING);
        long before = decisions.count();
        String res = decide(u.getId(), "{\"decision\":\"APPROVED\"}", 200);
        assertThat(json.readTree(res).get("status").asText()).isEqualTo("APPROVED");
        assertThat(json.readTree(res).get("verifiedAt").isNull()).isFalse();
        assertThat(users.findById(u.getId()).orElseThrow().getStatus()).isEqualTo(User.Status.ACTIVE);
        assertThat(decisions.count()).isEqualTo(before + 1);
        decide(u.getId(), "{\"decision\":\"REJECTED\",\"reason\":\"x\"}", 409); // already decided
    }

    @Test
    void rejectRequiresReason() throws Exception {
        User u = mk("doc", User.PlatformRole.USER, ProfessionalProfile.Verification.PENDING);
        decide(u.getId(), "{\"decision\":\"REJECTED\"}", 400);
        decide(u.getId(), "{\"decision\":\"REJECTED\",\"reason\":\"Licence number not found\"}", 200);
        assertThat(profiles.findById(u.getId()).orElseThrow().getVerificationStatus())
            .isEqualTo(ProfessionalProfile.Verification.REJECTED);
        mvc.perform(get("/api/v1/me").header("Authorization", "Bearer " + token(u)))
            .andExpect(jsonPath("$.rejectionReason").value("Licence number not found"));
    }

    @Test
    void unknownUserIs404AndPendingDecisionIs400() throws Exception {
        decide(UUID.randomUUID(), "{\"decision\":\"APPROVED\"}", 404);
        User u = mk("doc", User.PlatformRole.USER, ProfessionalProfile.Verification.PENDING);
        decide(u.getId(), "{\"decision\":\"PENDING\"}", 400);
    }

    @Test
    void nonAdminCannotAccessQueue() throws Exception {
        String t = token(mk("user", User.PlatformRole.USER, ProfessionalProfile.Verification.APPROVED));
        mvc.perform(get("/api/v1/admin/verifications").header("Authorization", "Bearer " + t)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/verifications")).andExpect(status().isUnauthorized());
    }

    @Test
    void rejectedUserCanResubmitAndEditProfile() throws Exception {
        User u = mk("doc", User.PlatformRole.USER, ProfessionalProfile.Verification.REJECTED);
        String t = token(u);
        mvc.perform(patch("/api/v1/me").header("Authorization", "Bearer " + t).contentType(MediaType.APPLICATION_JSON)
                .content("{\"displayName\":\"Dr New Name\",\"bio\":\"Hello\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("Dr New Name")).andExpect(jsonPath("$.bio").value("Hello"));
        mvc.perform(post("/api/v1/me/verification").header("Authorization", "Bearer " + t).contentType(MediaType.APPLICATION_JSON)
                .content("{\"licenseNumber\":\"FIXED-" + UUID.randomUUID() + "\",\"licenseCountry\":\"in\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.verificationStatus").value("PENDING"));
        // now pending: second resubmit is a conflict
        mvc.perform(post("/api/v1/me/verification").header("Authorization", "Bearer " + t).contentType(MediaType.APPLICATION_JSON)
                .content("{\"licenseNumber\":\"X\",\"licenseCountry\":\"IN\"}"))
            .andExpect(status().isConflict());
    }
}
