package com.medcord.attachment;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "message_attachments")
@Getter
@Setter
public class MessageAttachment {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "message_id") private UUID messageId;
    @Column(name = "channel_id", nullable = false) private UUID channelId;
    @Column(name = "uploader_id", nullable = false) private UUID uploaderId;
    @Column(name = "original_filename", nullable = false) private String originalFilename;
    @Column(name = "content_type", nullable = false) private String contentType;
    @Column(name = "size_bytes", nullable = false) private long sizeBytes;
    @Column(name = "storage_key", nullable = false, unique = true) private String storageKey;
    @Column(nullable = false) private String sha256;
    private Integer width;
    private Integer height;
    @Column(name = "exif_stripped", nullable = false) private boolean exifStripped;
    @Column(name = "duration_seconds") private Integer durationSeconds;
    @Column(name = "transcript") private String transcript;
    @Column(name = "transcript_status", nullable = false) private String transcriptStatus = "NONE";
    @Column(name = "nexconn_message_id") private String nexconnMessageId;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
}
