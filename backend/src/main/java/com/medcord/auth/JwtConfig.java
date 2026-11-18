package com.medcord.auth;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

@Configuration
@EnableConfigurationProperties(AuthProperties.class)
public class JwtConfig {

    private SecretKey key(AuthProperties p) {
        return new SecretKeySpec(p.jwtSecret().getBytes(), "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(AuthProperties p) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(key(p)));
    }

    @Bean
    JwtDecoder jwtDecoder(AuthProperties p) {
        return NimbusJwtDecoder.withSecretKey(key(p)).macAlgorithm(MacAlgorithm.HS256).build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10);
    }
}
