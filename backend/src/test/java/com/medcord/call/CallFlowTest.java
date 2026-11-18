package com.medcord.call;

import static org.assertj.core.api.Assertions.assertThat;

import com.medcord.support.ApiTestSupport;
import com.medcord.user.User;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

class CallFlowTest extends ApiTestSupport {
    @Autowired CallRepository callRepo;
    Acct alice, bob, carol, stranger;
    String cid, dm;

    @BeforeEach
    void setup() throws Exception {
        alice = acct("alice", true);
        bob = acct("bob", true);
        carol = acct("carol", true);
        stranger = acct("stranger", true);
        cid = createCommunity(alice, "Call Club");
        join(bob, cid);
        join(carol, cid);
        dm = api(HttpMethod.POST, "/api/v1/dms", alice, "{\"userIds\":[\"" + bob.id() + "\"]}", 200).get("id").asText();
    }

    JsonNode start(Acct who, String channel, String media, int expected) throws Exception {
        return api(HttpMethod.POST, "/api/v1/calls", who, "{\"channelId\":\"" + channel + "\",\"media\":\"" + media + "\"}", expected);
    }

    JsonNode end(Acct who, String callId, String outcome, int expected) throws Exception {
        return api(HttpMethod.POST, "/api/v1/calls/" + callId + "/end", who, "{\"outcome\":\"" + outcome + "\"}", expected);
    }

    JsonNode lastMessage(Acct who) throws Exception {
        JsonNode items = api(HttpMethod.GET, "/api/v1/channels/" + dm + "/messages", who, null, 200).get("items");
        return items.get(items.size() - 1);
    }

    @Test
    void answeredCallIsRecordedWithDuration() throws Exception {
        JsonNode call = start(alice, dm, "VIDEO", 201);
        String id = call.get("id").asText();
        assertThat(call.get("status").asText()).isEqualTo("RINGING");
        assertThat(call.get("callee").get("id").asText()).isEqualTo(bob.id().toString());
        assertThat(call.get("callee").get("providerUserId").asText()).isEqualTo(bob.id().toString().replace("-", ""));

        // the callee verifies the call before ringing
        JsonNode seen = api(HttpMethod.GET, "/api/v1/calls/" + id, bob, null, 200);
        assertThat(seen.get("caller").get("displayName").asText()).isEqualTo("alice");
        api(HttpMethod.POST, "/api/v1/calls/" + id + "/attach", alice, "{\"providerCallId\":\"nx-123\"}", 200);
        api(HttpMethod.POST, "/api/v1/calls/" + id + "/attach", bob, "{\"providerCallId\":\"nx-999\"}", 403);

        api(HttpMethod.POST, "/api/v1/calls/" + id + "/connected", bob, null, 200);
        api(HttpMethod.POST, "/api/v1/calls/" + id + "/connected", alice, null, 200);    // idempotent
        Call c = callRepo.findById(UUID.fromString(id)).orElseThrow();
        c.setConnectedAt(Instant.now().minus(754, ChronoUnit.SECONDS));                   // simulate 12:34 of talk time
        callRepo.saveAndFlush(c);

        JsonNode ended = end(bob, id, "MISSED", 200);                                      // connected calls always end as ENDED
        assertThat(ended.get("status").asText()).isEqualTo("ENDED");
        assertThat(ended.get("durationSeconds").asLong()).isBetween(754L, 756L);
        end(alice, id, "CANCELLED", 200);                                                  // second report is a no-op

        JsonNode msg = lastMessage(bob);
        assertThat(msg.get("kind").asText()).isEqualTo("CALL");
        assertThat(msg.get("body").asText()).isEqualTo("Video call · 12:34");
        assertThat(msg.get("callId").asText()).isEqualTo(id);
        assertThat(msg.get("author").get("id").asText()).isEqualTo(alice.id().toString());
        api(HttpMethod.PATCH, "/api/v1/messages/" + msg.get("id").asText(), alice, "{\"body\":\"edited\"}", 409);
        assertThat(api(HttpMethod.GET, "/api/v1/channels/" + dm + "/messages", bob, null, 200).get("items")).hasSize(1); // exactly one record
    }

