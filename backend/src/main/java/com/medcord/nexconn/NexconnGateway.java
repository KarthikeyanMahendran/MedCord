

package com.medcord.nexconn;

import com.medcord.common.ApiException;
import java.io.InputStream;
import java.net.http.HttpClient;
import java.security.KeyStore;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Single entry point for Nexconn Server API calls (signing, errors, timeouts).
 * Domain code must not call Nexconn any other way (see CLAUDE.md).
 *
 * <p>Uses a custom SSLContext that trusts the network-local CA that signs
 * api.sg-light-api.com (a FortiGate inspection proxy).  Hostname verification
 * is always enforced; we never skip certificate validation.
 */
@Component
public class NexconnGateway {
    private static final Logger log = LoggerFactory.getLogger(NexconnGateway.class);

    private final NexconnProperties props;
    private final RestClient http;

    @Autowired
    public NexconnGateway(NexconnProperties props) {
        this(props, RestClient.builder().requestFactory(buildRequestFactory()));
    }

    NexconnGateway(NexconnProperties props, RestClient.Builder builder) {
        this.props = props;
        this.http = builder.build();
    }

    /**
     * Builds a JDK HttpClient request factory that:
     * <ul>
     *   <li>Trusts the Nexconn endpoint CA stored in {@code certs/nexconn-ca.pem}
     *       (a FortiGate appliance acting as a local TLS inspection proxy).</li>
     *   <li>Also inherits the JVM default trust store so all other HTTPS calls
     *       continue to work normally.</li>
     *   <li>Always verifies the hostname — SSL inspection is not disabled.</li>
     * </ul>
     */
    private static JdkClientHttpRequestFactory buildRequestFactory() {
        try {
            // --- Load the custom CA cert from classpath ---
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            KeyStore ks = KeyStore.getInstance(KeyStore.getDefaultType());
            ks.load(null, null); // empty keystore

            // Load JVM default trust entries so other HTTPS calls are unaffected
            TrustManagerFactory defaultTmf = TrustManagerFactory.getInstance(
                    TrustManagerFactory.getDefaultAlgorithm());
            defaultTmf.init((KeyStore) null);

            // Parse every PEM block from our bundled cert file (may be a chain)
            try (InputStream pem = NexconnGateway.class
                    .getResourceAsStream("/certs/nexconn-ca.pem")) {
                if (pem != null) {
                    int idx = 0;
                    for (java.security.cert.Certificate cert : cf.generateCertificates(pem)) {
                        ks.setCertificateEntry("nexconn-ca-" + idx++, cert);
                    }
                    log.info("Loaded {} cert(s) from nexconn-ca.pem into custom truststore", idx);
                } else {
                    log.warn("nexconn-ca.pem not found on classpath; using JVM default trust store");
                }
            }

            // Merge: start with JVM defaults, then add our certs
            TrustManagerFactory tmf = TrustManagerFactory.getInstance(
                    TrustManagerFactory.getDefaultAlgorithm());
            tmf.init(ks);

            // Build a merged TrustManager that checks our store first, then JVM defaults
            var ourManagers   = tmf.getTrustManagers();
            var defManagers   = defaultTmf.getTrustManagers();
            javax.net.ssl.X509TrustManager ourTm  = findX509TrustManager(ourManagers);
            javax.net.ssl.X509TrustManager defTm  = findX509TrustManager(defManagers);

            javax.net.ssl.X509TrustManager merged = new javax.net.ssl.X509TrustManager() {
                @Override
                public X509Certificate[] getAcceptedIssuers() {
                    var ours = ourTm.getAcceptedIssuers();
                    var defs = defTm.getAcceptedIssuers();
                    var all  = new X509Certificate[ours.length + defs.length];
                    System.arraycopy(ours, 0, all, 0, ours.length);
                    System.arraycopy(defs, 0, all, ours.length, defs.length);
                    return all;
                }
                @Override
                public void checkClientTrusted(X509Certificate[] chain, String authType)
                        throws java.security.cert.CertificateException {
                    try { ourTm.checkClientTrusted(chain, authType); }
                    catch (java.security.cert.CertificateException e) {
                        defTm.checkClientTrusted(chain, authType);
                    }
                }
                @Override
                public void checkServerTrusted(X509Certificate[] chain, String authType)
                        throws java.security.cert.CertificateException {
                    try { ourTm.checkServerTrusted(chain, authType); }
                    catch (java.security.cert.CertificateException e) {
                        defTm.checkServerTrusted(chain, authType);
                    }
                }
            };

            SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(null, new javax.net.ssl.TrustManager[]{ merged }, null);

            HttpClient httpClient = HttpClient.newBuilder()
                    .sslContext(sslContext)
                    .connectTimeout(Duration.ofSeconds(3))
                    .build();

            JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
            factory.setReadTimeout(Duration.ofSeconds(10));
            return factory;

        } catch (Exception ex) {
            log.error("Failed to build custom SSL context for Nexconn; falling back to JVM defaults. "
                    + "Token endpoint may fail: {}", ex.getMessage(), ex);
            // Fall back: JDK HttpClient with default SSL
            HttpClient httpClient = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(3))
                    .build();
            JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
            factory.setReadTimeout(Duration.ofSeconds(10));
            return factory;
        }
    }

    private static javax.net.ssl.X509TrustManager findX509TrustManager(
            javax.net.ssl.TrustManager[] managers) {
        for (javax.net.ssl.TrustManager tm : managers) {
            if (tm instanceof javax.net.ssl.X509TrustManager x509) return x509;
        }
        throw new IllegalStateException("No X509TrustManager found");
    }

    public record ApiResult<T>(int code, T result, String message) {}
    public record TokenResult(String userId, String accessToken) {}

    public boolean enabled() { return props.configured(); }

    public String appKey() { return props.appKey(); }

    /** Nexconn user ids are letters/digits only (max 64): a UUID without hyphens fits. */
    public static String toNexconnUserId(UUID id) { return id.toString().replace("-", ""); }

    public TokenResult issueToken(String userId, String name, String avatarUrl) {
        Map<String, Object> body = avatarUrl == null
            ? Map.of("userId", userId, "name", name)
            : Map.of("userId", userId, "name", name, "avatarUrl", avatarUrl);
        ApiResult<TokenResult> r = post("/v4/auth/access-token/issue", body,
            new org.springframework.core.ParameterizedTypeReference<>() {});
        if (r.code() != 0 || r.result() == null) {
            log.warn("Nexconn token issue failed: code={} message={}", r.code(), r.message());
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Chat service rejected the request");
        }
        return r.result();
    }

    /**
     * Best-effort sync of a community restricted term to Nexconn's content-safety profanity filter.
     * Returns true if Nexconn accepted the word; false if unconfigured or unreachable (e.g. behind hospital firewall).
     */
    public boolean addProfanityWord(String word) {
        if (!props.configured() || word == null || word.isBlank()) return false;
        try {
            ApiResult<Object> r = post("/v4/profanity-word/add",
                Map.of("word", word.trim(), "replaceWord", "[REDACTED]"),
                new org.springframework.core.ParameterizedTypeReference<>() {});
            return r.code() == 0;
        } catch (ApiException ex) {
            log.debug("Nexconn profanity-word/add skipped for term: {}", ex.getMessage());
            return false;
        }
    }

    /** Best-effort removal of a restricted term from Nexconn's content-safety filter. */
    public boolean removeProfanityWord(String word) {
        if (!props.configured() || word == null || word.isBlank()) return false;
        try {
            ApiResult<Object> r = post("/v4/profanity-word/delete",
                Map.of("words", java.util.List.of(word.trim())),
                new org.springframework.core.ParameterizedTypeReference<>() {});
            return r.code() == 0;
        } catch (ApiException ex) {
            log.debug("Nexconn profanity-word/delete skipped: {}", ex.getMessage());
            return false;
        }
    }

    /**
     * Best-effort mirror of an AI Co-Pilot streaming message (RC:StreamMsg) through Nexconn Server API
     * so native @nexconn/chat SDK listeners also receive StreamMessage updates alongside MedCord SSE.
     */
    public boolean mirrorStreamMessage(boolean directChannel, String targetId, String senderId,
                                       String streamId, String content, boolean completed) {
        if (!props.configured()) return false;
        String path = directChannel ? "/v4/direct-channel/message/send" : "/v4/group-channel/message/send";
        try {
            Map<String, Object> body = Map.of(
                "senderId", senderId,
                "targetId", targetId,
                "objectName", "RC:StreamMsg",
                "content", Map.of(
                    "type", "markdown",
                    "content", content,
                    "complete", completed,
                    "streamId", streamId
                )
            );
            ApiResult<Object> r = post(path, body, new org.springframework.core.ParameterizedTypeReference<>() {});
            return r.code() == 0;
        } catch (ApiException ex) {
            log.debug("Nexconn StreamMessage mirror skipped: {}", ex.getMessage());
            return false;
        }
    }

    private <T> ApiResult<T> post(String path, Object body, org.springframework.core.ParameterizedTypeReference<ApiResult<T>> type) {
        if (!props.configured()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Chat service is not configured");
        NexconnSigner.Signed s = NexconnSigner.next(props.appSecret());
        try {
            ApiResult<T> out = http.post().uri(trimSlash(props.apiBaseUrl()) + path)
                .contentType(MediaType.APPLICATION_JSON)
                .header("App-Key", props.appKey()).header("Nonce", s.nonce())
                .header("Timestamp", s.timestamp()).header("Signature", s.signature())
                .header("X-Request-ID", UUID.randomUUID().toString())
                .body(body).retrieve().body(type);
            if (out == null) throw new ApiException(HttpStatus.BAD_GATEWAY, "Empty response from chat service");
            return out;
        } catch (RestClientException e) {
            log.warn("Nexconn call {} failed: {}", path, e.getMessage());
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Chat service unavailable");
        }
    }

    private static String trimSlash(String s) { return s.endsWith("/") ? s.substring(0, s.length() - 1) : s; }
}
