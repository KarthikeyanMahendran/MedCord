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
