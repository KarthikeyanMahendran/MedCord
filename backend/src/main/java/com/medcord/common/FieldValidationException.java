package com.medcord.common;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;

/** Validation that depends on other fields. Rendered exactly like a bean-validation failure (an "errors" map). */
public class FieldValidationException extends ApiException {
    private final Map<String, String> errors;

    public FieldValidationException(Map<String, String> errors) {
        super(HttpStatus.BAD_REQUEST, "Validation failed");
        this.errors = new LinkedHashMap<>(errors);
    }

    public Map<String, String> errors() { return errors; }
}
