package com.medcord.attachment;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/** Pluggable object storage for attachments with Supabase Cloud Bucket integration. */
public interface AttachmentStorage {
    void put(String key, byte[] data) throws IOException;
    byte[] get(String key) throws IOException;
    void delete(String key) throws IOException;

    @Component
    @Primary
    class SupabaseAttachmentStorage implements AttachmentStorage {
        private static final Logger log = LoggerFactory.getLogger(SupabaseAttachmentStorage.class);
        private final String supabaseUrl;
        private final String apiKey;
        private final String bucket;
        private final LocalAttachmentStorage localFallback;
        private final HttpClient http;

        public SupabaseAttachmentStorage(
                @Value("${medcord.supabase.url:}") String supabaseUrl,
                @Value("${medcord.supabase.key:}") String apiKey,
                @Value("${medcord.supabase.bucket:medcord}") String bucket,
                LocalAttachmentStorage localFallback) {
            this.supabaseUrl = (supabaseUrl != null && !supabaseUrl.isBlank()) ? supabaseUrl.replaceAll("/+$", "") : null;
            this.apiKey = (apiKey != null && !apiKey.isBlank()) ? apiKey : null;
            this.bucket = (bucket != null && !bucket.isBlank()) ? bucket : "medcord";
            this.localFallback = localFallback;
            this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(6)).build();
        }

        private boolean isConfigured() {
            return supabaseUrl != null && !supabaseUrl.isBlank() && apiKey != null && !apiKey.isBlank();
        }

        @Override
        public void put(String key, byte[] data) throws IOException {
            try { localFallback.put(key, data); } catch (Exception ignored) {}

            if (!isConfigured()) return;
            try {
                String cleanKey = key.replaceFirst("^/+", "");
                String url = supabaseUrl + "/storage/v1/object/" + bucket + "/" + cleanKey;
                HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("apikey", apiKey)
                    .header("x-upsert", "true")
                    .header("Content-Type", "application/octet-stream")
                    .timeout(Duration.ofSeconds(15))
                    .POST(HttpRequest.BodyPublishers.ofByteArray(data))
                    .build();
                HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
                if (res.statusCode() >= 200 && res.statusCode() < 300) {
                    log.info("Uploaded attachment to Supabase bucket '{}': key={}", bucket, cleanKey);
                } else {
                    log.warn("Supabase storage upload returned status {}: {}", res.statusCode(), res.body());
                }
            } catch (Exception ex) {
                log.warn("Error uploading to Supabase storage: {}", ex.getMessage());
            }
        }

        @Override
        public byte[] get(String key) throws IOException {
            try {
                return localFallback.get(key);
            } catch (Exception localErr) {
                if (!isConfigured()) throw localErr;
                try {
                    String cleanKey = key.replaceFirst("^/+", "");
                    String url = supabaseUrl + "/storage/v1/object/" + bucket + "/" + cleanKey;
                    HttpRequest req = HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .header("Authorization", "Bearer " + apiKey)
                        .header("apikey", apiKey)
                        .timeout(Duration.ofSeconds(15))
                        .GET()
                        .build();
                    HttpResponse<byte[]> res = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
                    if (res.statusCode() >= 200 && res.statusCode() < 300) {
                        return res.body();
                    }
                } catch (Exception ex) {
                    log.warn("Error downloading from Supabase storage: {}", ex.getMessage());
                }
                throw localErr;
            }
        }

        @Override
        public void delete(String key) throws IOException {
            try { localFallback.delete(key); } catch (Exception ignored) {}
            if (!isConfigured()) return;
            try {
                String cleanKey = key.replaceFirst("^/+", "");
                String url = supabaseUrl + "/storage/v1/object/" + bucket + "/" + cleanKey;
                HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("apikey", apiKey)
                    .DELETE()
                    .build();
                http.send(req, HttpResponse.BodyHandlers.discarding());
            } catch (Exception ignored) {}
        }
    }

    @Component
    class LocalAttachmentStorage implements AttachmentStorage {
        private final Path root;

        public LocalAttachmentStorage(@Value("${medcord.attachments.dir:./data/uploads}") String dir) throws IOException {
            this.root = Path.of(dir).toAbsolutePath().normalize();
            Files.createDirectories(this.root);
        }

        private Path resolve(String key) {
            Path p = root.resolve(key).normalize();
            if (!p.startsWith(root)) throw new IllegalArgumentException("Invalid storage key");
            return p;
        }

        @Override
        public void put(String key, byte[] data) throws IOException {
            Path p = resolve(key);
            Files.createDirectories(p.getParent());
            Files.write(p, data);
        }

        @Override
        public byte[] get(String key) throws IOException {
            return Files.readAllBytes(resolve(key));
        }

        @Override
        public void delete(String key) throws IOException {
            Files.deleteIfExists(resolve(key));
        }
    }
}
