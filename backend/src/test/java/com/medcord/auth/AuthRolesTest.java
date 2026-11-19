package com.medcord.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.medcord.support.ApiTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

/** Role-first sign-up and sign-in: health workers, ASHA workers, doctors and admins. */
class AuthRolesTest extends ApiTestSupport {
    @Autowired JdbcClient jdbc;

    UUID region() {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO regions (id, name, district, state, lat, lng) VALUES (:id, :n, 'Test District', 'Test State', 11.5, 76.2)")
            .param("id", id).param("n", "Auth-" + id).update();
        return id;
    }

    String email(String p) { return p + "-" + UUID.randomUUID() + "@test.dev"; }

    JsonNode post(String path, String body, int expected) throws Exception { return api(HttpMethod.POST, path, null, body, expected); }

    String workerBody(String email, UUID region, String type) { return workerBody(email, region, type, null); }

    String workerBody(String email, UUID region, String type, String nhmId) {
        return "{\"accountType\":\"HEALTH_WORKER\",\"workerType\":\"" + type + "\",\"email\":\"" + email + "\",\"password\":\"" + PW
            + "\",\"displayName\":\"Meena\",\"regionId\":\"" + region + "\",\"preferredLanguage\":\"ta\",\"organisation\":\"Test PHC\""
            + (nhmId == null ? "" : ",\"licenseNumber\":\"" + nhmId + "\"") + "}";
    }

    String doctorBody(String email, String lic) {
        return "{\"accountType\":\"DOCTOR\",\"email\":\"" + email + "\",\"password\":\"" + PW + "\",\"displayName\":\"Dr Test\","
            + "\"specialty\":\"Cardiology\",\"licenseNumber\":\"" + lic + "\",\"licenseCountry\":\"IN\"}";
    }

    String login(String email, String extra) { return "{\"email\":\"" + email + "\",\"password\":\"" + PW + "\"" + extra + "}"; }

    @Test
    void healthWorkerSignsUpActiveWithAnAreaAndCanSendACase() throws Exception {
        UUID r = region();
        String e = email("hw");
        JsonNode tokens = post("/api/v1/auth/register", workerBody(e, r, "ASHA", "NHM-" + UUID.randomUUID().toString().substring(0, 8)), 201);
        Acct hw = new Acct(null, tokens.get("accessToken").asText());

        JsonNode me = api(HttpMethod.GET, "/api/v1/me", hw, null, 200);
        assertThat(me.get("accountType").asText()).isEqualTo("HEALTH_WORKER");
        assertThat(me.get("status").asText()).isEqualTo("ACTIVE");
        assertThat(me.get("preferredLanguage").asText()).isEqualTo("ta");
        assertThat(me.get("verificationStatus").asText()).as("a worker is never an approved doctor").isNotEqualTo("APPROVED");

        String level = jdbc.sql("SELECT training_level FROM health_worker_profiles h JOIN users u ON u.id = h.user_id WHERE u.email = :e")
            .param("e", e).query(String.class).single();
        assertThat(level).isEqualTo("ASHA");

        // the worker's home area is used when a case does not name one, so the radar and map count it
        JsonNode sent = api(HttpMethod.POST, "/api/v1/cases", hw, "{\"chiefComplaint\":\"Child with mild cough\",\"patientAge\":6}", 201);
        assertThat(sent.get("caseRoom").get("urgency").asText()).isNotBlank();
        UUID caseRegion = jdbc.sql("SELECT region_id FROM cases WHERE id = CAST(:c AS uuid)").param("c", sent.get("caseRoom").get("id").asText()).query(UUID.class).single();
        assertThat(caseRegion).isEqualTo(r);
        // and a worker can not use the doctor queue
        api(HttpMethod.GET, "/api/v1/cases/queue", hw, null, 403);
    }

