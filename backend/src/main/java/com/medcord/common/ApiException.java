package com.medcord.common;

import java.util.Map;
import org.springframework.http.HttpStatus;

/** Business error mapped to an RFC 7807 problem response. */
public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final Map<String, Object> properties;

    public ApiException(HttpStatus status, String message) {
        this(status, message, Map.of());
    }

    public ApiException(HttpStatus status, String message, Map<String, Object> properties) {
        super(message);
        this.status = status;
        this.properties = properties == null ? Map.of() : Map.copyOf(properties);
    }

    public HttpStatus status() {
        return status;
    }

    public Map<String, Object> properties() {
        return properties;
    }
}
