package com.medcord.attachment;

import com.medcord.common.ApiException;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;
import javax.imageio.ImageIO;
import org.springframework.http.HttpStatus;

/**
 * Validates allowed attachment types via magic bytes, blocks DICOM/PHI imaging files,
 * and re-encodes raster images into fresh pixel buffers so all EXIF/GPS/IPTC/XMP metadata is stripped.
 */
public final class AttachmentSanitizer {
    public static final long MAX_BYTES = 10L * 1024 * 1024; // 10 MB
    private static final Set<String> ALLOWED_TYPES = Set.of(
        "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf",
        "audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp4"
    );

    private AttachmentSanitizer() {}

    public record SanitizedFile(byte[] bytes, String contentType, Integer width, Integer height, boolean exifStripped, String sha256) {}

    public static SanitizedFile sanitize(String filename, String declaredContentType, byte[] raw) {
        if (raw == null || raw.length == 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "File is empty");
        }
        if (raw.length > MAX_BYTES) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "File exceeds the 10 MB limit");
        }
        String lowerName = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        String lowerType = declaredContentType == null ? "" : declaredContentType.toLowerCase(Locale.ROOT);

        // Explicitly reject DICOM medical imaging files (commonly carry embedded patient PHI)
        if (lowerName.endsWith(".dcm") || lowerName.endsWith(".dicom") || lowerType.contains("dicom") || isDicomMagic(raw)) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                "DICOM files are blocked to prevent patient data (PHI) exposure. Upload de-identified PNG, JPEG, or PDF files only.");
        }

        String detected = detectMagic(raw, lowerType);
        if (detected == null || !ALLOWED_TYPES.contains(detected)) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                "Unsupported file type. Allowed: JPEG, PNG, GIF, WebP images, PDF documents, and voice notes (WebM/OGG/WAV/MP3/M4A).");
        }

        if ("application/pdf".equals(detected) || detected.startsWith("audio/")) {
            return new SanitizedFile(raw, detected, null, null, false, sha256(raw));
        }

        // Raster image: decode and re-encode pixels into a clean BufferedImage to strip all EXIF/IPTC/XMP/GPS tags.
        try {
            BufferedImage src = ImageIO.read(new ByteArrayInputStream(raw));
            if (src == null) {
                if ("image/webp".equals(detected)) {
                    // Standard JDK ImageIO lacks a WebP writer; reject unverifiable metadata rather than passing raw EXIF through
                    throw new ApiException(HttpStatus.BAD_REQUEST,
                        "WebP decoding is unavailable on this server; please upload PNG or JPEG so EXIF metadata can be stripped.");
                }
                throw new ApiException(HttpStatus.BAD_REQUEST, "Corrupt or unreadable image file");
            }
            boolean isJpeg = "image/jpeg".equals(detected);
            String outFormat = isJpeg ? "jpg" : "png";
            String outContentType = isJpeg ? "image/jpeg" : "image/png";
            int imgType = isJpeg ? BufferedImage.TYPE_INT_RGB : BufferedImage.TYPE_INT_ARGB;

            BufferedImage clean = new BufferedImage(src.getWidth(), src.getHeight(), imgType);
            Graphics2D g = clean.createGraphics();
            try {
                if (isJpeg) {
                    g.setColor(java.awt.Color.WHITE);
                    g.fillRect(0, 0, src.getWidth(), src.getHeight());
                }
                g.drawImage(src, 0, 0, null);
            } finally {
                g.dispose();
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            if (!ImageIO.write(clean, outFormat, baos)) {
                throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not sanitize image");
            }
            byte[] stripped = baos.toByteArray();
            return new SanitizedFile(stripped, outContentType, src.getWidth(), src.getHeight(), true, sha256(stripped));
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Could not process image file");
        }
    }

    private static boolean isDicomMagic(byte[] b) {
        return b.length >= 132 && b[128] == 'D' && b[129] == 'I' && b[130] == 'C' && b[131] == 'M';
    }

    private static String detectMagic(byte[] b, String declaredLowerType) {
        if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if (b.length >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G'
            && b[4] == 0x0D && b[5] == 0x0A && b[6] == 0x1A && b[7] == 0x0A) {
            return "image/png";
        }
        if (b.length >= 6) {
            String head6 = new String(b, 0, 6, StandardCharsets.US_ASCII);
            if ("GIF87a".equals(head6) || "GIF89a".equals(head6)) return "image/gif";
        }
        if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
            && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') {
            return "image/webp";
        }
        if (b.length >= 5 && b[0] == '%' && b[1] == 'P' && b[2] == 'D' && b[3] == 'F' && b[4] == '-') {
            return "application/pdf";
        }
        // Voice notes: WebM/Matroska (EBML header 1A 45 DF A3)
        if (b.length >= 4 && (b[0] & 0xFF) == 0x1A && (b[1] & 0xFF) == 0x45
            && (b[2] & 0xFF) == 0xDF && (b[3] & 0xFF) == 0xA3) {
            return "audio/webm";
        }
        // OGG Opus/Vorbis (OggS)
        if (b.length >= 4 && b[0] == 'O' && b[1] == 'g' && b[2] == 'g' && b[3] == 'S') {
            return "audio/ogg";
        }
        // WAV (RIFF....WAVE)
        if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
            && b[8] == 'W' && b[9] == 'A' && b[10] == 'V' && b[11] == 'E') {
            return "audio/wav";
        }
        // MP3 (ID3 tag or MPEG frame sync)
        if (b.length >= 3 && ((b[0] == 'I' && b[1] == 'D' && b[2] == '3')
            || ((b[0] & 0xFF) == 0xFF && ((b[1] & 0xE0) == 0xE0)))) {
            return "audio/mpeg";
        }
        // MP4 / M4A voice notes (ISO BMFF ftyp box)
        if (b.length >= 8 && b[4] == 'f' && b[5] == 't' && b[6] == 'y' && b[7] == 'p'
            && (declaredLowerType.startsWith("audio/") || declaredLowerType.contains("mp4") || declaredLowerType.isEmpty())) {
            return "audio/mp4";
        }
        return null;
    }

    public static String sha256(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