    @Test
    void signUpReportsExactlyWhichFieldsAreMissing() throws Exception {
        JsonNode noArea = post("/api/v1/auth/register",
            "{\"accountType\":\"HEALTH_WORKER\",\"email\":\"" + email("a") + "\",\"password\":\"" + PW + "\",\"displayName\":\"X\"}", 400);
        assertThat(noArea.get("errors").has("regionId")).isTrue();

        JsonNode badArea = post("/api/v1/auth/register", workerBody(email("b"), UUID.randomUUID(), "CHW"), 400);
        assertThat(badArea.get("errors").has("regionId")).isTrue();

        JsonNode noLicence = post("/api/v1/auth/register",
            "{\"accountType\":\"DOCTOR\",\"email\":\"" + email("c") + "\",\"password\":\"" + PW + "\",\"displayName\":\"X\"}", 400);
        assertThat(noLicence.get("errors").has("specialty")).isTrue();
        assertThat(noLicence.get("errors").has("licenseNumber")).isTrue();
        assertThat(noLicence.get("errors").has("licenseCountry")).isTrue();

        JsonNode noNhm = post("/api/v1/auth/register", workerBody(email("e"), region(), "ASHA"), 400);
        assertThat(noNhm.get("errors").has("licenseNumber")).as("an ASHA worker must give the NHM ID").isTrue();

        post("/api/v1/auth/register", "{\"accountType\":\"ADMIN\",\"email\":\"" + email("d") + "\",\"password\":\"" + PW + "\",\"displayName\":\"X\"}", 400);
    }

    @Test
    void olderClientsStillRegisterAsDoctorsWaitingForReview() throws Exception {
        String e = email("legacy");
        JsonNode t = post("/api/v1/auth/register", "{\"email\":\"" + e + "\",\"password\":\"" + PW + "\",\"displayName\":\"Dr Old\","
            + "\"specialty\":\"Cardiology\",\"licenseNumber\":\"L-" + UUID.randomUUID() + "\",\"licenseCountry\":\"IN\"}", 201);
        JsonNode me = api(HttpMethod.GET, "/api/v1/me", new Acct(null, t.get("accessToken").asText()), null, 200);
        assertThat(me.get("accountType").asText()).isEqualTo("DOCTOR");
        assertThat(me.get("status").asText()).isEqualTo("PENDING");
        assertThat(me.get("verificationStatus").asText()).isEqualTo("PENDING");
    }

    @Test
    void anAshaNhmIdIsUniqueAndSignInChecksIt() throws Exception {
        String nhm = "NHM-" + UUID.randomUUID().toString().substring(0, 8);
        String asha = email("asha"), chw = email("chw");
        post("/api/v1/auth/register", workerBody(asha, region(), "ASHA", nhm), 201);
        post("/api/v1/auth/register", workerBody(chw, region(), "CHW"), 201);
        assertThat(post("/api/v1/auth/register", workerBody(email("dup"), region(), "ASHA", nhm), 409).get("detail").asText()).contains("already registered");

        String as = ",\"accountType\":\"HEALTH_WORKER\",\"workerType\":\"ASHA\"";
        post("/api/v1/auth/login", login(asha, as + ",\"licenseNumber\":\"" + nhm + "\""), 200);
        post("/api/v1/auth/login", login(asha, as + ",\"licenseNumber\":\"  " + nhm.toLowerCase() + " \""), 200);
        assertThat(post("/api/v1/auth/login", login(asha, as + ",\"licenseNumber\":\"NHM-WRONG\""), 401).get("detail").asText()).contains("role or ID details do not match");
        assertThat(post("/api/v1/auth/login", login(asha, as), 400).get("errors").has("licenseNumber")).isTrue();
        // an ASHA account can not skip its ID by signing in as a plain health worker, and a plain worker can not claim ASHA
        post("/api/v1/auth/login", login(asha, ",\"accountType\":\"HEALTH_WORKER\",\"workerType\":\"CHW\""), 401);
        post("/api/v1/auth/login", login(chw, as + ",\"licenseNumber\":\"" + nhm + "\""), 401);
        post("/api/v1/auth/login", login(chw, ",\"accountType\":\"HEALTH_WORKER\",\"workerType\":\"CHW\""), 200);
        post("/api/v1/auth/login", login(chw, ",\"accountType\":\"HEALTH_WORKER\""), 200);
    }

