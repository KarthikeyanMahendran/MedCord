package com.medcord.nexconn;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;

/** Nexconn request signature: lowercase hex SHA-1 of AppSecret + Nonce + Timestamp(ms). */
public final class NexconnSigner {
    private static final SecureRandom RNG = new SecureRandom();

    private NexconnSigner() {}

    public record Signed(String nonce, String timestamp, String signature) {}

    public static String sign(String secret, String nonce, String timestamp) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-1").digest((secret + nonce + timestamp).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Nonce is numeric, max 18 chars (docs limit). */
    public static Signed next(String secret) {
        String nonce = Long.toString(100_000_000L + (long) (RNG.nextDouble() * 900_000_000L));
        String ts = Long.toString(System.currentTimeMillis());
        return new Signed(nonce, ts, sign(secret, nonce, ts));
    }
}
