package com.medcord.cases;

import static org.assertj.core.api.Assertions.assertThat;

import com.medcord.support.ApiTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

class CaseFlowTest extends ApiTestSupport {
    static final String CHEST_PAIN = """
        {"chiefComplaint":"Severe crushing chest pain with sweating since one hour","patientAge":58,"patientSex":"male",
         "village":"Demo Village","language":"ta","vitals":{"spo2":90,"heartRate":118}}""";

    @Test
    void redFlagCaseIsRoutedAcceptedAnsweredAndSearchable() throws Exception {
        Acct worker = acct("hw", false);
        Acct doctor = acct("doc", true);
        Acct other = acct("doc2", true);

        JsonNode res = api(HttpMethod.POST, "/api/v1/cases", worker, CHEST_PAIN, 201);
        JsonNode c = res.get("caseRoom");
        assertThat(c.get("urgency").asText()).isEqualTo("RED");
        assertThat(c.get("specialtyNeeded").asText()).isEqualTo("Cardiology");
        assertThat(c.get("status").asText()).isEqualTo("OPEN");
        assertThat(c.get("redFlags")).isNotEmpty();
        assertThat(c.get("sbar").get("recommendation").asText()).contains("Cardiology");
        String id = c.get("id").asText();

        // routed doctors are notified; the case is in the queue; a non-doctor cannot see the queue
        assertThat(api(HttpMethod.GET, "/api/v1/notifications", doctor, null, 200).toString()).contains("CASE_OFFER");
        assertThat(api(HttpMethod.GET, "/api/v1/cases/queue", doctor, null, 200).toString()).contains(id);
        api(HttpMethod.GET, "/api/v1/cases/queue", worker, null, 403);

        api(HttpMethod.POST, "/api/v1/cases/" + id + "/accept", doctor, null, 200);
        api(HttpMethod.POST, "/api/v1/cases/" + id + "/accept", other, null, 409);
        api(HttpMethod.POST, "/api/v1/cases/" + id + "/answer", other, "{\"answer\":\"Not mine\"}", 403);

        JsonNode done = api(HttpMethod.POST, "/api/v1/cases/" + id + "/answer", doctor,
            "{\"answer\":\"Aspirin 300 mg chewed, keep still, transfer to cath lab now.\"}", 200);
        assertThat(done.get("status").asText()).isEqualTo("RESOLVED");
        assertThat(api(HttpMethod.GET, "/api/v1/notifications", worker, null, 200).toString()).contains("CASE_ANSWERED");

        // verified answer library is searchable and anonymised (no village)
        JsonNode hits = api(HttpMethod.GET, "/api/v1/library?q=chest", worker, null, 200);
        assertThat(hits).isNotEmpty();
        assertThat(hits.toString()).doesNotContain("Demo Village");

        // a follow-up saying the patient got worse reopens the case as RED
        JsonNode reopened = api(HttpMethod.POST, "/api/v1/cases/" + id + "/followup", worker, "{\"outcome\":\"WORSE\"}", 200);
        assertThat(reopened.get("status").asText()).isEqualTo("OPEN");
        assertThat(reopened.get("urgency").asText()).isEqualTo("RED");
    }

    @Test
    void routineCaseIsGreenAndOnlyParticipantsOrDoctorsSeeIt() throws Exception {
        Acct worker = acct("hw", false);
        Acct stranger = acct("stranger", false);
        JsonNode c = api(HttpMethod.POST, "/api/v1/cases", worker,
            "{\"chiefComplaint\":\"Mild itchy rash on the arm for two days\",\"patientAge\":30,\"vitals\":{\"temperature\":37}}", 201).get("caseRoom");
        assertThat(c.get("urgency").asText()).isEqualTo("GREEN");
        assertThat(c.get("specialtyNeeded").asText()).isEqualTo("Dermatology");
        api(HttpMethod.GET, "/api/v1/cases/" + c.get("id").asText(), stranger, null, 404);
        assertThat(api(HttpMethod.GET, "/api/v1/cases/mine", worker, null, 200)).hasSize(1);
    }

    @Test
    void invalidInputIsRejected() throws Exception {
        Acct worker = acct("hw", false);
        api(HttpMethod.POST, "/api/v1/cases", worker, "{\"chiefComplaint\":\"\"}", 400);
        api(HttpMethod.POST, "/api/v1/cases", null, CHEST_PAIN, 401);
    }
}
