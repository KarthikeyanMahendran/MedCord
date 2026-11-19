package com.medcord.fundraiser;

import static org.assertj.core.api.Assertions.assertThat;

import com.medcord.support.ApiTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

class FundraiserFlowTest extends ApiTestSupport {
    @Autowired JdbcClient jdbc;

    Acct worker(String p) throws Exception {
        Acct a = acct(p, false);
        jdbc.sql("UPDATE users SET status = 'ACTIVE' WHERE id = :u").param("u", a.id()).update();   // health workers are active at sign-up
        jdbc.sql("INSERT INTO health_worker_profiles (user_id, training_level) VALUES (:u, 'ASHA')").param("u", a.id()).update();
        return a;
    }

    String body(String community, String goal) {
        return "{\"communityId\":\"" + community + "\",\"title\":\"Surgery for Ravi\",\"story\":\"Ravi, 54, needs an urgent hernia operation and his family cannot pay for it.\","
            + "\"beneficiary\":\"Ravi, 54\",\"need\":\"SURGERY\",\"goalAmount\":" + goal + "}";
    }

    @Test
    void aDoctorRaisesAFundAndMembersContributeUntilItIsFunded() throws Exception {
        Acct doc = acct("doc", true), member = acct("mem", false), outsider = acct("out", false);
        String c = createCommunity(doc, "fund-" + UUID.randomUUID());
        join(member, c);

        JsonNode f = api(HttpMethod.POST, "/api/v1/fundraisers", doc, body(c, "1000"), 201);
        assertThat(f.get("status").asText()).as("a doctor's fundraiser goes live at once").isEqualTo("ACTIVE");
        String id = f.get("id").asText();

        // the community is told; outsiders cannot give
        assertThat(api(HttpMethod.GET, "/api/v1/notifications", member, null, 200).toString()).contains("New fundraiser");
        api(HttpMethod.POST, "/api/v1/fundraisers/" + id + "/contribute", doc, "{\"amount\":100}", 403);               // not your own
        api(HttpMethod.POST, "/api/v1/fundraisers/" + id + "/contribute", member, "{\"amount\":5}", 400);              // too small

        JsonNode d = api(HttpMethod.POST, "/api/v1/fundraisers/" + id + "/contribute", member, "{\"amount\":400,\"message\":\"Get well soon\"}", 200);
        assertThat(d.get("card").get("raisedAmount").asLong()).isEqualTo(400);
        assertThat(d.get("card").get("supporters").asInt()).isEqualTo(1);
        assertThat(d.get("myTotal").asLong()).isEqualTo(400);
        assertThat(api(HttpMethod.GET, "/api/v1/notifications", doc, null, 200).toString()).contains("contributed");

        // anonymous gifts hide the name
        JsonNode a = api(HttpMethod.POST, "/api/v1/fundraisers/" + id + "/contribute", member, "{\"amount\":100,\"anonymous\":true}", 200);
        assertThat(a.get("recent").get(0).get("name").asText()).isEqualTo("Anonymous");

        // reaching the goal marks it funded and stops new gifts
        JsonNode done = api(HttpMethod.POST, "/api/v1/fundraisers/" + id + "/contribute", member, "{\"amount\":600}", 200);
        assertThat(done.get("card").get("status").asText()).isEqualTo("FUNDED");
        api(HttpMethod.POST, "/api/v1/fundraisers/" + id + "/contribute", member, "{\"amount\":50}", 409);

        // the organiser says how the money was used, and the donors are told
        api(HttpMethod.POST, "/api/v1/fundraisers/" + id + "/updates", member, "{\"body\":\"Not allowed to post this\"}", 403);
        JsonNode u = api(HttpMethod.POST, "/api/v1/fundraisers/" + id + "/updates", doc, "{\"kind\":\"FUNDS_USED\",\"body\":\"Operation done, he is recovering well.\"}", 200);
        assertThat(u.get("updates").get(0).get("kind").asText()).isEqualTo("FUNDS_USED");
        assertThat(api(HttpMethod.GET, "/api/v1/notifications", member, null, 200).toString()).contains("How the money was used");
        api(HttpMethod.POST, "/api/v1/fundraisers/" + id + "/close", doc, null, 200);

        // visibility: a public community's fundraiser can be read by outsiders but not funded
        JsonNode seen = api(HttpMethod.GET, "/api/v1/fundraisers/" + id, outsider, null, 200);
        assertThat(seen.get("member").asBoolean()).isFalse();
        assertThat(api(HttpMethod.GET, "/api/v1/fundraisers/summary", outsider, null, 200).get("totalRaised").asLong()).isGreaterThanOrEqualTo(1100);
    }

