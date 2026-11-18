package com.medcord.moderation;

import static org.assertj.core.api.Assertions.assertThat;

import com.medcord.audit.AuditRepository;
import com.medcord.support.ApiTestSupport;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

class ModerationFlowTest extends ApiTestSupport {
    @Autowired MuteRepository muteRepo;
    @Autowired AuditRepository auditRepo;
    Acct owner, mod, member, peer, outsider;
    String cid, general;

    @BeforeEach
    void setup() throws Exception {
        owner = acct("owner", true);
        mod = acct("mod", true);
        member = acct("member", true);
        peer = acct("peer", true);
        outsider = acct("outsider", true);
        cid = createCommunity(owner, "Mod Club");
        for (Acct a : new Acct[] {mod, member, peer}) join(a, cid);
        grantRole(owner, cid, mod, "Moderator");
        general = channelId(owner, cid, "general");
    }

    String post(Acct who, String body) throws Exception {
        return api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", who, "{\"body\":\"" + body + "\"}", 201).get("id").asText();
    }

    @Test
    void muteBlocksPostingUntilLiftedOrExpired() throws Exception {
        api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", member, "{\"body\":\"before\"}", 201);
        JsonNode m = api(HttpMethod.PUT, "/api/v1/communities/" + cid + "/members/" + member.id() + "/mute", mod, "{\"minutes\":30,\"reason\":\"spam\"}", 200);
        assertThat(m.get("displayName").asText()).isEqualTo("member");

        api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", member, "{\"body\":\"muted\"}", 403);
        post(peer, "others are fine");
        assertThat(api(HttpMethod.GET, "/api/v1/communities/" + cid + "/mutes", mod, null, 200)).hasSize(1);
        api(HttpMethod.GET, "/api/v1/channels/" + general + "/messages", member, null, 200); // muted users can still read

        api(HttpMethod.DELETE, "/api/v1/communities/" + cid + "/members/" + member.id() + "/mute", mod, null, 204);
        post(member, "back");

        api(HttpMethod.PUT, "/api/v1/communities/" + cid + "/members/" + member.id() + "/mute", mod, "{\"minutes\":5}", 200);
        CommunityMute row = muteRepo.findByCommunityIdAndUserId(UUID.fromString(cid), member.id()).orElseThrow();
        row.setUntil(Instant.now().minus(1, ChronoUnit.MINUTES));                              // expired mute no longer applies
        muteRepo.saveAndFlush(row);
        post(member, "expired mute");
    }

    @Test
    void muteRules() throws Exception {
        String url = "/api/v1/communities/" + cid + "/members/";
        api(HttpMethod.PUT, url + peer.id() + "/mute", member, "{\"minutes\":10}", 403);       // no MANAGE_MEMBERS
        api(HttpMethod.PUT, url + owner.id() + "/mute", mod, "{\"minutes\":10}", 403);         // higher rank
        api(HttpMethod.PUT, url + mod.id() + "/mute", mod, "{\"minutes\":10}", 400);           // self
        api(HttpMethod.PUT, url + peer.id() + "/mute", mod, "{\"minutes\":0}", 400);
        api(HttpMethod.PUT, url + peer.id() + "/mute", mod, "{\"minutes\":999999}", 400);
        api(HttpMethod.PUT, url + outsider.id() + "/mute", mod, "{\"minutes\":10}", 404);      // not a member
        api(HttpMethod.GET, "/api/v1/communities/" + cid + "/mutes", member, null, 403);
    }

