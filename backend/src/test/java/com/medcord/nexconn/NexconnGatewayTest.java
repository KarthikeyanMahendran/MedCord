package com.medcord.nexconn;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.medcord.common.ApiException;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

/** Uses a local stand-in server; no real Nexconn traffic. */
class NexconnGatewayTest {
    HttpServer server;
    final AtomicReference<com.sun.net.httpserver.Headers> seenHeaders = new AtomicReference<>();
    final AtomicReference<String> seenBody = new AtomicReference<>();
    volatile String reply = "{\"code\":0,\"result\":{\"userId\":\"abc\",\"accessToken\":\"TOKEN123\"}}";
    volatile int status = 200;

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v4/auth/access-token/issue", ex -> {
            seenHeaders.set(ex.getRequestHeaders());
            seenBody.set(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] out = reply.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(status, out.length);
            ex.getResponseBody().write(out);
            ex.close();
        });
        server.start();
    }

    @AfterEach
    void stop() { server.stop(0); }

    NexconnGateway gateway(String key, String secret) {
        String base = "http://127.0.0.1:" + server.getAddress().getPort();
        return new NexconnGateway(new NexconnProperties(key, secret, base), RestClient.builder());
    }

    @Test
    void signatureIsLowercaseSha1OfSecretNonceTimestamp() {
        assertThat(NexconnSigner.sign("secret", "123", "456")).isEqualTo(sha1Hex("secret123456"));
        assertThat(NexconnSigner.sign("secret", "123", "456")).matches("[0-9a-f]{40}");
        assertThat(NexconnSigner.next("s").nonce().length()).isLessThanOrEqualTo(18);
    }

    private static String sha1Hex(String in) {
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-1").digest(in.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    @Test
    void issuesTokenWithSignedHeaders() {
        var r = gateway("KEY1", "SECRET1").issueToken("user1", "Dr A", null);
        assertThat(r.accessToken()).isEqualTo("TOKEN123");
        var h = seenHeaders.get();
        assertThat(h.getFirst("App-Key")).isEqualTo("KEY1");
        assertThat(h.getFirst("Signature")).isEqualTo(NexconnSigner.sign("SECRET1", h.getFirst("Nonce"), h.getFirst("Timestamp")));
        assertThat(h.getFirst("X-Request-ID")).isNotBlank();
        assertThat(seenBody.get()).contains("\"userId\":\"user1\"").contains("\"name\":\"Dr A\"");
        assertThat(seenBody.get()).doesNotContain("SECRET1");
    }

    @Test
    void businessErrorBecomesBadGateway() {
        reply = "{\"code\":1000,\"message\":\"bad\"}";
        assertThatThrownBy(() -> gateway("K", "S").issueToken("u", "n", null))
            .isInstanceOf(ApiException.class).extracting(e -> ((ApiException) e).status().value()).isEqualTo(502);
    }

    @Test
    void upstreamFailureBecomesServiceUnavailable() {
        status = 401;
        reply = "{}";
        assertThatThrownBy(() -> gateway("K", "S").issueToken("u", "n", null))
            .isInstanceOf(ApiException.class).extracting(e -> ((ApiException) e).status().value()).isEqualTo(503);
    }

    @Test
    void notConfiguredIsServiceUnavailable() {
        var g = new NexconnGateway(new NexconnProperties("", "", ""), RestClient.builder());
        assertThat(g.enabled()).isFalse();
        assertThatThrownBy(() -> g.issueToken("u", "n", null)).isInstanceOf(ApiException.class);
    }

    @Test
    void userIdMappingHasNoHyphens() {
        String id = NexconnGateway.toNexconnUserId(UUID.randomUUID());
        assertThat(id).hasSize(32).matches("[0-9a-f]+");
    }
}
