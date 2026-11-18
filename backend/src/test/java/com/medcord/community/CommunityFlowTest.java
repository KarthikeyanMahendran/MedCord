package com.medcord.community;

import static org.assertj.core.api.Assertions.assertThat;

import com.medcord.user.*;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class CommunityFlowTest {
    static final String PW = "Str0ngPassw0rd";
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired ProfessionalProfileRepository profiles;
    @Autowired PasswordEncoder encoder;
    final JsonMapper json = JsonMapper.builder().build();

    record Acct(UUID id, String token) {}
    Acct owner, member, other;

    Acct acct(String prefix, boolean verified) throws Exception {
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

    JsonNode api(HttpMethod m, String url, Acct who, String body, int expected) throws Exception {
        var rb = MockMvcRequestBuilders.request(m, url);
        if (who != null) rb.header("Authorization", "Bearer " + who.token());
        if (body != null) rb.contentType(MediaType.APPLICATION_JSON).content(body);
        var res = mvc.perform(rb).andReturn().getResponse();
        assertThat(res.getStatus()).as(m + " " + url + " -> " + res.getContentAsString()).isEqualTo(expected);
        String s = res.getContentAsString();
        return s.isBlank() ? null : json.readTree(s);
    }

    @BeforeEach
    void setup() throws Exception {
        owner = acct("owner", true);
        member = acct("member", true);
        other = acct("other", true);
    }

    String create(Acct who, String name, String visibility) throws Exception {
        return api(HttpMethod.POST, "/api/v1/communities", who,
            "{\"name\":\"" + name + "\",\"description\":\"d\",\"specialtyTag\":\"Cardiology\",\"visibility\":\"" + visibility + "\"}", 201).get("id").asText();
    }

    String roleId(String cid, String name) throws Exception {
        for (JsonNode r : api(HttpMethod.GET, "/api/v1/communities/" + cid + "/roles", owner, null, 200))
            if (r.get("name").asText().equals(name)) return r.get("id").asText();
        throw new AssertionError("no role " + name);
    }

    @Test
    void onlyVerifiedUsersCanCreateAndDefaultsAreSeeded() throws Exception {
        Acct unverified = acct("unver", false);
        api(HttpMethod.POST, "/api/v1/communities", unverified, "{\"name\":\"Nope Club\"}", 403);

        String id = create(owner, "Cardio Club", "PUBLIC");
        JsonNode c = api(HttpMethod.GET, "/api/v1/communities/" + id, owner, null, 200);
        assertThat(c.get("slug").asText()).startsWith("cardio-club");
        assertThat(c.get("memberCount").asInt()).isEqualTo(1);
        assertThat(c.get("myPermissions").toString()).contains("MANAGE_ROLES", "SEND_MESSAGES");

        JsonNode ch = api(HttpMethod.GET, "/api/v1/communities/" + id + "/channels", owner, null, 200);
        assertThat(ch).hasSize(2);
        assertThat(ch.get(0).get("name").asText()).isEqualTo("general");
        assertThat(ch.get(1).get("type").asText()).isEqualTo("ANNOUNCEMENT");
        assertThat(api(HttpMethod.GET, "/api/v1/communities/" + id + "/roles", owner, null, 200)).hasSize(4);
        assertThat(api(HttpMethod.GET, "/api/v1/communities", owner, null, 200)).hasSize(1);
    }

    @Test
    void validationAndPrivateVisibility() throws Exception {
        api(HttpMethod.POST, "/api/v1/communities", owner, "{\"name\":\"ab\"}", 400);
        String priv = create(owner, "Secret Society", "PRIVATE");
        api(HttpMethod.GET, "/api/v1/communities/" + priv, other, null, 404);
        api(HttpMethod.POST, "/api/v1/communities/" + priv + "/join", other, null, 404);
        String pub = create(owner, "Open Forum", "PUBLIC");
        JsonNode found = api(HttpMethod.GET, "/api/v1/communities/discover?q=open", other, null, 200);
        assertThat(found).hasSize(1);
        assertThat(found.get(0).get("id").asText()).isEqualTo(pub);
        assertThat(api(HttpMethod.GET, "/api/v1/communities/discover?q=secret", other, null, 200)).isEmpty();
    }

    @Test
    void memberLacksManagePermissionsAndChannelRules() throws Exception {
        String id = create(owner, "Neuro Club", "PUBLIC");
        api(HttpMethod.POST, "/api/v1/communities/" + id + "/join", member, null, 200);
        api(HttpMethod.POST, "/api/v1/communities/" + id + "/channels", member, "{\"name\":\"cases\"}", 403);
        api(HttpMethod.POST, "/api/v1/communities/" + id + "/roles", member, "{\"name\":\"X\",\"position\":5,\"permissions\":[]}", 403);

        JsonNode ch = api(HttpMethod.POST, "/api/v1/communities/" + id + "/channels", owner, "{\"name\":\"cases\",\"topic\":\"Case discussion\"}", 201);
        api(HttpMethod.POST, "/api/v1/communities/" + id + "/channels", owner, "{\"name\":\"Cases\"}", 400); // uppercase invalid
        api(HttpMethod.POST, "/api/v1/communities/" + id + "/channels", owner, "{\"name\":\"cases\"}", 409);
        JsonNode archived = api(HttpMethod.PATCH, "/api/v1/communities/" + id + "/channels/" + ch.get("id").asText(), owner, "{\"archived\":true,\"name\":\"old-cases\"}", 200);
        assertThat(archived.get("archived").asBoolean()).isTrue();
        assertThat(archived.get("name").asText()).isEqualTo("old-cases");
    }

    @Test
    void rolesHierarchyAndAssignment() throws Exception {
        String id = create(owner, "Rad Club", "PUBLIC");
        api(HttpMethod.POST, "/api/v1/communities/" + id + "/join", member, null, 200);
        api(HttpMethod.POST, "/api/v1/communities/" + id + "/join", other, null, 200);

        String admin = roleId(id, "Admin"), mod = roleId(id, "Moderator");
        api(HttpMethod.PUT, "/api/v1/communities/" + id + "/members/" + member.id() + "/roles", owner, "{\"roleIds\":[\"" + mod + "\"]}", 200);
        // moderator lacks MANAGE_ROLES
        api(HttpMethod.PUT, "/api/v1/communities/" + id + "/members/" + other.id() + "/roles", member, "{\"roleIds\":[\"" + mod + "\"]}", 403);

        // custom role below Admin, then promote 'member' to admin who can manage lower roles only
        JsonNode custom = api(HttpMethod.POST, "/api/v1/communities/" + id + "/roles", owner,
            "{\"name\":\"Fellow\",\"position\":4,\"permissions\":[\"SEND_MESSAGES\",\"CREATE_INVITE\"]}", 201);
        api(HttpMethod.POST, "/api/v1/communities/" + id + "/roles", owner, "{\"name\":\"fellow\",\"position\":4,\"permissions\":[]}", 409);
        api(HttpMethod.PUT, "/api/v1/communities/" + id + "/members/" + member.id() + "/roles", owner, "{\"roleIds\":[\"" + admin + "\"]}", 200);
        // admin cannot create a role at/above own rank, cannot touch Owner/Admin roles
        api(HttpMethod.POST, "/api/v1/communities/" + id + "/roles", member, "{\"name\":\"Boss\",\"position\":1,\"permissions\":[]}", 403);
        api(HttpMethod.PATCH, "/api/v1/communities/" + id + "/roles/" + roleId(id, "Owner"), member, "{\"permissions\":[]}", 403);
        api(HttpMethod.PATCH, "/api/v1/communities/" + id + "/roles/" + admin, member, "{\"permissions\":[]}", 403);
        // admin can assign lower roles, and never to the owner
        JsonNode roles = api(HttpMethod.PUT, "/api/v1/communities/" + id + "/members/" + other.id() + "/roles", member,
            "{\"roleIds\":[\"" + custom.get("id").asText() + "\"]}", 200);
        assertThat(roles.toString()).contains("Fellow", "Member");
        api(HttpMethod.PUT, "/api/v1/communities/" + id + "/members/" + owner.id() + "/roles", member, "{\"roleIds\":[]}", 403);
        // system roles can't be deleted; custom can
        api(HttpMethod.DELETE, "/api/v1/communities/" + id + "/roles/" + mod, owner, null, 400);
        api(HttpMethod.DELETE, "/api/v1/communities/" + id + "/roles/" + custom.get("id").asText(), owner, null, 204);
    }

    @Test
    void inviteLifecycle() throws Exception {
        String id = create(owner, "Invite Only", "PRIVATE");
        api(HttpMethod.POST, "/api/v1/communities/" + id + "/invites", member, "{}", 403);
        JsonNode inv = api(HttpMethod.POST, "/api/v1/communities/" + id + "/invites", owner, "{\"maxUses\":1,\"expiresInHours\":24}", 201);
        String code = inv.get("code").asText();

        assertThat(api(HttpMethod.GET, "/api/v1/invites/" + code, member, null, 200).get("valid").asBoolean()).isTrue();
        api(HttpMethod.POST, "/api/v1/invites/" + code + "/join", member, null, 200);
        api(HttpMethod.POST, "/api/v1/invites/" + code + "/join", member, null, 200); // idempotent for existing members
        api(HttpMethod.POST, "/api/v1/invites/" + code + "/join", other, null, 410);   // single use consumed
        assertThat(api(HttpMethod.GET, "/api/v1/invites/" + code, other, null, 200).get("valid").asBoolean()).isFalse();
        api(HttpMethod.POST, "/api/v1/invites/nope/join", other, null, 404);

        JsonNode inv2 = api(HttpMethod.POST, "/api/v1/communities/" + id + "/invites", owner, null, 201);
        api(HttpMethod.DELETE, "/api/v1/communities/" + id + "/invites/" + inv2.get("id").asText(), owner, null, 204);
        api(HttpMethod.POST, "/api/v1/invites/" + inv2.get("code").asText() + "/join", other, null, 410);
    }

    @Test
    void kickBanLeaveDelete() throws Exception {
        String id = create(owner, "Mod Squad", "PUBLIC");
        api(HttpMethod.POST, "/api/v1/communities/" + id + "/join", member, null, 200);
        api(HttpMethod.POST, "/api/v1/communities/" + id + "/join", other, null, 200);
        String mod = roleId(id, "Moderator");
        api(HttpMethod.PUT, "/api/v1/communities/" + id + "/members/" + member.id() + "/roles", owner, "{\"roleIds\":[\"" + mod + "\"]}", 200);

        api(HttpMethod.DELETE, "/api/v1/communities/" + id + "/members/" + owner.id(), member, null, 403); // can't remove the owner
        api(HttpMethod.DELETE, "/api/v1/communities/" + id + "/members/" + member.id(), other, null, 403);  // plain member can't kick
        api(HttpMethod.PUT, "/api/v1/communities/" + id + "/members/" + other.id() + "/ban", member, "{\"reason\":\"spam\"}", 204);
        assertThat(api(HttpMethod.GET, "/api/v1/communities/" + id + "/members", owner, null, 200)).hasSize(2);
        api(HttpMethod.POST, "/api/v1/communities/" + id + "/join", other, null, 403); // banned
        api(HttpMethod.DELETE, "/api/v1/communities/" + id + "/members/" + other.id() + "/ban", member, null, 204);
        api(HttpMethod.POST, "/api/v1/communities/" + id + "/join", other, null, 200);

        api(HttpMethod.DELETE, "/api/v1/communities/" + id + "/members/me", other, null, 204);
        api(HttpMethod.DELETE, "/api/v1/communities/" + id + "/members/me", owner, null, 409);
        api(HttpMethod.DELETE, "/api/v1/communities/" + id, member, null, 403);
        api(HttpMethod.DELETE, "/api/v1/communities/" + id, owner, null, 204);
        api(HttpMethod.GET, "/api/v1/communities/" + id, owner, null, 404);
    }

    @Test
    void requiresAuthentication() throws Exception {
        api(HttpMethod.GET, "/api/v1/communities", null, null, 401);
    }
}
