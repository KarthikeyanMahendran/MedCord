package com.medcord.attachment;

import com.medcord.common.ApiException;
import com.medcord.community.Channel;
import com.medcord.community.ChannelRepository;
import com.medcord.community.Permission;
import com.medcord.message.ChannelAccess;
import com.medcord.nexconn.ChannelTransport;
import com.medcord.safety.PhiDetector;
import java.io.IOException;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class AttachmentService {
    public static final int MAX_PER_MESSAGE = 5;

    private final AttachmentRepository attachments;
    private final ChannelRepository channels;
    private final ChannelAccess access;
    private final AttachmentStorage storage;
    private final ChannelTransport transport;

    public AttachmentService(AttachmentRepository attachments, ChannelRepository channels, ChannelAccess access,
                             AttachmentStorage storage, ChannelTransport transport) {
        this.attachments = attachments;
        this.channels = channels;
        this.access = access;
        this.storage = storage;
        this.transport = transport;
    }

    public record AttachmentDto(UUID id, String filename, String contentType, long sizeBytes,
                                Integer width, Integer height, boolean exifStripped, String url,
                                Integer durationSeconds, String transcript, String transcriptStatus,
                                String nexconnMessageId) {}

    public record Download(MessageAttachment meta, byte[] bytes) {}

    @Transactional
    public AttachmentDto upload(UUID channelId, UUID uploaderId, MultipartFile file) {
        return upload(channelId, uploaderId, file, null, null, null);
    }

    @Transactional
    public AttachmentDto upload(UUID channelId, UUID uploaderId, MultipartFile file,
                                Integer durationSeconds, String transcript, String nexconnMessageId) {
        Channel ch = channels.findById(channelId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Channel not found"));
        Set<Permission> held = access.permissions(ch, uploaderId);
        if (ch.isArchived()) throw new ApiException(HttpStatus.CONFLICT, "This channel is archived and read-only");
        access.assertCanPost(ch, uploaderId);
        if (!held.contains(Permission.SEND_MESSAGES)) throw new ApiException(HttpStatus.FORBIDDEN, "Missing permission: SEND_MESSAGES");
        if (file == null || file.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "No file provided");

        String originalName = safeFilename(file.getOriginalFilename());
        byte[] raw;
        try {
            raw = file.getBytes();
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Could not read uploaded file");
        }

        AttachmentSanitizer.SanitizedFile clean = AttachmentSanitizer.sanitize(originalName, file.getContentType(), raw);
        String ext = switch (clean.contentType()) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "application/pdf" -> ".pdf";
            case "audio/webm" -> ".webm";
            case "audio/ogg" -> ".ogg";
            case "audio/wav" -> ".wav";
            case "audio/mpeg" -> ".mp3";
            case "audio/mp4" -> ".m4a";
            default -> ".bin";
        };
        String storageKey = channelId + "/" + UUID.randomUUID() + ext;
        try {
            storage.put(storageKey, clean.bytes());
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not store attachment");
        }

        MessageAttachment entity = new MessageAttachment();
        entity.setChannelId(channelId);
        entity.setUploaderId(uploaderId);
        entity.setOriginalFilename(originalName);
        entity.setContentType(clean.contentType());
        entity.setSizeBytes(clean.bytes().length);
        entity.setStorageKey(storageKey);
        entity.setSha256(clean.sha256());
        entity.setWidth(clean.width());
        entity.setHeight(clean.height());
        entity.setExifStripped(clean.exifStripped());
        if (clean.contentType().startsWith("audio/")) {
            if (durationSeconds != null && durationSeconds >= 0 && durationSeconds <= 3600) {
                entity.setDurationSeconds(durationSeconds);
            }
            if (nexconnMessageId != null && !nexconnMessageId.isBlank()) {
                entity.setNexconnMessageId(nexconnMessageId.trim().length() > 128
                    ? nexconnMessageId.trim().substring(0, 128) : nexconnMessageId.trim());
            }
            if (transcript != null && !transcript.isBlank()) {
                String sanitized = PhiDetector.redact(transcript.trim());
                entity.setTranscript(sanitized.length() > 4000 ? sanitized.substring(0, 4000) : sanitized);
                entity.setTranscriptStatus("COMPLETED");
            }
        }
        entity = attachments.saveAndFlush(entity);
        return toDto(entity);
    }

    @Transactional
    public AttachmentDto transcribe(UUID attachmentId, UUID actorId, String suppliedTranscript) {
        MessageAttachment a = attachments.findById(attachmentId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attachment not found"));
        Channel ch = channels.findById(a.getChannelId())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Channel not found"));
        access.permissions(ch, actorId);
        if (!a.getContentType().startsWith("audio/")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Speech-to-text is only available for voice note attachments");
        }
        String text = suppliedTranscript == null ? "" : suppliedTranscript.trim();
        if (!text.isEmpty()) {
            String sanitized = PhiDetector.redact(text);
            a.setTranscript(sanitized.length() > 4000 ? sanitized.substring(0, 4000) : sanitized);
            a.setTranscriptStatus("COMPLETED");
        } else if (a.getTranscript() == null || a.getTranscript().isBlank()) {
            // If no STT transcript was pushed from Nexconn / browser SpeechRecognition, mark clearly
            String dur = a.getDurationSeconds() != null ? a.getDurationSeconds() + "s" : "short";
            a.setTranscript("Voice note (" + dur + ") — automatic speech-to-text requires Nexconn STT or a browser supporting live transcription.");
            a.setTranscriptStatus("COMPLETED");
        }
        a = attachments.saveAndFlush(a);
        if (a.getMessageId() != null) {
            transport.onMessageEdited(ch.getCommunityId(), ch.getId(), a.getMessageId());
        }
        return toDto(a);
    }

    @Transactional(readOnly = true)
    public boolean areAllAudio(List<UUID> attachmentIds) {
        if (attachmentIds == null || attachmentIds.isEmpty()) return false;
        List<MessageAttachment> found = attachments.findAllById(attachmentIds);
        return !found.isEmpty() && found.stream().allMatch(a -> a.getContentType().startsWith("audio/"));
    }

    @Transactional
    public void linkToMessage(List<UUID> attachmentIds, UUID channelId, UUID uploaderId, UUID messageId) {
        if (attachmentIds == null || attachmentIds.isEmpty()) return;
        List<UUID> unique = attachmentIds.stream().distinct().toList();
        if (unique.size() > MAX_PER_MESSAGE) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "At most " + MAX_PER_MESSAGE + " attachments per message");
        }
        List<MessageAttachment> found = attachments.findAllById(unique);
        if (found.size() != unique.size()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "One or more attachments were not found");
        }
        for (MessageAttachment a : found) {
            if (!a.getChannelId().equals(channelId) || !a.getUploaderId().equals(uploaderId)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Attachment does not belong to this channel or user");
            }
            if (a.getMessageId() != null) {
                throw new ApiException(HttpStatus.CONFLICT, "Attachment is already linked to a message");
            }
            a.setMessageId(messageId);
        }
        attachments.saveAllAndFlush(found);
    }

    @Transactional(readOnly = true)
    public Download download(UUID attachmentId, UUID viewerId) {
        MessageAttachment a = attachments.findById(attachmentId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Attachment not found"));
        Channel ch = channels.findById(a.getChannelId())
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Channel not found"));
        access.permissions(ch, viewerId);
        try {
            return new Download(a, storage.get(a.getStorageKey()));
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Attachment file missing");
        }
    }

    @Transactional(readOnly = true)
    public Map<UUID, List<AttachmentDto>> forMessages(Collection<UUID> messageIds) {
        if (messageIds == null || messageIds.isEmpty()) return Map.of();
        return attachments.findByMessageIdInOrderByCreatedAtAsc(messageIds).stream()
            .collect(Collectors.groupingBy(MessageAttachment::getMessageId,
                Collectors.mapping(AttachmentService::toDto, Collectors.toList())));
    }

    public static AttachmentDto toDto(MessageAttachment a) {
        return new AttachmentDto(a.getId(), a.getOriginalFilename(), a.getContentType(), a.getSizeBytes(),
            a.getWidth(), a.getHeight(), a.isExifStripped(), "/api/v1/attachments/" + a.getId(),
            a.getDurationSeconds(), a.getTranscript(), a.getTranscriptStatus(), a.getNexconnMessageId());
    }

    private static String safeFilename(String raw) {
        if (raw == null || raw.isBlank()) return "attachment";
        String base = raw.replace('\\', '/');
        int slash = base.lastIndexOf('/');
        if (slash >= 0) base = base.substring(slash + 1);
        base = base.replaceAll("[\\p{Cntrl}\"]", "_").trim();
        if (base.isEmpty()) return "attachment";
        return base.length() > 200 ? base.substring(0, 200) : base;
    }
}
