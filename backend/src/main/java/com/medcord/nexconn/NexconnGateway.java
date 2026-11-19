package com.medcord.nexconn;

import com.medcord.common.ApiException;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Single entry point for Nexconn Server API calls (signing, errors, timeouts).
 * Domain code must not call Nexconn any other way (see CLAUDE.md).
 */
@Component
public class NexconnGateway {
    private static final Logger log = LoggerFactory.getLogger(NexconnGateway.class);

    private final NexconnProperties props;
    private final RestClient http;

    @Autowired
    public NexconnGateway(NexconnProperties props) {
        this(props, RestClient.builder().requestFactory(timeouts()));
    }

    NexconnGateway(NexconnProperties props, RestClient.Builder builder) {
        this.props = props;
        this.http = builder.build();
    }

    private static ClientHttpRequestFactory timeouts() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(Duration.ofSeconds(3));
        f.setReadTimeout(Duration.ofSeconds(10));
        return f;
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
