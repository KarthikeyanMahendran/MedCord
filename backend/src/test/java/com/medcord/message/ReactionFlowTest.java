package com.medcord.message;

import static org.assertj.core.api.Assertions.assertThat;

import com.medcord.support.ApiTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

class ReactionFlowTest extends ApiTestSupport {
    Acct owner, member, outsider, mod;
    String cid, general;

    @BeforeEach
    void setup() throws Exception {
        owner = acct("owner", true);
        member = acct("member", true);
        outsider = acct("outsider", true);
        mod = acct("mod", true);
        cid = createCommunity(owner, "React Club");
        join(member, cid);
        join(mod, cid);
        grantRole(owner, cid, mod, "Moderator");
        general = channelId(owner, cid, "general");
    }

    String post(Acct who, String body) throws Exception {
        return api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", who, "{\"body\":\"" + body + "\"}", 201).get("id").asText();
    }

    static String enc(String emoji) { return emoji; } // MockMvc encodes the path itself (a browser encodes once too)

    JsonNode react(Acct who, String id, String emoji, int expected) throws Exception {
        return api(HttpMethod.PUT, "/api/v1/messages/" + id + "/reactions/" + enc(emoji), who, null, expected);
    }

    @Test
    void countsAreSharedAndMineIsPerViewer() throws Exception {
        String id = post(owner, "Great news");
        react(member, id, "👍", 200);
        react(owner, id, "👍", 200);
        JsonNode afterTwo = react(mod, id, "🎉", 200);
        assertThat(afterTwo.get("reactions")).hasSize(2);

        JsonNode asMember = api(HttpMethod.GET, "/api/v1/channels/" + general + "/messages", member, null, 200).get("items").get(0);
        JsonNode thumbs = asMember.get("reactions").get(0);
        assertThat(thumbs.get("emoji").asText()).isEqualTo("👍");
        assertThat(thumbs.get("count").asLong()).isEqualTo(2);
        assertThat(thumbs.get("mine").asBoolean()).isTrue();
        JsonNode party = asMember.get("reactions").get(1);
        assertThat(party.get("mine").asBoolean()).isFalse();
    }

    @Test
    void addingTwiceIsIdempotentAndRemovingWorks() throws Exception {
        String id = post(owner, "toggle me");
        react(member, id, "✅", 200);
        JsonNode again = react(member, id, "✅", 200);
        assertThat(again.get("reactions").get(0).get("count").asLong()).isEqualTo(1);
        JsonNode removed = api(HttpMethod.DELETE, "/api/v1/messages/" + id + "/reactions/" + enc("✅"), member, null, 200);
        assertThat(removed.get("reactions")).isEmpty();
        api(HttpMethod.DELETE, "/api/v1/messages/" + id + "/reactions/" + enc("✅"), member, null, 200); // removing nothing is fine
    }

    @Test
    void validationAndStateRules() throws Exception {
        String id = post(owner, "rules");
        react(outsider, id, "👍", 403);
        react(member, id, "abc", 400);
        react(member, UUID.randomUUID().toString(), "👍", 404);
        api(HttpMethod.PUT, "/api/v1/messages/" + id + "/reactions/" + enc("👍"), null, null, 401);

        api(HttpMethod.DELETE, "/api/v1/messages/" + id, owner, null, 204);
        react(member, id, "👍", 409);                                              // deleted message
        String id2 = post(owner, "second");
        api(HttpMethod.PATCH, "/api/v1/communities/" + cid + "/channels/" + general, owner, "{\"archived\":true}", 200);
        react(member, id2, "👍", 409);                                             // archived channel
    }

    @Test
    void distinctEmojiLimitPerMessage() throws Exception {
        String id = post(owner, "popular");
        String[] set = {"😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😋","😎","😍","😘","🥰","😗","😙","😚","🙂","🤗"};
        for (String e : set) react(member, id, e, 200);
        react(member, id, "🙃", 409);                  // 21st distinct emoji
        react(owner, id, "😀", 200);                   // existing emoji can still be added by others
    }

    @Test
    void pinsRequireModerationAndAreListed() throws Exception {
        String a = post(owner, "Rules of the channel"), b = post(member, "Just chatting");
        api(HttpMethod.PUT, "/api/v1/messages/" + a + "/pin", member, null, 403);
        JsonNode pinned = api(HttpMethod.PUT, "/api/v1/messages/" + a + "/pin", mod, null, 200);
        assertThat(pinned.get("pinned").asBoolean()).isTrue();
        api(HttpMethod.PUT, "/api/v1/messages/" + a + "/pin", mod, null, 200); // idempotent
        api(HttpMethod.PUT, "/api/v1/messages/" + b + "/pin", owner, null, 200);

        JsonNode list = api(HttpMethod.GET, "/api/v1/channels/" + general + "/pins", member, null, 200);
        assertThat(list).hasSize(2);
        assertThat(list.get(0).get("body").asText()).isEqualTo("Just chatting");   // newest pin first
        api(HttpMethod.GET, "/api/v1/channels/" + general + "/pins", outsider, null, 403);

        api(HttpMethod.DELETE, "/api/v1/messages/" + a + "/pin", mod, null, 200);
        assertThat(api(HttpMethod.GET, "/api/v1/channels/" + general + "/pins", member, null, 200)).hasSize(1);
        api(HttpMethod.DELETE, "/api/v1/messages/" + b, member, null, 204);         // deleted messages drop out of pins
        assertThat(api(HttpMethod.GET, "/api/v1/channels/" + general + "/pins", member, null, 200)).isEmpty();
    }

    @Test
    void threadRepliesCannotBePinned() throws Exception {
        String root = post(owner, "root");
        String tid = api(HttpMethod.POST, "/api/v1/messages/" + root + "/thread", owner, "{}", 200).get("id").asText();
        String reply = api(HttpMethod.POST, "/api/v1/threads/" + tid + "/messages", member, "{\"body\":\"r\"}", 201).get("id").asText();
        api(HttpMethod.PUT, "/api/v1/messages/" + reply + "/pin", owner, null, 400);
        react(owner, reply, "👍", 200);                                           // but reactions work in threads
    }
}