    @Test
    void reportLifecycleWithDeletion() throws Exception {
        String bad = post(member, "Patient John Smith DOB 01-01-1970 has lupus");
        api(HttpMethod.POST, "/api/v1/messages/" + bad + "/report", peer, "{\"reason\":\"PHI\",\"details\":\"names a patient\"}", 201);
        api(HttpMethod.POST, "/api/v1/messages/" + bad + "/report", peer, "{\"reason\":\"SPAM\"}", 409);          // once per reporter
        api(HttpMethod.POST, "/api/v1/messages/" + bad + "/report", member, "{\"reason\":\"SPAM\"}", 400);        // own message
        api(HttpMethod.POST, "/api/v1/messages/" + bad + "/report", outsider, "{\"reason\":\"SPAM\"}", 403);      // not a member
        api(HttpMethod.POST, "/api/v1/messages/" + bad + "/report", owner, "{\"reason\":\"BOGUS\"}", 400);
        api(HttpMethod.POST, "/api/v1/messages/" + bad + "/report", owner, "{\"reason\":\"HARASSMENT\"}", 201);

        api(HttpMethod.GET, "/api/v1/communities/" + cid + "/reports", peer, null, 403);                           // queue is for moderators
        JsonNode queue = api(HttpMethod.GET, "/api/v1/communities/" + cid + "/reports?status=OPEN", mod, null, 200);
        assertThat(queue).hasSize(2);
        assertThat(queue.get(0).get("reason").asText()).isEqualTo("PHI");
        assertThat(queue.get(0).get("body").asText()).contains("lupus");
        assertThat(queue.get(0).get("authorName").asText()).isEqualTo("member");
        String rid = queue.get(0).get("id").asText();

        api(HttpMethod.PATCH, "/api/v1/communities/" + cid + "/reports/" + rid, mod, "{\"status\":\"OPEN\"}", 400);
        JsonNode done = api(HttpMethod.PATCH, "/api/v1/communities/" + cid + "/reports/" + rid, mod, "{\"status\":\"RESOLVED\",\"deleteMessage\":true}", 200);
        assertThat(done.get("status").asText()).isEqualTo("RESOLVED");
        assertThat(done.get("messageDeleted").asBoolean()).isTrue();
        assertThat(done.get("body").isNull()).isTrue();
        assertThat(done.get("handledByName").asText()).isEqualTo("mod");
        api(HttpMethod.PATCH, "/api/v1/communities/" + cid + "/reports/" + rid, mod, "{\"status\":\"DISMISSED\"}", 409); // already handled

        String page = api(HttpMethod.GET, "/api/v1/channels/" + general + "/messages", peer, null, 200).get("items").get(0).toString();
        assertThat(page).contains("\"deleted\":true");
        assertThat(api(HttpMethod.GET, "/api/v1/communities/" + cid + "/reports?status=OPEN", mod, null, 200)).hasSize(1);
        assertThat(api(HttpMethod.GET, "/api/v1/communities/" + cid + "/reports", mod, null, 200)).hasSize(2);
        api(HttpMethod.POST, "/api/v1/messages/" + bad + "/report", owner, "{\"reason\":\"SPAM\"}", 409);          // deleted message
    }

    @Test
    void dmMessagesCannotBeReported() throws Exception {
        String dm = api(HttpMethod.POST, "/api/v1/dms", member, "{\"userIds\":[\"" + peer.id() + "\"]}", 200).get("id").asText();
        String id = api(HttpMethod.POST, "/api/v1/channels/" + dm + "/messages", member, "{\"body\":\"hi\"}", 201).get("id").asText();
        api(HttpMethod.POST, "/api/v1/messages/" + id + "/report", peer, "{\"reason\":\"SPAM\"}", 400);
    }

    @Test
    void auditTrailRecordsSensitiveActionsForAdminsOnly() throws Exception {
        api(HttpMethod.POST, "/api/v1/communities/" + cid + "/channels", owner, "{\"name\":\"cases\"}", 201);
        api(HttpMethod.POST, "/api/v1/communities/" + cid + "/roles", owner, "{\"name\":\"Fellow\",\"position\":4,\"permissions\":[\"SEND_MESSAGES\"]}", 201);
        api(HttpMethod.PUT, "/api/v1/communities/" + cid + "/members/" + member.id() + "/mute", mod, "{\"minutes\":15,\"reason\":\"off topic\"}", 200);
        String msg = post(peer, "delete me");
        api(HttpMethod.DELETE, "/api/v1/messages/" + msg, mod, null, 204);
        api(HttpMethod.DELETE, "/api/v1/communities/" + cid + "/members/" + peer.id(), mod, null, 204);
        api(HttpMethod.PUT, "/api/v1/messages/" + post(owner, "rules") + "/pin", mod, null, 200);

        api(HttpMethod.GET, "/api/v1/communities/" + cid + "/audit", mod, null, 403);                               // moderators can't read it
        api(HttpMethod.GET, "/api/v1/communities/" + cid + "/audit", member, null, 403);
        JsonNode page = api(HttpMethod.GET, "/api/v1/communities/" + cid + "/audit?size=100", owner, null, 200);
        String all = page.get("items").toString();
        for (String a : new String[] {"COMMUNITY_CREATED", "CHANNEL_CREATED", "ROLE_CREATED", "ROLES_ASSIGNED", "MEMBER_MUTED",
            "MESSAGE_DELETED_BY_MOD", "MEMBER_REMOVED", "MESSAGE_PINNED"}) {
            assertThat(all).as(a).contains(a);
        }
        assertThat(page.get("items").get(0).get("actorName").asText()).isEqualTo("mod");                            // newest first
        JsonNode muted = api(HttpMethod.GET, "/api/v1/communities/" + cid + "/audit?action=MEMBER_MUTED", owner, null, 200);
        assertThat(muted.get("items")).hasSize(1);
        assertThat(muted.get("items").get(0).get("summary").asText()).contains("member").contains("15 min").contains("off topic");
        api(HttpMethod.GET, "/api/v1/communities/" + cid + "/audit", null, null, 401);
    }

    @Test
    void auditTrailSurvivesCommunityDeletion() throws Exception {
        api(HttpMethod.DELETE, "/api/v1/communities/" + cid, owner, null, 204);
        assertThat(auditRepo.forCommunity(UUID.fromString(cid), PageRequest.of(0, 50)).getContent())
            .extracting(a -> a.getAction()).contains("COMMUNITY_CREATED", "COMMUNITY_DELETED");
    }
}
