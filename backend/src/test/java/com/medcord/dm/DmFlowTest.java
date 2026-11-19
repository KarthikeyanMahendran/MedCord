package com.medcord.dm;

import static org.assertj.core.api.Assertions.assertThat;

import com.medcord.support.ApiTestSupport;
import com.medcord.user.User;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

class DmFlowTest extends ApiTestSupport {
    Acct alice, bob, carol, stranger;
    String cid;

    @BeforeEach
    void setup() throws Exception {
        alice = acct("alice", true);
        bob = acct("bob", true);
        carol = acct("carol", true);
        stranger = acct("stranger", true);
        cid = createCommunity(alice, "DM Club");
        join(bob, cid);
        join(carol, cid);
    }

    String dm(Acct who, int expected, Acct... others) throws Exception {
        StringBuilder ids = new StringBuilder();
        for (Acct o : others) ids.append(ids.isEmpty() ? "" : ",").append("\"").append(o.id()).append("\"");
        JsonNode r = api(HttpMethod.POST, "/api/v1/dms", who, "{\"userIds\":[" + ids + "]}", expected);
        return r == null || !r.has("id") ? null : r.get("id").asText();
    }

    JsonNode send(Acct who, String channel, String body, int expected) throws Exception {
        return api(HttpMethod.POST, "/api/v1/channels/" + channel + "/messages", who, "{\"body\":\"" + body + "\"}", expected);
    }

    @Test
    void oneToOneIsCreatedOnceAndSharedByBothSides() throws Exception {
        String a = dm(alice, 200, bob);
        assertThat(dm(bob, 200, alice)).isEqualTo(a);       // same conversation from the other side
        assertThat(dm(alice, 200, bob)).isEqualTo(a);       // idempotent
        JsonNode c = api(HttpMethod.GET, "/api/v1/dms/" + a, alice, null, 200);
        assertThat(c.get("group").asBoolean()).isFalse();
        assertThat(c.get("name").asText()).isEqualTo("bob");
        assertThat(api(HttpMethod.GET, "/api/v1/dms/" + a, bob, null, 200).get("name").asText()).isEqualTo("alice");
    }

    @Test
    void startRules() throws Exception {
        dm(alice, 403, stranger);                           // no shared community
        dm(alice, 400, alice);                              // only yourself
        api(HttpMethod.POST, "/api/v1/dms", alice, "{\"userIds\":[\"" + UUID.randomUUID() + "\"]}", 404); // unknown user
        api(HttpMethod.POST, "/api/v1/dms", alice, "{\"userIds\":[]}", 400);
        api(HttpMethod.POST, "/api/v1/dms", null, "{\"userIds\":[\"" + bob.id() + "\"]}", 401);

        Acct gone = acct("gone", true);
        join(gone, cid);
        User u = users.findById(gone.id()).orElseThrow();
        u.setStatus(User.Status.SUSPENDED);
        users.saveAndFlush(u);
        dm(alice, 403, gone);
    }

    @Test
    void messagingWorksInDmsIncludingEditsThreadsAndReactions() throws Exception {
        String ch = dm(alice, 200, bob);
        String id = send(alice, ch, "Can you review my slides?", 201).get("id").asText();
        JsonNode list = api(HttpMethod.GET, "/api/v1/channels/" + ch + "/messages", bob, null, 200);
        assertThat(list.get("items").get(0).get("body").asText()).isEqualTo("Can you review my slides?");

        api(HttpMethod.PATCH, "/api/v1/messages/" + id, alice, "{\"body\":\"Can you review my slides today?\"}", 200);
        api(HttpMethod.PATCH, "/api/v1/messages/" + id, bob, "{\"body\":\"hijack\"}", 403);
        api(HttpMethod.PUT, "/api/v1/messages/" + id + "/reactions/👍", bob, null, 200);
        String tid = api(HttpMethod.POST, "/api/v1/messages/" + id + "/thread", bob, "{}", 200).get("id").asText();
        api(HttpMethod.POST, "/api/v1/threads/" + tid + "/messages", alice, "{\"body\":\"sure\"}", 201);
        api(HttpMethod.PUT, "/api/v1/messages/" + id + "/pin", alice, null, 200);   // either person in a DM can pin
        api(HttpMethod.DELETE, "/api/v1/messages/" + id + "/pin", bob, null, 200);
        api(HttpMethod.DELETE, "/api/v1/messages/" + id, bob, null, 403);            // only the author deletes
        api(HttpMethod.DELETE, "/api/v1/messages/" + id, alice, null, 204);
    }

    @Test
    void outsidersCannotReadOrWrite() throws Exception {
        String ch = dm(alice, 200, bob);
        String id = send(alice, ch, "private", 201).get("id").asText();
        api(HttpMethod.GET, "/api/v1/channels/" + ch + "/messages", carol, null, 403);
        send(carol, ch, "intruder", 403);
        api(HttpMethod.GET, "/api/v1/dms/" + ch, carol, null, 404);
        api(HttpMethod.PUT, "/api/v1/messages/" + id + "/reactions/👍", carol, null, 403);
        api(HttpMethod.POST, "/api/v1/messages/" + id + "/thread", carol, "{}", 403);
        api(HttpMethod.GET, "/api/v1/messages/" + id + "/revisions", carol, null, 403);
    }

