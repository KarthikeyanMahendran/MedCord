package com.medcord.message;

import static org.assertj.core.api.Assertions.assertThat;

import com.medcord.support.ApiTestSupport;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

class MessageFlowTest extends ApiTestSupport {
    @Autowired MessageRepository messageRepo;
    Acct owner, member, outsider;
    String cid, general, announcements;

    @BeforeEach
    void setup() throws Exception {
        owner = acct("owner", true);
        member = acct("member", true);
        outsider = acct("outsider", true);
        cid = createCommunity(owner, "Msg Club");
        join(member, cid);
        general = channelId(owner, cid, "general");
        announcements = channelId(owner, cid, "announcements");
    }

    JsonNode send(Acct who, String channel, String body, int expected) throws Exception {
        return api(HttpMethod.POST, "/api/v1/channels/" + channel + "/messages", who, "{\"body\":\"" + body + "\"}", expected);
    }

    @Test
    void sendAndListWithAuthorInfoAndReply() throws Exception {
        JsonNode first = send(owner, general, "Hello team", 201);
        assertThat(first.get("author").get("verified").asBoolean()).isTrue();
        JsonNode reply = api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", member,
            "{\"body\":\"Hi!\",\"replyToId\":\"" + first.get("id").asText() + "\"}", 201);
        assertThat(reply.get("replyTo").get("excerpt").asText()).isEqualTo("Hello team");
        assertThat(reply.get("replyTo").get("authorName").asText()).isEqualTo("owner");