    @Test
    void doctorsSignInWithSpecialityAndLicenceNumber() throws Exception {
        String lic = "LIC-" + UUID.randomUUID().toString().substring(0, 8);
        String doc = email("doc"), hw = email("hw"), adm = email("adm");
        post("/api/v1/auth/register", doctorBody(doc, lic), 201);                 // speciality Cardiology
        post("/api/v1/auth/register", workerBody(hw, region(), "CHW"), 201);
        post("/api/v1/auth/register", doctorBody(adm, "ADM-" + UUID.randomUUID()), 201);
        // Promote through the repository so the service sees the change (the test shares one transaction and persistence context).
        var admin = users.findByEmailIgnoreCase(adm).orElseThrow();
        admin.setPlatformRole(com.medcord.user.User.PlatformRole.ADMIN);
        admin.setStatus(com.medcord.user.User.Status.ACTIVE);
        users.saveAndFlush(admin);

        String d = ",\"accountType\":\"DOCTOR\"";
        // right speciality and licence (any letter case, spaces trimmed) work
        post("/api/v1/auth/login", login(doc, d + ",\"specialty\":\"Cardiology\",\"licenseNumber\":\"" + lic + "\""), 200);
        post("/api/v1/auth/login", login(doc, d + ",\"specialty\":\" cardiology \",\"licenseNumber\":\"  " + lic.toLowerCase() + " \""), 200);
        // wrong licence, wrong speciality
        assertThat(post("/api/v1/auth/login", login(doc, d + ",\"specialty\":\"Cardiology\",\"licenseNumber\":\"WRONG-1\""), 401).get("detail").asText())
            .contains("role or ID details do not match");
        post("/api/v1/auth/login", login(doc, d + ",\"specialty\":\"Neurology\",\"licenseNumber\":\"" + lic + "\""), 401);
        // each missing piece is named
        JsonNode both = post("/api/v1/auth/login", login(doc, d), 400);
        assertThat(both.get("errors").has("specialty")).isTrue();
        assertThat(both.get("errors").has("licenseNumber")).isTrue();
        assertThat(post("/api/v1/auth/login", login(doc, d + ",\"licenseNumber\":\"" + lic + "\""), 400).get("errors").has("specialty")).isTrue();
        // wrong role for the account
        post("/api/v1/auth/login", login(doc, ",\"accountType\":\"HEALTH_WORKER\""), 401);
        post("/api/v1/auth/login", login(doc, ",\"accountType\":\"ADMIN\""), 401);
        post("/api/v1/auth/login", login(hw, d + ",\"specialty\":\"Cardiology\",\"licenseNumber\":\"" + lic + "\""), 401);
        // admin
        post("/api/v1/auth/login", login(adm, ",\"accountType\":\"ADMIN\""), 200);
        post("/api/v1/auth/login", login(adm, ",\"accountType\":\"HEALTH_WORKER\""), 401);
        // no role given: the old behaviour; unknown role is rejected
        post("/api/v1/auth/login", login(doc, ""), 200);
        post("/api/v1/auth/login", login(doc, ",\"accountType\":\"WIZARD\""), 400);
    }

    @Test
    void aWrongPasswordNeverRevealsAnythingAboutTheRoleOrLicence() throws Exception {
        String lic = "LIC-" + UUID.randomUUID().toString().substring(0, 8), e = email("doc");
        post("/api/v1/auth/register", doctorBody(e, lic), 201);
        JsonNode bad = post("/api/v1/auth/login",
            "{\"email\":\"" + e + "\",\"password\":\"WrongPassw0rd\",\"accountType\":\"DOCTOR\",\"specialty\":\"Cardiology\",\"licenseNumber\":\"" + lic + "\"}", 401);
        assertThat(bad.get("detail").asText()).isEqualTo("Invalid email or password");
        JsonNode nobody = post("/api/v1/auth/login",
            "{\"email\":\"" + email("ghost") + "\",\"password\":\"" + PW + "\",\"accountType\":\"DOCTOR\",\"specialty\":\"Cardiology\",\"licenseNumber\":\"X\"}", 401);
        assertThat(nobody.get("detail").asText()).isEqualTo("Invalid email or password");
    }

    @Test
    void theSignUpFormListsAreOpenToEveryone() throws Exception {
        UUID r = region();
        JsonNode regions = api(HttpMethod.GET, "/api/v1/auth/regions", null, null, 200);
        boolean found = false;
        for (JsonNode n : regions) if (n.get("id").asText().equals(r.toString())) found = true;
        assertThat(found).isTrue();
        assertThat(regions.get(0).has("email")).isFalse();
        assertThat(api(HttpMethod.GET, "/api/v1/auth/specialties", null, null, 200)).isNotEmpty();
    }
}
