package com.medcord.cases;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class CaseDtos {
    private CaseDtos() {}

    public record SubmitCaseRequest(
        @NotBlank @Size(max = 2000) String chiefComplaint,
        @Min(0) @Max(130) Integer patientAge,
        @Size(max = 10) String patientSex,
        @Size(max = 120) String village,
        UUID regionId,
        @Size(max = 10) String language,
        Map<String, Object> vitals) {}

    public record AnswerRequest(@NotBlank @Size(max = 4000) String answer) {}
    public record FollowupRequest(@NotBlank String outcome, @Size(max = 1000) String note) {}
    public record AvailabilityRequest(boolean onDuty, List<String> languages) {}

    public record RedFlag(String code, String label, String advice) {}

    public record CaseDto(UUID id, UUID channelId, UUID reporterId, String reporterName, UUID assignedDoctorId,
                          String assignedDoctorName, String village, Integer patientAge, String patientSex,
                          String chiefComplaint, Map<String, Object> vitals, Map<String, Object> sbar,
                          String urgency, List<RedFlag> redFlags, String specialtyNeeded, String status,
                          int escalationLevel, Instant createdAt, Instant acceptedAt, Instant resolvedAt) {}

    public record SubmitResult(CaseDto caseRoom, List<LibraryHit> similarAnswers) {}

    public record LibraryHit(UUID id, String specialty, String questionSummary, String answer,
                             int helpfulCount, Instant verifiedAt) {}

    public record NotificationDto(UUID id, String kind, UUID caseId, String title, String body,
                                  boolean read, Instant createdAt) {}

    public record ImpactDto(long totalCases, long resolved, long redCases, long open,
                            Double avgMinutesToAccept, List<Map<String, Object>> byRegion,
                            List<Map<String, Object>> daily) {}
}
