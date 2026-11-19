package com.medcord.auth;

import com.medcord.auth.AuthDtos.*;
import com.medcord.common.ApiException;
import com.medcord.common.FieldValidationException;
import com.medcord.user.*;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final String dummyHash;
    private final UserRepository users;
    private final ProfessionalProfileRepository profiles;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder encoder;
    private final TokenService tokens;
    private final JdbcClient jdbc;

    public AuthService(UserRepository users, ProfessionalProfileRepository profiles,
                       RefreshTokenRepository refreshTokens, PasswordEncoder encoder, TokenService tokens, JdbcClient jdbc) {
        this.jdbc = jdbc;
        this.users = users;
        this.profiles = profiles;
        this.refreshTokens = refreshTokens;
        this.encoder = encoder;
        this.tokens = tokens;
        this.dummyHash = encoder.encode("timing-equalizer");
    }

    @Transactional
    public TokenResponse register(RegisterRequest r) {
        boolean worker = "HEALTH_WORKER".equals(r.accountType());
        Map<String, String> errors = new LinkedHashMap<>();
        boolean asha = worker && "ASHA".equals(r.workerType());
        if (worker) {
            if (r.regionId() == null) errors.put("regionId", "Choose your area");
            if (asha && blank(r.licenseNumber())) errors.put("licenseNumber", "Enter your ASHA / NHM ID");
        } else {
            if (blank(r.specialty())) errors.put("specialty", "Enter your specialty");
            if (blank(r.licenseNumber())) errors.put("licenseNumber", "Enter your licence number");
            if (blank(r.licenseCountry())) errors.put("licenseCountry", "Enter a 2-letter country code");
        }
        if (worker && r.regionId() != null
            && !jdbc.sql("SELECT EXISTS (SELECT 1 FROM regions WHERE id = :id)").param("id", r.regionId()).query(Boolean.class).single()) {
            errors.put("regionId", "Choose an area from the list");
        }
        if (!errors.isEmpty()) throw new FieldValidationException(errors);

        String email = r.email().trim().toLowerCase();
        if (users.findByEmailIgnoreCase(email).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "Email already registered");
        }
        String language = blank(r.preferredLanguage()) ? "en" : r.preferredLanguage();
        User u = new User();
        u.setEmail(email);
        u.setPasswordHash(encoder.encode(r.password()));
        u.setDisplayName(r.displayName().trim());
        u.setAccountType(worker ? "HEALTH_WORKER" : "DOCTOR");
        u.setPreferredLanguage(language);
        // Health workers can send cases at once. Doctors wait for an admin to check their licence.
        u.setStatus(worker ? User.Status.ACTIVE : User.Status.PENDING);
        u = users.saveAndFlush(u);

        // Every account keeps a profile row. A health worker's is a placeholder and is never "approved",
        // so it can not be mistaken for a verified doctor.
        ProfessionalProfile p = new ProfessionalProfile();
        p.setUserId(u.getId());
        if (worker) {
            p.setSpecialty(asha ? "Community Health (ASHA)" : "Community Health");
            p.setLicenseNumber(asha ? r.licenseNumber().trim() : "HW-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
            p.setLicenseCountry("IN");
            if (asha && profiles.existsByLicenseCountryAndLicenseNumber("IN", p.getLicenseNumber())) {
                throw new ApiException(HttpStatus.CONFLICT, "This ASHA / NHM ID is already registered");
            }
        } else {
            p.setSpecialty(r.specialty().trim());
            p.setLicenseNumber(r.licenseNumber().trim());
            p.setLicenseCountry(r.licenseCountry().toUpperCase());
            if (profiles.existsByLicenseCountryAndLicenseNumber(p.getLicenseCountry(), p.getLicenseNumber())) {
                throw new ApiException(HttpStatus.CONFLICT, "License already registered");
            }
        }
        profiles.save(p);
        if (worker) {
            jdbc.sql("""
                INSERT INTO health_worker_profiles (user_id, region_id, organisation, training_level, languages)
                VALUES (:u, :r, :o, :t, CAST(string_to_array(:langs, ',') AS varchar[]))
                """)
                .param("t", "ASHA".equals(r.workerType()) ? "ASHA" : "CHW").param("u", u.getId()).param("r", r.regionId())
                .param("o", blank(r.organisation()) ? null : r.organisation().trim())
                .param("langs", "en".equals(language) ? "en" : language + ",en").update();
        }
        return issue(u);
    }

    private static boolean blank(String s) { return s == null || s.isBlank(); }

    @Transactional
    public TokenResponse login(LoginRequest r) {
        User u = users.findByEmailIgnoreCase(r.email().trim()).orElse(null);
        // Constant-ish time: always run one bcrypt comparison.
        boolean ok = encoder.matches(r.password(), u != null ? u.getPasswordHash() : dummyHash);
        if (u == null || !ok) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password");
        }
        if (u.getStatus() == User.Status.SUSPENDED) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Account suspended");
        }
        checkRole(u, r);
        return issue(u);
    }

    /**
     * The sign-in page asks who you are. We only check after the password is right, so this can not be used to
     * find out which emails exist. A doctor must also give the licence ID on file.
     */
    private void checkRole(User u, LoginRequest r) {
        String want = r.accountType();
        if (blank(want)) return;
        boolean admin = u.getPlatformRole() == User.PlatformRole.ADMIN;
        boolean ok = switch (want) {
            case "ADMIN" -> admin;
            case "HEALTH_WORKER" -> !admin && "HEALTH_WORKER".equals(u.getAccountType()) && workerLoginOk(u, r);
            case "DOCTOR" -> {
                Map<String, String> missing = new LinkedHashMap<>();
                if (blank(r.specialty())) missing.put("specialty", "Enter your speciality");
                if (blank(r.licenseNumber())) missing.put("licenseNumber", "Enter your licence number");
                if (!missing.isEmpty()) throw new FieldValidationException(missing);
                ProfessionalProfile p = profiles.findById(u.getId()).orElse(null);
                yield !admin && "DOCTOR".equals(u.getAccountType()) && p != null
                    && p.getLicenseNumber().trim().equalsIgnoreCase(r.licenseNumber().trim())
                    && p.getSpecialty().trim().equalsIgnoreCase(r.specialty().trim());
            }
            default -> false;
        };
        if (!ok) throw new ApiException(HttpStatus.UNAUTHORIZED, "The role or ID details do not match this account. Check your choice and try again.");
    }

    /** An ASHA worker proves who they are with the ASHA / NHM ID given at sign-up. Other health workers need nothing extra. */
    private boolean workerLoginOk(User u, LoginRequest r) {
        String level = jdbc.sql("SELECT training_level FROM health_worker_profiles WHERE user_id = :u").param("u", u.getId())
            .query(String.class).optional().orElse("CHW");
        boolean accountIsAsha = "ASHA".equals(level);
        if ("ASHA".equals(r.workerType())) {
            if (blank(r.licenseNumber())) throw new FieldValidationException(Map.of("licenseNumber", "Enter your ASHA / NHM ID"));
            ProfessionalProfile p = profiles.findById(u.getId()).orElse(null);
            return accountIsAsha && p != null && p.getLicenseNumber().trim().equalsIgnoreCase(r.licenseNumber().trim());
        }
        return !accountIsAsha;   // an ASHA account must sign in as an ASHA worker, with its ID
    }

    /** Rotation: each refresh token is single-use. Reuse of a revoked token revokes all sessions. */
    // noRollbackFor: the mass-revocation on token reuse must persist even though we throw 401.
    @Transactional(noRollbackFor = ApiException.class)
    public TokenResponse refresh(String refreshToken) {
        RefreshToken t = refreshTokens.findByTokenHash(TokenService.hash(refreshToken))
            .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid refresh token"));
        Instant now = Instant.now();
        if (t.getRevokedAt() != null) {
            refreshTokens.revokeAllForUser(t.getUserId(), now);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Refresh token reuse detected");
        }
        if (t.getExpiresAt().isBefore(now)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Refresh token expired");
        }
        User u = users.findById(t.getUserId()).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid refresh token"));
        if (u.getStatus() == User.Status.SUSPENDED) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Account suspended");
        }
        t.setRevokedAt(now);
        return issue(u);
    }

    @Transactional
    public void logout(String refreshToken) {
        refreshTokens.findByTokenHash(TokenService.hash(refreshToken)).ifPresent(t -> {
            if (t.getRevokedAt() == null) t.setRevokedAt(Instant.now());
        });
    }

    private TokenResponse issue(User u) {
        String refresh = tokens.newRefreshTokenValue();
        RefreshToken rt = new RefreshToken();
        rt.setUserId(u.getId());
        rt.setTokenHash(TokenService.hash(refresh));
        rt.setExpiresAt(tokens.refreshExpiry());
        refreshTokens.save(rt);
        return new TokenResponse(tokens.accessToken(u), refresh, "Bearer", tokens.accessTtlSeconds());
    }
}