        JsonNode page = api(HttpMethod.GET, "/api/v1/channels/" + general + "/messages", member, null, 200);
        assertThat(page.get("items")).hasSize(2);
        assertThat(page.get("items").get(0).get("body").asText()).isEqualTo("Hello team"); // oldest first
        assertThat(page.get("hasMore").asBoolean()).isFalse();
    }

    @Test
    void nonMembersAndInvalidBodiesAreRejected() throws Exception {
        send(outsider, general, "sneaky", 403);
        api(HttpMethod.GET, "/api/v1/channels/" + general + "/messages", outsider, null, 403);
        api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", member, "{\"body\":\"  \"}", 400);
        api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", member, "{\"body\":\"" + "x".repeat(4001) + "\"}", 400);
        api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", null, "{\"body\":\"x\"}", 401);
        api(HttpMethod.GET, "/api/v1/channels/" + UUID.randomUUID() + "/messages", member, null, 404);
    }

    @Test
    void announcementChannelsAndArchivedChannelsAreEnforced() throws Exception {
        send(member, announcements, "not allowed", 403);
        send(owner, announcements, "Official notice", 201);
        api(HttpMethod.PATCH, "/api/v1/communities/" + cid + "/channels/" + general, owner, "{\"archived\":true}", 200);
        send(owner, general, "after archive", 409);
        // history stays readable
        api(HttpMethod.GET, "/api/v1/channels/" + general + "/messages", member, null, 200);
    }

    @Test
    void replyTargetMustBeInSameChannel() throws Exception {
        JsonNode other = send(owner, announcements, "elsewhere", 201);
        api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", member,
            "{\"body\":\"x\",\"replyToId\":\"" + other.get("id").asText() + "\"}", 400);
    }

    @Test
    void cursorPagination() throws Exception {
        for (int i = 1; i <= 5; i++) send(owner, general, "m" + i, 201);
        JsonNode p1 = api(HttpMethod.GET, "/api/v1/channels/" + general + "/messages?limit=2", member, null, 200);
        assertThat(p1.get("items").get(0).get("body").asText()).isEqualTo("m4");
        assertThat(p1.get("items").get(1).get("body").asText()).isEqualTo("m5");
        assertThat(p1.get("hasMore").asBoolean()).isTrue();
        String cursor = p1.get("items").get(0).get("id").asText();
        JsonNode p2 = api(HttpMethod.GET, "/api/v1/channels/" + general + "/messages?limit=2&before=" + cursor, member, null, 200);
        assertThat(p2.get("items").get(0).get("body").asText()).isEqualTo("m2");
        assertThat(p2.get("items").get(1).get("body").asText()).isEqualTo("m3");
        assertThat(p2.get("hasMore").asBoolean()).isTrue();
        JsonNode p3 = api(HttpMethod.GET, "/api/v1/channels/" + general + "/messages?limit=2&before=" + p2.get("items").get(0).get("id").asText(), member, null, 200);
        assertThat(p3.get("items")).hasSize(1);
        assertThat(p3.get("hasMore").asBoolean()).isFalse();
        api(HttpMethod.GET, "/api/v1/channels/" + general + "/messages?before=" + UUID.randomUUID(), member, null, 400);
    }

    @Test
    void editWritesSnapshotsAndEnforcesRules() throws Exception {
        String id = send(member, general, "v1", 201).get("id").asText();
        api(HttpMethod.PATCH, "/api/v1/messages/" + id, owner, "{\"body\":\"hijack\"}", 403);   // not the author
        api(HttpMethod.PATCH, "/api/v1/messages/" + id, member, "{\"body\":\"v1\"}", 400);      // unchanged
        JsonNode e1 = api(HttpMethod.PATCH, "/api/v1/messages/" + id, member, "{\"body\":\"v2\"}", 200);
        assertThat(e1.get("body").asText()).isEqualTo("v2");
        assertThat(e1.get("editedAt").isNull()).isFalse();
        api(HttpMethod.PATCH, "/api/v1/messages/" + id, member, "{\"body\":\"v3\"}", 200);

        JsonNode hist = api(HttpMethod.GET, "/api/v1/messages/" + id + "/revisions", member, null, 200);
        assertThat(hist).hasSize(2);
        assertThat(hist.get(0).get("body").asText()).isEqualTo("v1");
        assertThat(hist.get(1).get("body").asText()).isEqualTo("v2");
        assertThat(hist.get(1).get("revisionNo").asInt()).isEqualTo(2);
        assertThat(hist.get(0).get("actorName").asText()).isEqualTo("member");
    }

    @Test
    void editWindowIsEnforced() throws Exception {
        String id = send(member, general, "old", 201).get("id").asText();
        Message m = messageRepo.findById(UUID.fromString(id)).orElseThrow();
        m.setCreatedAt(Instant.now().minus(3, ChronoUnit.DAYS));
        messageRepo.saveAndFlush(m);
        api(HttpMethod.PATCH, "/api/v1/messages/" + id, member, "{\"body\":\"too late\"}", 409);
    }

    @Test
    void historyVisibilityAndModeratorDelete() throws Exception {
        Acct mod = acct("mod", true), peer = acct("peer", true);
        join(mod, cid);
        join(peer, cid);
        grantRole(owner, cid, mod, "Moderator");
        String id = send(member, general, "secret v1", 201).get("id").asText();
        api(HttpMethod.PATCH, "/api/v1/messages/" + id, member, "{\"body\":\"secret v2\"}", 200);

        api(HttpMethod.GET, "/api/v1/messages/" + id + "/revisions", peer, null, 403);
        assertThat(api(HttpMethod.GET, "/api/v1/messages/" + id + "/revisions", mod, null, 200)).hasSize(1);

        api(HttpMethod.DELETE, "/api/v1/messages/" + id, peer, null, 403);
        api(HttpMethod.DELETE, "/api/v1/messages/" + id, mod, null, 204);
        api(HttpMethod.DELETE, "/api/v1/messages/" + id, mod, null, 204); // idempotent

        JsonNode hist = api(HttpMethod.GET, "/api/v1/messages/" + id + "/revisions", member, null, 200);
        assertThat(hist).hasSize(2);
        assertThat(hist.get(1).get("kind").asText()).isEqualTo("DELETE");
        assertThat(hist.get(1).get("body").asText()).isEqualTo("secret v2");
        assertThat(hist.get(1).get("actorName").asText()).isEqualTo("mod");

        JsonNode page = api(HttpMethod.GET, "/api/v1/channels/" + general + "/messages", peer, null, 200);
        JsonNode shown = page.get("items").get(0);
        assertThat(shown.get("deleted").asBoolean()).isTrue();
        assertThat(shown.get("body").isNull()).isTrue();
        api(HttpMethod.PATCH, "/api/v1/messages/" + id, member, "{\"body\":\"zombie\"}", 409);
    }

    @Test
    void replyToDeletedMessageShowsPlaceholder() throws Exception {
        String id = send(owner, general, "to be removed", 201).get("id").asText();
        api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", member, "{\"body\":\"re\",\"replyToId\":\"" + id + "\"}", 201);
        api(HttpMethod.DELETE, "/api/v1/messages/" + id, owner, null, 204);
        JsonNode items = api(HttpMethod.GET, "/api/v1/channels/" + general + "/messages", member, null, 200).get("items");
        JsonNode preview = items.get(1).get("replyTo");
        assertThat(preview.get("deleted").asBoolean()).isTrue();
        assertThat(preview.get("excerpt").isNull()).isTrue();
    }
}
