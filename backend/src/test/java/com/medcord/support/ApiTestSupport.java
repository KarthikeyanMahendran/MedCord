package com.medcord.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.medcord.user.*;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Shared helpers for HTTP-level integration tests. Each test runs in a rolled-back transaction. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
public abstract class ApiTestSupport {
    public static final String PW = "Str0ngPassw0rd";
    @Autowired protected MockMvc mvc;
    @Autowired protected UserRepository users;
    @Autowired protected ProfessionalProfileRepository profiles;
    @Autowired protected PasswordEncoder encoder;
    protected final JsonMapper json = JsonMapper.builder().build();

    public record Acct(UUID id, String token) {}

    protected Acct acct(String prefix, boolean verified) throws Exception {
        User u = new User();
        u.setEmail(prefix + "-" + UUID.randomUUID() + "@test.dev");
        u.setPasswordHash(encoder.encode(PW));
        u.setDisplayName(prefix);
        u.setStatus(verified ? User.Status.ACTIVE : User.Status.PENDING);
        u = users.saveAndFlush(u);
        ProfessionalProfile p = new ProfessionalProfile();
        p.setUserId(u.getId());
        p.setSpecialty("Cardiology");
        p.setLicenseCountry("IN");
        p.setLicenseNumber("L-" + UUID.randomUUID());
        p.setVerificationStatus(verified ? ProfessionalProfile.Verification.APPROVED : ProfessionalProfile.Verification.PENDING);
        profiles.saveAndFlush(p);
        String body = mvc.perform(MockMvcRequestBuilders.post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"" + u.getEmail() + "\",\"password\":\"" + PW + "\"}")).andReturn().getResponse().getContentAsString();
        return new Acct(u.getId(), json.readTree(body).get("accessToken").asText());
    }

    protected JsonNode api(HttpMethod m, String url, Acct who, String body, int expected) throws Exception {
        var rb = MockMvcRequestBuilders.request(m, url);
        if (who != null) rb.header("Authorization", "Bearer " + who.token());
        if (body != null) rb.contentType(MediaType.APPLICATION_JSON).content(body);
        var res = mvc.perform(rb).andReturn().getResponse();
        assertThat(res.getStatus()).as(m + " " + url + " -> " + res.getContentAsString()).isEqualTo(expected);
        String s = res.getContentAsString();
        return s.isBlank() ? null : json.readTree(s);
    }

    protected String createCommunity(Acct owner, String name) throws Exception {
        return api(HttpMethod.POST, "/api/v1/communities", owner, "{\"name\":\"" + name + "\"}", 201).get("id").asText();
    }

    protected String channelId(Acct who, String communityId, String channelName) throws Exception {
        for (JsonNode c : api(HttpMethod.GET, "/api/v1/communities/" + communityId + "/channels", who, null, 200))
            if (c.get("name").asText().equals(channelName)) return c.get("id").asText();
        throw new AssertionError("no channel " + channelName);
    }

    protected void join(Acct who, String communityId) throws Exception {
        api(HttpMethod.POST, "/api/v1/communities/" + communityId + "/join", who, null, 200);
    }

    protected void grantRole(Acct owner, String communityId, Acct target, String roleName) throws Exception {
        for (JsonNode r : api(HttpMethod.GET, "/api/v1/communities/" + communityId + "/roles", owner, null, 200)) {
            if (r.get("name").asText().equals(roleName)) {
                api(HttpMethod.PUT, "/api/v1/communities/" + communityId + "/members/" + target.id() + "/roles", owner,
                    "{\"roleIds\":[\"" + r.get("id").asText() + "\"]}", 200);
                return;
            }
        }
        throw new AssertionError("no role " + roleName);
    }
}
