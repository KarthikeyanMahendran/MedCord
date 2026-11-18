package com.medcord.auth;

import com.medcord.user.User;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;

@Service
public class TokenService {
    private static final SecureRandom RNG = new SecureRandom();
    private final JwtEncoder encoder;
    private final AuthProperties props;

    public TokenService(JwtEncoder encoder, AuthProperties props) {
        this.encoder = encoder;
        this.props = props;
    }

    public String accessToken(User u) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
            .issuer("medcord")
            .subject(u.getId().toString())
            .issuedAt(now)
            .expiresAt(now.plus(Duration.ofMinutes(props.accessTtlMinutes())))
            .claim("email", u.getEmail())
            .claim("role", u.getPlatformRole().name())
            .claim("status", u.getStatus().name())
            .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    public long accessTtlSeconds() {
        return props.accessTtlMinutes() * 60;
    }

    public Instant refreshExpiry() {
        return Instant.now().plus(Duration.ofDays(props.refreshTtlDays()));
    }

    /** 256-bit URL-safe opaque token. Only its SHA-256 hash is stored. */
    public String newRefreshTokenValue() {
        byte[] b = new byte[32];
        RNG.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    public static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