    @Test
    void groupDmAndListOrderedByLastActivity() throws Exception {
        String g = dm(alice, 200, bob, carol);
        assertThat(dm(carol, 200, alice, bob)).isEqualTo(g);                         // same set, any order
        JsonNode conv = api(HttpMethod.GET, "/api/v1/dms/" + g, alice, null, 200);
        assertThat(conv.get("group").asBoolean()).isTrue();
        assertThat(conv.get("participants")).hasSize(3);
        assertThat(conv.get("name").asText()).isEqualTo("bob, carol");

        String pair = dm(alice, 200, bob);
        send(alice, g, "group hello", 201);
        send(bob, pair, "latest in the pair chat", 201);
        JsonNode list = api(HttpMethod.GET, "/api/v1/dms", alice, null, 200);
        assertThat(list).hasSize(2);
        assertThat(list.get(0).get("id").asText()).isEqualTo(pair);                  // most recent first
        assertThat(list.get(0).get("lastMessage").get("excerpt").asText()).isEqualTo("latest in the pair chat");
        assertThat(list.get(0).get("lastMessage").get("authorName").asText()).isEqualTo("bob");
        assertThat(api(HttpMethod.GET, "/api/v1/dms", stranger, null, 200)).isEmpty();
    }

    @Test
    void groupSizeIsLimitedToTen() throws Exception {
        Acct[] many = new Acct[10];
        for (int i = 0; i < many.length; i++) { many[i] = acct("p" + i, true); join(many[i], cid); }
        dm(alice, 400, many);                                // 10 others + me = 11
        Acct[] nine = java.util.Arrays.copyOf(many, 9);
        assertThat(dm(alice, 200, nine)).isNotNull();        // 9 others + me = 10
    }

    @Test
    void blockingStopsMessagingBothWaysAndCanBeUndone() throws Exception {
        String ch = dm(alice, 200, bob);
        send(alice, ch, "before block", 201);
        api(HttpMethod.PUT, "/api/v1/users/" + alice.id() + "/block", alice, null, 400);        // not yourself
        api(HttpMethod.PUT, "/api/v1/users/" + UUID.randomUUID() + "/block", alice, null, 404);
        api(HttpMethod.PUT, "/api/v1/users/" + bob.id() + "/block", alice, null, 204);
        api(HttpMethod.PUT, "/api/v1/users/" + bob.id() + "/block", alice, null, 204);          // idempotent

        send(alice, ch, "after block", 403);
        send(bob, ch, "reply attempt", 403);
        dm(bob, 403, alice);                                                                    // can't (re)start a DM while blocked; the old one stays in the list
        assertThat(api(HttpMethod.GET, "/api/v1/dms", bob, null, 200)).hasSize(1);
        JsonNode mine = api(HttpMethod.GET, "/api/v1/dms/" + ch, alice, null, 200);
        JsonNode theirs = api(HttpMethod.GET, "/api/v1/dms/" + ch, bob, null, 200);
        assertThat(mine.get("blockedByMe").asBoolean()).isTrue();
        assertThat(theirs.get("blockedByThem").asBoolean()).isTrue();
        assertThat(api(HttpMethod.GET, "/api/v1/users/blocks", alice, null, 200)).hasSize(1);
        api(HttpMethod.GET, "/api/v1/channels/" + ch + "/messages", bob, null, 200);            // history still readable

        Acct dave = acct("dave", true);
        join(dave, cid);
        api(HttpMethod.PUT, "/api/v1/users/" + dave.id() + "/block", alice, null, 204);
        dm(alice, 403, dave);                                                                   // can't start a DM with someone you blocked
        dm(dave, 403, alice);                                                                   // nor they with you

        api(HttpMethod.DELETE, "/api/v1/users/" + bob.id() + "/block", alice, null, 204);
        send(bob, ch, "friends again", 201);
        assertThat(api(HttpMethod.GET, "/api/v1/users/blocks", alice, null, 200)).hasSize(1);   // dave remains
    }

    @Test
    void presenceReflectsHeartbeats() throws Exception {
        api(HttpMethod.POST, "/api/v1/presence/heartbeat", alice, null, 204);
        JsonNode members = api(HttpMethod.GET, "/api/v1/communities/" + cid + "/members", bob, null, 200);
        for (JsonNode m : members) {
            boolean expected = m.get("userId").asText().equals(alice.id().toString());
            assertThat(m.get("online").asBoolean()).as(m.get("displayName").asText()).isEqualTo(expected);
        }
        String ch = dm(bob, 200, alice);
        assertThat(api(HttpMethod.GET, "/api/v1/dms/" + ch, bob, null, 200).get("participants").toString()).contains("\"online\":true");
        api(HttpMethod.POST, "/api/v1/presence/heartbeat", null, null, 401);
    }
}
