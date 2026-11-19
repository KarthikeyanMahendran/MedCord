package com.medcord.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

class SupportFlowTest extends ApiTestSupport {
    @Test
    void aVolunteerClaimsARequestAndBothFinishIt() throws Exception {
        Acct asker = acct("ask", false), helper = acct("help", false), other = acct("other", false);
        JsonNode d = api(HttpMethod.POST, "/api/v1/dispatch", asker,
            "{\"kind\":\"TRANSPORT\",\"urgency\":\"URGENT\",\"title\":\"Need a lift to the clinic tomorrow\",\"details\":\"Elderly mother, wheelchair\",\"area\":\"Meppadi\"}", 201);
        String id = d.get("id").asText();
        assertThat(d.get("status").asText()).isEqualTo("OPEN");

        assertThat(api(HttpMethod.GET, "/api/v1/dispatch", helper, null, 200).toString()).contains(id);
        api(HttpMethod.POST, "/api/v1/dispatch/" + id + "/claim", asker, null, 403);          // not your own
        JsonNode c = api(HttpMethod.POST, "/api/v1/dispatch/" + id + "/claim", helper, null, 200);
        assertThat(c.get("status").asText()).isEqualTo("CLAIMED");
        api(HttpMethod.POST, "/api/v1/dispatch/" + id + "/claim", other, null, 409);          // already taken
        assertThat(api(HttpMethod.GET, "/api/v1/notifications", asker, null, 200).toString()).contains("can help");
        api(HttpMethod.POST, "/api/v1/dispatch/" + id + "/done", other, null, 403);
        assertThat(api(HttpMethod.POST, "/api/v1/dispatch/" + id + "/done", helper, null, 200).get("status").asText()).isEqualTo("DONE");
        assertThat(api(HttpMethod.GET, "/api/v1/dispatch?scope=mine", helper, null, 200).toString()).contains(id);
        assertThat(api(HttpMethod.GET, "/api/v1/dispatch", other, null, 200).toString()).doesNotContain(id);
    }

    @Test
    void dispatchRefusesPhoneNumbersAndBlankRequests() throws Exception {
        Acct a = acct("ask", false);
        JsonNode bad = api(HttpMethod.POST, "/api/v1/dispatch", a, "{\"kind\":\"NOPE\",\"title\":\"x\"}", 400);
        assertThat(bad.get("errors").has("kind")).isTrue();
        assertThat(bad.get("errors").has("title")).isTrue();
        assertThat(api(HttpMethod.POST, "/api/v1/dispatch", a, "{\"kind\":\"FOOD\",\"title\":\"Food please, call 9876543210\"}", 400).get("errors").has("title")).isTrue();
    }

    @Test
    void checkinsAreSharedWithCommunityMembersWhoCanSendAKindWord() throws Exception {
        Acct owner = acct("own", true), friend = acct("fri", false), stranger = acct("str", false);
        String c = createCommunity(owner, "circle-" + UUID.randomUUID());
        join(friend, c);

        api(HttpMethod.POST, "/api/v1/checkins", friend, "{\"mood\":9}", 400);
        JsonNode mine = api(HttpMethod.POST, "/api/v1/checkins", friend, "{\"mood\":2,\"note\":\"Feeling tired and worried today\"}", 200);
        assertThat(mine.get("doneToday").asBoolean()).isTrue();
        assertThat(mine.get("streak").asInt()).isEqualTo(1);

        JsonNode circle = api(HttpMethod.GET, "/api/v1/checkins/circle", owner, null, 200);
        assertThat(circle).hasSize(1);
        assertThat(circle.get(0).get("needsKindWord").asBoolean()).isTrue();
        assertThat(api(HttpMethod.GET, "/api/v1/checkins/circle", stranger, null, 200)).isEmpty();      // not in a shared community

        String id = circle.get(0).get("id").asText();
        api(HttpMethod.POST, "/api/v1/checkins/" + id + "/cheer", stranger, null, 403);
        api(HttpMethod.POST, "/api/v1/checkins/" + id + "/cheer", owner, null, 204);
        api(HttpMethod.POST, "/api/v1/checkins/" + id + "/cheer", owner, null, 204);                      // second cheer changes nothing
        assertThat(api(HttpMethod.GET, "/api/v1/checkins/circle", owner, null, 200).get(0).get("cheers").asInt()).isEqualTo(1);
        assertThat(api(HttpMethod.GET, "/api/v1/notifications", friend, null, 200).toString()).contains("thinking of you");

        // a private check-in is not shown to the circle
        api(HttpMethod.POST, "/api/v1/checkins", friend, "{\"mood\":4,\"shared\":false}", 200);
        assertThat(api(HttpMethod.GET, "/api/v1/checkins/circle", owner, null, 200).get(0).get("mood").asInt()).isEqualTo(2);
    }
}
