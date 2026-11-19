package com.medcord.outbreak;

import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class OutbreakDtos {
    private OutbreakDtos() {}

    public record AlertDto(UUID id, UUID regionId, String regionName, String district, String state, Double lat, Double lng,
                           String syndrome, String syndromeLabel, String severity, String status, int caseCount, int redCount,
                           int threshold, Instant firstCaseAt, Instant lastCaseAt, boolean demo, Instant acknowledgedAt,
                           String acknowledgedBy, String note, Instant createdAt, Instant resolvedAt) {}

    public record RegionPoint(UUID id, String name, String district, String state, Double lat, Double lng, int cases72h) {}

    public record RadarDto(List<AlertDto> alerts, List<RegionPoint> regions, int windowHours, boolean canManage, boolean isAdmin) {}

    /** One case in a cluster, with no patient identity. */
    public record ClusterCase(String village, Integer age, String sex, String urgency, String summary, Instant createdAt) {}

    public record AlertDetail(AlertDto alert, List<String> guidance, String disclaimer, boolean canSeeCases,
                              List<ClusterCase> cases, List<Integer> timeline, int bucketHours) {}

    public record NoteRequest(@Size(max = 500) String note) {}

    public record DemoResult(int created, int totalDemoCases, String region) {}
}
