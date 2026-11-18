package com.medcord.dm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.medcord.user.Presence;
import com.medcord.user.User;
import com.medcord.user.UserRepository;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

/**
 * Deliberately NOT @Transactional: this exercises the real commit path. Regression for a bulk
 * update that only worked inside a test-wrapping transaction (TransactionRequiredException in prod).
 */
@SpringBootTest
@AutoConfigureMockMvc
class PresenceCommitTest {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;

    @Test
    void heartbeatCommitsWithoutAnOuterTransaction() throws Exception {
        User u = new User();
        u.setEmail("presence-" + UUID.randomUUID() + "@test.dev");
        u.setPasswordHash(encoder.encode("Str0ngPassw0rd"));
        u.setDisplayName("Presence Probe");
        u.setStatus(User.Status.ACTIVE);
        u = users.saveAndFlush(u);
        try {
            String login = mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + u.getEmail() + "\",\"password\":\"Str0ngPassw0rd\"}"))
                .andReturn().getResponse().getContentAsString();
            String token = JsonMapper.builder().build().readTree(login).get("accessToken").asText();

            mvc.perform(post("/api/v1/presence/heartbeat").header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());

            User reloaded = users.findById(u.getId()).orElseThrow();
            assertThat(reloaded.getLastSeenAt()).isNotNull();
            assertThat(Presence.online(reloaded)).isTrue();
        } finally {
            users.deleteById(u.getId());
        }
    }
}
