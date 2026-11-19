package com.medcord.outbreak;

import static org.assertj.core.api.Assertions.assertThat;

import com.medcord.support.ApiTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

class OutbreakFlowTest extends ApiTestSupport {
    @Autowired JdbcClient jdbc;

    UUID region(String name) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO regions (id, name, district, state, lat, lng) VALUES (:id, :n, 'Test District', 'Test State', 11.5, 76.2)")
            .param("id", id).param("n", name + "-" + id).update();
        return id;
    }

    Acct admin() throws Exception {
        Acct a = acct("admin", true);
        jdbc.sql("UPDATE users SET platform_role = 'ADMIN' WHERE id = :id").param("id", a.id()).update();
        return a;
    }

    void submit(Acct who, UUID region, String complaint) throws Exception {
        String body = "{\"chiefComplaint\":\"" + complaint + "\",\"patientAge\":5,\"village\":\"Test Village\",\"regionId\":\"" + region + "\"}";
        api(HttpMethod.POST, "/api/v1/cases", who, body, 201);
    }

    JsonNode alertFor(Acct who, UUID region, String syndrome) throws Exception {
        for (JsonNode a : api(HttpMethod.GET, "/api/v1/outbreaks", who, null, 200).get("alerts")) {
            if (a.get("regionId").asText().equals(region.toString()) && a.get("syndrome").asText().equals(syndrome)) return a;
        }
        return null;
    }

    @Test
    void threeSimilarCasesInOneRegionOpenAnAlertAndNotify() throws Exception {
        Acct worker = acct("hw", false), doctor = acct("doc", true);
        UUID r = region("Cluster");

        submit(worker, r, "Child with fever and red rash for two days");
        submit(worker, r, "Girl with high fever and rash on face");
        assertThat(alertFor(doctor, r, "FEVER_RASH")).as("two cases are below the threshold").isNull();

        submit(worker, r, "Boy with fever, itchy rash and red eyes");
        JsonNode alert = alertFor(doctor, r, "FEVER_RASH");
        assertThat(alert).isNotNull();
        assertThat(alert.get("caseCount").asInt()).isEqualTo(3);
        assertThat(alert.get("severity").asText()).isEqualTo("WATCH");
        assertThat(alert.get("status").asText()).isEqualTo("OPEN");

        assertThat(api(HttpMethod.GET, "/api/v1/notifications", doctor, null, 200).toString()).contains("OUTBREAK").contains("Fever with rash");

        // staff see the cases (without identity), the team gets guidance and a timeline
        JsonNode d = api(HttpMethod.GET, "/api/v1/outbreaks/" + alert.get("id").asText(), doctor, null, 200);
        assertThat(d.get("canSeeCases").asBoolean()).isTrue();
        assertThat(d.get("cases")).hasSize(3);
        assertThat(d.get("guidance")).isNotEmpty();
        assertThat(d.toString()).doesNotContain("reporter").doesNotContain("email");
        int sum = 0;
        for (JsonNode n : d.get("timeline")) sum += n.asInt();
        assertThat(sum).isEqualTo(3);

        // a health worker sees the alert and guidance, but not the case list
        JsonNode w = api(HttpMethod.GET, "/api/v1/outbreaks/" + alert.get("id").asText(), worker, null, 200);
        assertThat(w.get("canSeeCases").asBoolean()).isFalse();
        assertThat(w.get("cases")).isEmpty();
        assertThat(w.get("guidance")).isNotEmpty();

        // three more cases double the threshold: severity rises to ALERT
        submit(worker, r, "Child fever and rash on the arms");
        submit(worker, r, "Fever with spreading rash, baby");
        submit(worker, r, "Boy with fever and rash on stomach");
        JsonNode grown = alertFor(doctor, r, "FEVER_RASH");
        assertThat(grown.get("caseCount").asInt()).isEqualTo(6);
        assertThat(grown.get("severity").asText()).isEqualTo("ALERT");
        assertThat(grown.get("id").asText()).as("same alert is updated, not duplicated").isEqualTo(alert.get("id").asText());
    }

    @Test
    void casesInDifferentRegionsOrGroupsDoNotMix() throws Exception {
        Acct worker = acct("hw", false), doctor = acct("doc", true);
        UUID a = region("A"), b = region("B");
        submit(worker, a, "Child with fever and rash");
        submit(worker, a, "Girl with fever and rash");
        submit(worker, b, "Boy with fever and rash");
        assertThat(alertFor(doctor, a, "FEVER_RASH")).isNull();
        assertThat(alertFor(doctor, b, "FEVER_RASH")).isNull();

        UUID c = region("C");
        submit(worker, c, "Watery diarrhoea and vomiting since morning");
        submit(worker, c, "Child with loose motion and vomiting");
        submit(worker, c, "Man with diarrhoea since two days");
        assertThat(alertFor(doctor, c, "WATERBORNE")).isNotNull();
        assertThat(alertFor(doctor, c, "FEVER_RASH")).isNull();
    }

    @Test
    void onlyStaffCanAcknowledgeAndOnlyAdminsCanClose() throws Exception {
        Acct worker = acct("hw", false), doctor = acct("doc", true), admin = admin();
        UUID r = region("Perms");
        for (String t : new String[] {"Fever and rash child", "Girl with fever and rash", "Boy fever and rash"}) submit(worker, r, t);
        String id = alertFor(doctor, r, "FEVER_RASH").get("id").asText();

        api(HttpMethod.POST, "/api/v1/outbreaks/" + id + "/acknowledge", worker, "{}", 403);
        JsonNode ack = api(HttpMethod.POST, "/api/v1/outbreaks/" + id + "/acknowledge", doctor, "{\"note\":\"District officer informed\"}", 200);
        assertThat(ack.get("status").asText()).isEqualTo("ACKNOWLEDGED");
        assertThat(ack.get("note").asText()).isEqualTo("District officer informed");
        assertThat(ack.get("acknowledgedBy").asText()).isEqualTo("doc");

        api(HttpMethod.POST, "/api/v1/outbreaks/" + id + "/resolve", doctor, null, 403);
        assertThat(api(HttpMethod.POST, "/api/v1/outbreaks/" + id + "/resolve", admin, null, 200).get("status").asText()).isEqualTo("RESOLVED");
        api(HttpMethod.POST, "/api/v1/outbreaks/" + id + "/acknowledge", doctor, "{}", 409);

        api(HttpMethod.GET, "/api/v1/outbreaks", null, null, 401);
        api(HttpMethod.GET, "/api/v1/outbreaks/" + UUID.randomUUID(), doctor, null, 404);
    }

    @Test
    void anAcknowledgedAlertStaysOpenForNewCases() throws Exception {
        Acct worker = acct("hw", false), doctor = acct("doc", true);
        UUID r = region("Grow");
        for (String t : new String[] {"Fever and rash child", "Girl with fever and rash", "Boy fever and rash"}) submit(worker, r, t);
        String id = alertFor(doctor, r, "FEVER_RASH").get("id").asText();
        api(HttpMethod.POST, "/api/v1/outbreaks/" + id + "/acknowledge", doctor, "{}", 200);
        submit(worker, r, "Another child with fever and rash");
        JsonNode a = alertFor(doctor, r, "FEVER_RASH");
        assertThat(a.get("id").asText()).isEqualTo(id);
        assertThat(a.get("caseCount").asInt()).isEqualTo(4);
        assertThat(a.get("status").asText()).isEqualTo("ACKNOWLEDGED");
    }

    @Test
    void demoRunsThroughTheRealPathAndResets() throws Exception {
        Acct doctor = acct("doc", true), admin = admin();
        api(HttpMethod.POST, "/api/v1/outbreaks/demo", doctor, null, 403);
        api(HttpMethod.DELETE, "/api/v1/outbreaks/demo", doctor, null, 403);

        JsonNode res = api(HttpMethod.POST, "/api/v1/outbreaks/demo", admin, null, 201);
        assertThat(res.get("created").asInt()).isEqualTo(3);
        JsonNode radar = api(HttpMethod.GET, "/api/v1/outbreaks", admin, null, 200);
        boolean found = false;
        for (JsonNode a : radar.get("alerts")) {
            if (a.get("demo").asBoolean() && a.get("regionName").asText().equals("Wayanad Hills")) found = true;
        }
        assertThat(found).as("the demo opens a Wayanad alert").isTrue();
        assertThat(radar.get("isAdmin").asBoolean()).isTrue();

        api(HttpMethod.DELETE, "/api/v1/outbreaks/demo", admin, null, 200);
        for (JsonNode a : api(HttpMethod.GET, "/api/v1/outbreaks", admin, null, 200).get("alerts")) assertThat(a.get("demo").asBoolean()).isFalse();
    }
}
