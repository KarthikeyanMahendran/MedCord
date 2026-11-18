package com.medcord.common;

import org.springframework.http.HttpStatus;

/** Business error mapped to an RFC 7807 problem response. */
public class ApiException extends RuntimeException {
    private final HttpStatus status;

    public ApiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }
}