    @Test
    void declineAndCancelAreAttributedCorrectly() throws Exception {
        String a = start(alice, dm, "AUDIO", 201).get("id").asText();
        end(alice, a, "DECLINED", 400);                                                    // only the callee declines
        assertThat(end(bob, a, "DECLINED", 200).get("status").asText()).isEqualTo("DECLINED");
        assertThat(lastMessage(alice).get("body").asText()).isEqualTo("Voice call declined");

        String b = start(bob, dm, "VIDEO", 201).get("id").asText();
        end(alice, b, "CANCELLED", 400);                                                   // only the caller cancels
        assertThat(end(bob, b, "CANCELLED", 200).get("status").asText()).isEqualTo("CANCELLED");
        assertThat(lastMessage(alice).get("body").asText()).isEqualTo("Missed video call");
        end(bob, b, "ENDED", 200);                                                         // already final: no-op
        start(alice, dm, "VIDEO", 201);                                                    // lines are free again
    }

    @Test
    void unansweredCallsExpireAsMissed() throws Exception {
        String id = start(alice, dm, "VIDEO", 201).get("id").asText();
        start(bob, dm, "VIDEO", 409);                                                      // bob is being rung
        Call c = callRepo.findById(UUID.fromString(id)).orElseThrow();
        c.setCreatedAt(Instant.now().minus(2, ChronoUnit.MINUTES));
        callRepo.saveAndFlush(c);

        assertThat(api(HttpMethod.GET, "/api/v1/calls/" + id, bob, null, 200).get("status").asText()).isEqualTo("MISSED");
        assertThat(lastMessage(bob).get("body").asText()).isEqualTo("Missed video call");
        api(HttpMethod.POST, "/api/v1/calls/" + id + "/connected", bob, null, 409);        // too late to answer
        start(bob, dm, "VIDEO", 201);                                                      // and nobody is busy any more
    }

    @Test
    void busyLinesAreRejected() throws Exception {
        start(alice, dm, "AUDIO", 201);
        start(alice, dm, "AUDIO", 409);                                                    // caller already in a call
        String other = api(HttpMethod.POST, "/api/v1/dms", carol, "{\"userIds\":[\"" + bob.id() + "\"]}", 200).get("id").asText();
        JsonNode busy = start(carol, other, "VIDEO", 409);                                 // bob is being rung by alice
        assertThat(busy.get("detail").asText()).contains("bob is on another call");
    }

    @Test
    void onlyOneToOneDirectMessagesAndOnlyParticipants() throws Exception {
        String group = api(HttpMethod.POST, "/api/v1/dms", alice, "{\"userIds\":[\"" + bob.id() + "\",\"" + carol.id() + "\"]}", 200).get("id").asText();
        start(alice, group, "VIDEO", 400);
        start(alice, channelId(alice, cid, "general"), "VIDEO", 400);
        start(carol, dm, "VIDEO", 404);                                                    // not part of the conversation
        start(alice, UUID.randomUUID().toString(), "VIDEO", 404);
        api(HttpMethod.POST, "/api/v1/calls", alice, "{\"channelId\":\"" + dm + "\",\"media\":\"HOLOGRAM\"}", 400);
        api(HttpMethod.POST, "/api/v1/calls", null, "{\"channelId\":\"" + dm + "\",\"media\":\"VIDEO\"}", 401);

        String id = start(alice, dm, "VIDEO", 201).get("id").asText();
        api(HttpMethod.GET, "/api/v1/calls/" + id, carol, null, 404);                     // outsiders can't see calls
        end(stranger, id, "CANCELLED", 404);
    }

    @Test
    void blockedOrSuspendedPeopleCannotBeCalled() throws Exception {
        api(HttpMethod.PUT, "/api/v1/users/" + alice.id() + "/block", bob, null, 204);
        start(alice, dm, "VIDEO", 403);
        start(bob, dm, "VIDEO", 403);
        api(HttpMethod.DELETE, "/api/v1/users/" + alice.id() + "/block", bob, null, 204);

        User u = users.findById(bob.id()).orElseThrow();
        u.setStatus(User.Status.SUSPENDED);
        users.saveAndFlush(u);
        start(alice, dm, "VIDEO", 403);
    }

    @Test
    void durationFormatting() {
        assertThat(CallService.formatDuration(0)).isEqualTo("0:00");
        assertThat(CallService.formatDuration(65)).isEqualTo("1:05");
        assertThat(CallService.formatDuration(3725)).isEqualTo("1:02:05");
    }
}