    @Test
    void aHealthWorkersFundraiserNeedsADoctorsApprovalFirst() throws Exception {
        Acct doc = acct("doc", true), doc2 = acct("doc2", true), asha = worker("asha"), member = acct("mem", false);
        String c = createCommunity(doc, "fund-" + UUID.randomUUID());
        join(asha, c); join(member, c); join(doc2, c);

        JsonNode f = api(HttpMethod.POST, "/api/v1/fundraisers", asha, body(c, "5000"), 201);
        assertThat(f.get("status").asText()).isEqualTo("PENDING");
        String id = f.get("id").asText();
        assertThat(api(HttpMethod.GET, "/api/v1/notifications", doc, null, 200).toString()).contains("Please review");

        api(HttpMethod.POST, "/api/v1/fundraisers/" + id + "/contribute", member, "{\"amount\":100}", 409);          // not live yet
        api(HttpMethod.POST, "/api/v1/fundraisers/" + id + "/verify", asha, null, 403);                              // cannot approve yourself
        api(HttpMethod.POST, "/api/v1/fundraisers/" + id + "/verify", member, null, 403);                            // plain members cannot approve
        JsonNode ok = api(HttpMethod.POST, "/api/v1/fundraisers/" + id + "/verify", doc2, null, 200);
        assertThat(ok.get("status").asText()).isEqualTo("ACTIVE");
        assertThat(ok.get("verifiedByName").isNull()).isFalse();
        api(HttpMethod.POST, "/api/v1/fundraisers/" + id + "/contribute", member, "{\"amount\":100}", 200);

        // a rejected one tells the organiser what to fix
        String id2 = api(HttpMethod.POST, "/api/v1/fundraisers", asha, body(c, "2000"), 201).get("id").asText();
        api(HttpMethod.POST, "/api/v1/fundraisers/" + id2 + "/reject", doc, "{\"reason\":\"x\"}", 400);
        assertThat(api(HttpMethod.POST, "/api/v1/fundraisers/" + id2 + "/reject", doc, "{\"reason\":\"Please add the hospital name\"}", 200).get("status").asText()).isEqualTo("REJECTED");
        assertThat(api(HttpMethod.GET, "/api/v1/notifications", asha, null, 200).toString()).contains("needs changes");
    }

    @Test
    void creationIsCheckedAndPrivateDetailsAreRefused() throws Exception {
        Acct doc = acct("doc", true), plain = acct("plain", false), outsider = worker("out");
        String c = createCommunity(doc, "fund-" + UUID.randomUUID());
        join(plain, c);

        JsonNode bad = api(HttpMethod.POST, "/api/v1/fundraisers", doc, "{\"communityId\":\"" + c + "\",\"title\":\"x\",\"story\":\"short\",\"beneficiary\":\"\",\"need\":\"NOPE\",\"goalAmount\":5}", 400);
        for (String k : new String[] {"title", "story", "beneficiary", "need", "goalAmount"}) assertThat(bad.get("errors").has(k)).as(k).isTrue();

        String phone = body(c, "1000").replace("Ravi, 54, needs", "Call 9876543210 for Ravi, 54, who needs");
        assertThat(api(HttpMethod.POST, "/api/v1/fundraisers", doc, phone, 400).get("errors").has("story")).isTrue();

        api(HttpMethod.POST, "/api/v1/fundraisers", plain, body(c, "1000"), 403);       // a plain member who is neither doctor nor health worker
        api(HttpMethod.POST, "/api/v1/fundraisers", outsider, body(c, "1000"), 403);    // a health worker who has not joined the community
    }
}
