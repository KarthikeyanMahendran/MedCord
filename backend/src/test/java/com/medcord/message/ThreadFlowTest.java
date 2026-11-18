package com.medcord.message;

import static org.assertj.core.api.Assertions.assertThat;

import com.medcord.support.ApiTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

class ThreadFlowTest extends ApiTestSupport {
    Acct owner, member, outsider;
    String cid, general, announcements;

    @BeforeEach
    void setup() throws Exception {
        owner = acct("owner", true);
        member = acct("member", true);
        outsider = acct("outsider", true);
        cid = createCommunity(owner, "Thread Club");
        join(member, cid);
        general = channelId(owner, cid, "general");
        announcements = channelId(owner, cid, "announcements");
    }

    String post(Acct who, String channel, String body) throws Exception {
        return api(HttpMethod.POST, "/api/v1/channels/" + channel + "/messages", who, "{\"body\":\"" + body + "\"}", 201).get("id").asText();
    }

    JsonNode startThread(Acct who, String messageId, int expected) throws Exception {
        return api(HttpMethod.POST, "/api/v1/messages/" + messageId + "/thread", who, "{\"title\":\"Case 1\"}", expected);
    }

    JsonNode reply(Acct who, String threadId, String body, int expected) throws Exception {
        return api(HttpMethod.POST, "/api/v1/threads/" + threadId + "/messages", who, "{\"body\":\"" + body + "\"}", expected);
    }

    @Test
    void repliesLiveInTheThreadNotTheMainTimeline() throws Exception {
        String root = post(owner, general, "Interesting ECG, thoughts?");
        JsonNode t = startThread(member, root, 200);
        String tid = t.get("id").asText();
        assertThat(t.get("title").asText()).isEqualTo("Case 1");
        assertThat(t.get("replyCount").asLong()).isZero();

        reply(member, tid, "Looks like a RBBB pattern", 201);
        JsonNode second = reply(owner, tid, "Agreed, check the axis too", 201);
        assertThat(second.get("threadId").asText()).isEqualTo(tid);

        JsonNode main = api(HttpMethod.GET, "/api/v1/channels/" + general + "/messages", member, null, 200).get("items");
        assertThat(main).hasSize(1);                                           // replies hidden from the timeline
        JsonNode chip = main.get(0).get("thread");
        assertThat(chip.get("replyCount").asLong()).isEqualTo(2);
        assertThat(chip.get("id").asText()).isEqualTo(tid);
        assertThat(chip.get("lastReplyAt").isNull()).isFalse();

        JsonNode inThread = api(HttpMethod.GET, "/api/v1/threads/" + tid + "/messages", owner, null, 200);
        assertThat(inThread.get("items")).hasSize(2);
        assertThat(inThread.get("items").get(0).get("body").asText()).isEqualTo("Looks like a RBBB pattern");
        assertThat(api(HttpMethod.GET, "/api/v1/threads/" + tid, owner, null, 200).get("root").get("body").asText())
            .isEqualTo("Interesting ECG, thoughts?");
    }

    @Test
    void startingTwiceIsIdempotentAndNestingIsRejected() throws Exception {
        String root = post(owner, general, "root");
        String t1 = startThread(owner, root, 200).get("id").asText();
        assertThat(startThread(member, root, 200).get("id").asText()).isEqualTo(t1);
        String r = reply(owner, t1, "inside", 201).get("id").asText();
        startThread(owner, r, 400);                                              // no nested threads
    }

    @Test
    void accessRulesAreEnforced() throws Exception {
        String root = post(owner, general, "private-ish");
        startThread(outsider, root, 403);
        String tid = startThread(owner, root, 200).get("id").asText();
        reply(outsider, tid, "hi", 403);
        api(HttpMethod.GET, "/api/v1/threads/" + tid, outsider, null, 403);
        api(HttpMethod.GET, "/api/v1/threads/" + tid + "/messages", outsider, null, 403);
        api(HttpMethod.GET, "/api/v1/threads/" + UUID.randomUUID(), owner, null, 404);
        api(HttpMethod.POST, "/api/v1/threads/" + tid + "/messages", owner, "{\"body\":\" \"}", 400);
        startThread(null, root, 401);
    }

    @Test
    void announcementThreadsAllowMemberDiscussion() throws Exception {
        String notice = post(owner, announcements, "Maintenance on Friday");
        String tid = startThread(member, notice, 200).get("id").asText();
        reply(member, tid, "Thanks for the heads-up", 201);                      // allowed inside threads
        api(HttpMethod.POST, "/api/v1/channels/" + announcements + "/messages", member, "{\"body\":\"nope\"}", 403); // top-level still restricted
    }

    @Test
    void archiveRulesAndDeletedRepliesAreNotCounted() throws Exception {
        String root = post(owner, general, "topic");
        String tid = startThread(member, root, 200).get("id").asText();
        String a = reply(member, tid, "one", 201).get("id").asText();
        reply(member, tid, "two", 201);
        api(HttpMethod.DELETE, "/api/v1/messages/" + a, member, null, 204);
        assertThat(api(HttpMethod.GET, "/api/v1/threads/" + tid, owner, null, 200).get("replyCount").asLong()).isEqualTo(1);

        api(HttpMethod.PATCH, "/api/v1/threads/" + tid, outsider, "{\"archived\":true}", 403);
        Acct peer = acct("peer", true);
        join(peer, cid);
        api(HttpMethod.PATCH, "/api/v1/threads/" + tid, peer, "{\"archived\":true}", 403);                  // neither creator nor moderator
        api(HttpMethod.PATCH, "/api/v1/threads/" + tid, member, "{\"archived\":true}", 200);                // creator
        reply(owner, tid, "late", 409);
        api(HttpMethod.PATCH, "/api/v1/threads/" + tid, owner, "{\"archived\":false,\"title\":\"Renamed\"}", 200); // owner = moderator
        reply(owner, tid, "back again", 201);
    }

    @Test
    void replyTargetsStayInsideTheThread() throws Exception {
        String root = post(owner, general, "root");
        String other = post(owner, general, "unrelated");
        String tid = startThread(owner, root, 200).get("id").asText();
        api(HttpMethod.POST, "/api/v1/threads/" + tid + "/messages", member,
            "{\"body\":\"x\",\"replyToId\":\"" + other + "\"}", 400);
        JsonNode ok = api(HttpMethod.POST, "/api/v1/threads/" + tid + "/messages", member,
            "{\"body\":\"re root\",\"replyToId\":\"" + root + "\"}", 201);
        assertThat(ok.get("replyTo").get("excerpt").asText()).isEqualTo("root");
    }

    @Test
    void threadRepliesCanBeEditedWithSnapshots() throws Exception {
        String root = post(owner, general, "root");
        String tid = startThread(owner, root, 200).get("id").asText();
        String id = reply(member, tid, "v1", 201).get("id").asText();
        api(HttpMethod.PATCH, "/api/v1/messages/" + id, member, "{\"body\":\"v2\"}", 200);
        assertThat(api(HttpMethod.GET, "/api/v1/messages/" + id + "/revisions", member, null, 200)).hasSize(1);
    }
}
