package com.medcord.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.medcord.support.ApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

class AiFlowTest extends ApiTestSupport {
    Acct doctor1, doctor2, outsider;
    String cid, generalChannel;

    @BeforeEach
    void setup() throws Exception {
        doctor1 = acct("doc1", true);
        doctor2 = acct("doc2", true);
        outsider = acct("outsider", true);

        cid = createCommunity(doctor1, "Cardiology Institute");
        join(doctor2, cid);
        generalChannel = channelId(doctor1, cid, "general");
    }

    String postMessage(Acct who, String channel, String body) throws Exception {
        return api(HttpMethod.POST, "/api/v1/channels/" + channel + "/messages", who, "{\"body\":\"" + body + "\"}", 201).get("id").asText();
    }

    @Test
    void ingestsAndAnswersQueryWithCitations() throws Exception {
        postMessage(doctor1, generalChannel, "Regarding diabetic ketoacidosis, IV fluid resuscitation is first priority.");
        postMessage(doctor2, generalChannel, "Agreed, regular insulin should follow once potassium is confirmed above 3.3.");

        // Ingest
        JsonNode ingestRes = api(HttpMethod.POST, "/api/v1/ai/ingest?communityId=" + cid, doctor1, null, 200);
        assertThat(ingestRes.get("totalMessagesProcessed").asInt()).isGreaterThanOrEqualTo(2);

        // Query by doctor2 who is a member of the community
        String queryPayload = "{\"question\":\"What are doctors saying about diabetic ketoacidosis?\",\"communityId\":\"" + cid + "\"}";
        JsonNode queryRes = api(HttpMethod.POST, "/api/v1/ai/query", doctor2, queryPayload, 200);

        assertThat(queryRes.has("answer")).isTrue();
        assertThat(queryRes.get("answer").asText()).isNotBlank();
        assertThat(queryRes.get("citations").isArray()).isTrue();
        assertThat(queryRes.get("citations").size()).isGreaterThanOrEqualTo(1);

        JsonNode citation = queryRes.get("citations").get(0);
        assertThat(citation.get("channelName").asText()).isEqualTo("general");
        assertThat(citation.get("communityName").asText()).isEqualTo("Cardiology Institute");
    }

    @Test
    void deniesOutsiderAccessToPrivateCommunityKnowledge() throws Exception {
        postMessage(doctor1, generalChannel, "Confidential case discussion regarding arrhythmias.");
        api(HttpMethod.POST, "/api/v1/ai/ingest?communityId=" + cid, doctor1, null, 200);

        String queryPayload = "{\"question\":\"Tell me about arrhythmias\",\"communityId\":\"" + cid + "\"}";
        api(HttpMethod.POST, "/api/v1/ai/query", outsider, queryPayload, 403);
    }

    @Test
    void rejectsInvalidQuery() throws Exception {
        String invalidPayload = "{\"question\":\"?\"}";
        api(HttpMethod.POST, "/api/v1/ai/query", doctor1, invalidPayload, 400);
    }
}
