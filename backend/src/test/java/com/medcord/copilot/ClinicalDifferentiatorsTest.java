package com.medcord.copilot;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

import com.medcord.support.ApiTestSupport;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockMultipartFile;
import tools.jackson.databind.JsonNode;

class ClinicalDifferentiatorsTest extends ApiTestSupport {
    Acct owner, member;
    String cid, general;

    @BeforeEach
    void setup() throws Exception {
        owner = acct("Dr Priya", true);
        member = acct("Dr Arjun", true);
        cid = createCommunity(owner, "Cardio ICU");
        join(member, cid);
        general = channelId(owner, cid, "general");
    }

    @Test
    void phiGuardrailBlocksInStrictModeAutoRedactsAndLogsCategoriesOnly() throws Exception {
        // Default mode is WARN
        JsonNode policy = api(HttpMethod.GET, "/api/v1/communities/" + cid + "/safety", owner, null, 200);
        assertThat(policy.get("phiMode").asText()).isEqualTo("WARN");

        // Switch to STRICT_BLOCK and add custom restricted term
        JsonNode updated = api(HttpMethod.PUT, "/api/v1/communities/" + cid + "/safety", owner,
            "{\"phiMode\":\"STRICT_BLOCK\",\"autoRedact\":false}", 200);
        assertThat(updated.get("phiMode").asText()).isEqualTo("STRICT_BLOCK");

        JsonNode term = api(HttpMethod.POST, "/api/v1/communities/" + cid + "/safety/terms", owner,
            "{\"term\":\"Mercy Ward 7\"}", 201);
        assertThat(term.get("term").asText()).isEqualTo("Mercy Ward 7");

        // Pre-send scan flags PHI
        JsonNode scan = api(HttpMethod.POST, "/api/v1/channels/" + general + "/phi-scan", member,
            "{\"body\":\"Patient: John Doe MRN 998123 from Mercy Ward 7\"}", 200);
        assertThat(scan.get("hasPhi").asBoolean()).isTrue();
        assertThat(scan.get("redactedText").asText()).doesNotContain("John Doe", "998123", "Mercy Ward 7");

        // Sending raw PHI in STRICT_BLOCK returns 422 with redactedSuggestion
        JsonNode blocked = api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", member,
            "{\"body\":\"Patient: John Doe MRN 998123\"}", 422);
        assertThat(blocked.get("code").asText()).isEqualTo("PHI_DETECTED");
        assertThat(blocked.get("redactedSuggestion").asText()).doesNotContain("998123");

        // Sending with autoRedact=true succeeds and stores only redacted text
        JsonNode redactedMsg = api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", member,
            "{\"body\":\"Patient: John Doe MRN 998123 stable\",\"autoRedact\":true}", 201);
        assertThat(redactedMsg.get("body").asText()).doesNotContain("John Doe", "998123");

        // Audit log recorded PHI_BLOCKED and PHI_REDACTED without storing raw patient identifiers
        JsonNode audit = api(HttpMethod.GET, "/api/v1/communities/" + cid + "/audit", owner, null, 200);
        String auditJson = audit.toString();
        assertThat(auditJson).contains("PHI_BLOCKED", "PHI_REDACTED");
        assertThat(auditJson).doesNotContain("John Doe", "998123");
    }

    @Test
    void voiceNoteUploadAndTranscriptionWorkEndToEnd() throws Exception {
        // Minimal OGG magic bytes ("OggS" + payload)
        byte[] fakeOgg = "OggS\u0000\u0002voice-consult-audio-payload".getBytes(StandardCharsets.ISO_8859_1);
        MockMultipartFile voice = new MockMultipartFile("file", "consult.ogg", "audio/ogg", fakeOgg);

        var uploadRes = mvc.perform(multipart("/api/v1/channels/" + general + "/attachments")
                .file(voice)
                .param("durationSeconds", "14")
                .header("Authorization", "Bearer " + owner.token()))
            .andReturn().getResponse();
        assertThat(uploadRes.getStatus()).isEqualTo(201);
        JsonNode att = json.readTree(uploadRes.getContentAsString());
        String attId = att.get("id").asText();
        assertThat(att.get("contentType").asText()).isEqualTo("audio/ogg");
        assertThat(att.get("durationSeconds").asInt()).isEqualTo(14);

        // Voice-only message gets kind VOICE
        JsonNode msg = api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", owner,
            "{\"body\":\"\",\"attachmentIds\":[\"" + attId + "\"]}", 201);
        assertThat(msg.get("kind").asText()).isEqualTo("VOICE");

        // Transcribe endpoint stores PHI-redacted transcript
        JsonNode transcribed = api(HttpMethod.POST, "/api/v1/attachments/" + attId + "/transcribe", member,
            "{\"transcript\":\"BP 142/88, troponin rising, MRN 445566 needs echo\"}", 200);
        assertThat(transcribed.get("transcriptStatus").asText()).isEqualTo("COMPLETED");
        assertThat(transcribed.get("transcript").asText())
            .contains("troponin rising")
            .doesNotContain("445566");
    }

    @Test
    void clinicalCopilotStreamsAndPersistsDeidentifiedSummary() throws Exception {
        api(HttpMethod.POST, "/api/v1/channels/" + general + "/messages", owner,
            "{\"body\":\"62M chest pain, ST-elevation V2-V4, troponin 1.8. Should we load heparin now?\"}", 201);

        JsonNode res = api(HttpMethod.POST, "/api/v1/channels/" + general + "/copilot", member,
            "{\"mode\":\"SUMMARIZE\"}", 201);
        assertThat(res.get("streamId").asText()).startsWith("mc-stream-");
        assertThat(res.get("message").get("kind").asText()).isEqualTo("AI");
        String aiMsgId = res.get("message").get("id").asText();

        // Wait briefly for the virtual streaming thread to finish persisting the full markdown body
        String finalBody = "";
        for (int i = 0; i < 30; i++) {
            JsonNode page = api(HttpMethod.GET, "/api/v1/channels/" + general + "/messages", member, null, 200);
            for (JsonNode item : page.get("items")) {
                if (aiMsgId.equals(item.get("id").asText())) {
                    finalBody = item.get("body").asText();
                }
            }
            if (finalBody.contains("Clinical Case Summary")) break;
            Thread.sleep(100);
        }
        assertThat(finalBody).contains("Clinical Case Summary", "Clinical Decision-Support Notice");
    }
}
