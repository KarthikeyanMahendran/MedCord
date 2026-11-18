package com.medcord.auth;

import com.medcord.auth.AuthDtos.*;
import com.medcord.common.ApiException;
import com.medcord.user.*;
import java.time.Instant;
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

    public AuthService(UserRepository users, ProfessionalProfileRepository profiles,
                       RefreshTokenRepository refreshTokens, PasswordEncoder encoder, TokenService tokens) {
        this.users = users;
        this.profiles = profiles;
        this.refreshTokens = refreshTokens;
        this.encoder = encoder;
        this.tokens = tokens;
        this.dummyHash = encoder.encode("timing-equalizer");
    }

    @Transactional
    public TokenResponse register(RegisterRequest r) {
        String email = r.email().trim().toLowerCase();
        if (users.findByEmailIgnoreCase(email).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "Email already registered");
        }
        User u = new User();
        u.setEmail(email);
        u.setPasswordHash(encoder.encode(r.password()));
        u.setDisplayName(r.displayName().trim());
        u = users.saveAndFlush(u);

        ProfessionalProfile p = new ProfessionalProfile();
        p.setUserId(u.getId());
        p.setSpecialty(r.specialty().trim());
        p.setLicenseNumber(r.licenseNumber().trim());
        p.setLicenseCountry(r.licenseCountry().toUpperCase());
        if (profiles.existsByLicenseCountryAndLicenseNumber(p.getLicenseCountry(), p.getLicenseNumber())) {
            throw new ApiException(HttpStatus.CONFLICT, "License already registered");
        }
        profiles.save(p);
        return issue(u);
    }

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
        return issue(u);
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
