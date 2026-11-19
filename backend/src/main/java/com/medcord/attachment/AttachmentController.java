package com.medcord.attachment;

import com.medcord.attachment.AttachmentService.AttachmentDto;
import com.medcord.attachment.AttachmentService.Download;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1")
public class AttachmentController {
    private final AttachmentService service;

    public AttachmentController(AttachmentService service) {
        this.service = service;
    }

    private static UUID me(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    public record TranscribeRequest(String transcript) {}

    @PostMapping(value = "/channels/{channelId}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    AttachmentDto upload(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID channelId,
                         @RequestParam("file") MultipartFile file,
                         @RequestParam(required = false) Integer durationSeconds,
                         @RequestParam(required = false) String transcript,
                         @RequestParam(required = false) String nexconnMessageId) {
        return service.upload(channelId, me(jwt), file, durationSeconds, transcript, nexconnMessageId);
    }

    @PostMapping("/attachments/{id}/transcribe")
    AttachmentDto transcribe(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                             @RequestBody(required = false) TranscribeRequest r) {
        return service.transcribe(id, me(jwt), r == null ? null : r.transcript());
    }

    @GetMapping("/attachments/{id}")
    ResponseEntity<byte[]> download(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                    @RequestParam(defaultValue = "false") boolean download) {
        Download d = service.download(id, me(jwt));
        ContentDisposition disp = (download ? ContentDisposition.attachment() : ContentDisposition.inline())
            .filename(d.meta().getOriginalFilename())
            .build();
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(d.meta().getContentType()))
            .header(HttpHeaders.CONTENT_DISPOSITION, disp.toString())
            .header("X-Content-Type-Options", "nosniff")
            .header(HttpHeaders.CACHE_CONTROL, "private, max-age=3600")
            .body(d.bytes());
    }
}
