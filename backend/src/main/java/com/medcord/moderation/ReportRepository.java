package com.medcord.moderation;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ReportRepository extends JpaRepository<MessageReport, UUID> {
    boolean existsByMessageIdAndReporterId(UUID messageId, UUID reporterId);

    @Query("select r from MessageReport r where r.communityId = ?1 and r.status = ?2 order by r.createdAt asc")
    List<MessageReport> queue(UUID communityId, MessageReport.Status status);

    @Query("select r from MessageReport r where r.communityId = ?1 order by r.createdAt desc")
    List<MessageReport> all(UUID communityId);
}
