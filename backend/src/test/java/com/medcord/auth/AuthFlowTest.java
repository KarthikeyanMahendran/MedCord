package com.medcord.auth;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.medcord.user.User;
import com.medcord.user.UserRepository;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AuthFlowTest {
    static final String PW = "Str0ngPassw0rd";
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    final JsonMapper json = JsonMapper.builder().build();

    String registerBody(String email, String lic) {
        return """
            {"email":"%s","password":"%s","displayName":"Dr Test","specialty":"Cardiology",
             "licenseNumber":"%s","licenseCountry":"in"}""".formatted(email, PW, lic);
    }

    JsonNode call(String url, String body, int status) throws Exception {
        MvcResult r = mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().is(status)).andReturn();
        String s = r.getResponse().getContentAsString();
        return s.isBlank() ? null : json.readTree(s);
    }

    @Test
    void registerLoginMeRoundTrip() throws Exception {
        String email = "t-" + UUID.randomUUID() + "@test.dev";
        JsonNode reg = call("/api/v1/auth/register", registerBody(email, "L-" + UUID.randomUUID()), 201);
        org.assertj.core.api.Assertions.assertThat(reg.get("tokenType").asText()).isEqualTo("Bearer");

        JsonNode login = call("/api/v1/auth/login", "{\"email\":\"" + email.toUpperCase() + "\",\"password\":\"" + PW + "\"}", 200);
        mvc.perform(get("/api/v1/me").header("Authorization", "Bearer " + login.get("accessToken").asText()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.email").value(email))
            .andExpect(jsonPath("$.status").value("PENDING"))
            .andExpect(jsonPath("$.verificationStatus").value("PENDING"))
            .andExpect(jsonPath("$.licenseCountry").value("IN"));
    }

    @Test
    void duplicateEmailAndLicenseConflict() throws Exception {
        String email = "d-" + UUID.randomUUID() + "@test.dev";
        String lic = "L-" + UUID.randomUUID();
        call("/api/v1/auth/register", registerBody(email, lic), 201);
        call("/api/v1/auth/register", registerBody(email, "other-" + lic), 409);
        call("/api/v1/auth/register", registerBody("x-" + email, lic), 409);
    }

    @Test
    void validationErrorsAreProblemJson() throws Exception {
        mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"bad\",\"password\":\"short\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.errors.email").exists())
            .andExpect(jsonPath("$.errors.password").exists());
    }

    @Test
    void wrongPasswordAndUnknownUserGetSameGeneric401() throws Exception {
        String a = call("/api/v1/auth/login", "{\"email\":\"nobody@test.dev\",\"password\":\"whatever\"}", 401).get("detail").asText();
        String email = "w-" + UUID.randomUUID() + "@test.dev";
        call("/api/v1/auth/register", registerBody(email, "L-" + UUID.randomUUID()), 201);
        String b = call("/api/v1/auth/login", "{\"email\":\"" + email + "\",\"password\":\"WrongPassw0rd\"}", 401).get("detail").asText();
        org.assertj.core.api.Assertions.assertThat(a).isEqualTo(b);
    }

    @Test
    void refreshRotatesAndReuseRevokesEverything() throws Exception {
        String email = "r-" + UUID.randomUUID() + "@test.dev";
        JsonNode first = call("/api/v1/auth/register", registerBody(email, "L-" + UUID.randomUUID()), 201);
        String r1 = first.get("refreshToken").asText();

        JsonNode second = call("/api/v1/auth/refresh", "{\"refreshToken\":\"" + r1 + "\"}", 200);
        String r2 = second.get("refreshToken").asText();
        org.assertj.core.api.Assertions.assertThat(r2).isNotEqualTo(r1);

        // reusing the rotated token is an attack signal -> 401 and all sessions revoked
        call("/api/v1/auth/refresh", "{\"refreshToken\":\"" + r1 + "\"}", 401);
        call("/api/v1/auth/refresh", "{\"refreshToken\":\"" + r2 + "\"}", 401);
    }

    @Test
    void logoutRevokesRefreshToken() throws Exception {
        String email = "o-" + UUID.randomUUID() + "@test.dev";
        String r = call("/api/v1/auth/register", registerBody(email, "L-" + UUID.randomUUID()), 201).get("refreshToken").asText();
        call("/api/v1/auth/logout", "{\"refreshToken\":\"" + r + "\"}", 204);
        call("/api/v1/auth/refresh", "{\"refreshToken\":\"" + r + "\"}", 401);
    }

    @Test
    void suspendedUserCannotLogin() throws Exception {
        String email = "s-" + UUID.randomUUID() + "@test.dev";
        call("/api/v1/auth/register", registerBody(email, "L-" + UUID.randomUUID()), 201);
        User u = users.findByEmailIgnoreCase(email).orElseThrow();
        u.setStatus(User.Status.SUSPENDED);
        users.saveAndFlush(u);
        call("/api/v1/auth/login", "{\"email\":\"" + email + "\",\"password\":\"" + PW + "\"}", 403);
    }

    @Test
    void protectedEndpointsRequireTokenAndAdminRoleIsEnforced() throws Exception {
        mvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
        mvc.perform(get("/api/v1/me").header("Authorization", "Bearer garbage")).andExpect(status().isUnauthorized());

        String email = "u-" + UUID.randomUUID() + "@test.dev";
        String token = call("/api/v1/auth/register", registerBody(email, "L-" + UUID.randomUUID()), 201).get("accessToken").asText();
        mvc.perform(get("/api/v1/admin/verifications").header("Authorization", "Bearer " + token))
            .andExpect(status().isForbidden());
    }
}
