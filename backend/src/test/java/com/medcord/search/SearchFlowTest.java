package com.medcord.search;

import static org.assertj.core.api.Assertions.assertThat;

import com.medcord.support.ApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

class SearchFlowTest extends ApiTestSupport {
    Acct owner, member, outsider;
    String cid, general, other;

    @BeforeEach
    void setup() throws Exception {
        owner = acct("owner", true);
        member = acct("member", true);
        outsider = acct("outsider", true);
        cid = createCommunity(owner, "Search Club");
        join(member, cid);
        general = channelId(owner, cid, "general");
        other = channelId(owner, cid, "announcements");
    }

    String post(Acct who, String channel, String body) throws Exception {
        return api(HttpMethod.POST, "/api/v1/channels/" + channel + "/messages", who, "{\"body\":\"" + body + "\"}", 201).get("id").asText();
    }

    JsonNode search(Acct who, String qs, int expected) throws Exception {
        return api(HttpMethod.GET, "/api/v1/search?" + qs, who, null, expected);
    }

    @Test
    void findsMessagesWithHighlightAndContext() throws Exception {
        post(owner, general, "Anticoagulation after stent placement needs careful review");
        post(member, general, "Lunch plans for Friday");
        JsonNode r = search(member, "q=anticoagulation", 200);
        assertThat(r.get("items")).hasSize(1);
        JsonNode hit = r.get("items").get(0);
        assertThat(hit.get("snippet").asText()).contains("Anticoagulation");
        assertThat(hit.get("channelName").asText()).isEqualTo("general");
        assertThat(hit.get("communityName").asText()).isEqualTo("Search Club");
        assertThat(hit.get("authorName").asText()).isEqualTo("owner");
        assertThat(hit.get("dm").asBoolean()).isFalse();
        assertThat(hit.get("snippet").asText()).doesNotContain("<mark>");
    }

    @Test
    void snippetsNeverContainServerGeneratedHtml() throws Exception {
        post(owner, general, "<script>alert(1)</script> stent");
        String s = search(member, "q=stent", 200).get("items").get(0).get("snippet").asText();
        assertThat(s).contains("stent");
        assertThat(s).doesNotContain("<mark>");     // highlighting uses private-use sentinels; the client renders text, never HTML
        assertThat(s).doesNotContain("<script>");   // the headline parser drops tag tokens
    }

    @Test
    void respectsAccessDeletionAndEdits() throws Exception {
        String id = post(owner, general, "Troponin elevated in this panel");
        assertThat(search(outsider, "q=troponin", 200).get("items")).isEmpty();      // not a member
        assertThat(search(member, "q=troponin", 200).get("items")).hasSize(1);

        api(HttpMethod.PATCH, "/api/v1/messages/" + id, owner, "{\"body\":\"Creatine kinase elevated instead\"}", 200);
        assertThat(search(member, "q=troponin", 200).get("items")).isEmpty();        // edit is searchable immediately
        assertThat(search(member, "q=creatine", 200).get("items")).hasSize(1);

        api(HttpMethod.DELETE, "/api/v1/messages/" + id, owner, null, 204);
        assertThat(search(member, "q=creatine", 200).get("items")).isEmpty();        // deleted never returned
    }

    @Test
    void dmsAreOnlySearchableByParticipants() throws Exception {
        String ch = api(HttpMethod.POST, "/api/v1/dms", owner, "{\"userIds\":[\"" + member.id() + "\"]}", 200).get("id").asText();
        post(owner, ch, "Confidential rotation schedule");
        JsonNode mine = search(member, "q=rotation", 200).get("items");
        assertThat(mine).hasSize(1);
        assertThat(mine.get(0).get("dm").asBoolean()).isTrue();
        assertThat(search(outsider, "q=rotation", 200).get("items")).isEmpty();
    }

    @Test
    void filtersPaginationAndValidation() throws Exception {
        for (int i = 0; i < 5; i++) post(owner, general, "heparin note " + i);
        post(member, other == null ? general : general, "heparin from member");
        post(owner, other, "heparin shortage announcement");

        assertThat(search(member, "q=heparin&channelId=" + other, 200).get("items")).hasSize(1);
        assertThat(search(member, "q=heparin&authorId=" + member.id(), 200).get("items")).hasSize(1);
        assertThat(search(member, "q=heparin&communityId=" + cid, 200).get("items")).hasSize(7);

        JsonNode p1 = search(member, "q=heparin&limit=3", 200);
        assertThat(p1.get("items")).hasSize(3);
        assertThat(p1.get("hasMore").asBoolean()).isTrue();
        JsonNode p3 = search(member, "q=heparin&limit=3&offset=6", 200);
        assertThat(p3.get("items")).hasSize(1);
        assertThat(p3.get("hasMore").asBoolean()).isFalse();

        assertThat(search(member, "q=heparin&from=2999-01-01T00:00:00Z", 200).get("items")).isEmpty();
        search(member, "q=a", 400);
        search(member, "q=" + "x".repeat(201), 400);
        api(HttpMethod.GET, "/api/v1/search?q=heparin", null, null, 401);
    }

    @Test
    void searchSyntaxIsSafe() throws Exception {
        post(owner, general, "metoprolol dosing guidance");
        // websearch syntax: quotes, OR and minus are supported; stray operators must not error
        assertThat(search(member, "q=\"metoprolol dosing\"", 200).get("items")).hasSize(1);
        assertThat(search(member, "q=metoprolol -guidance", 200).get("items")).isEmpty();
        search(member, "q=|!():*", 200);
    }
}
