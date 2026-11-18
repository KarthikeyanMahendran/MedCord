package com.medcord.moderation;

import com.medcord.audit.AuditService;
import com.medcord.common.ApiException;
import com.medcord.community.*;
import com.medcord.message.Message;
import com.medcord.message.MessageRepository;
import com.medcord.message.MessageService;
import com.medcord.moderation.MessageReport.Reason;
import com.medcord.moderation.MessageReport.Status;
import com.medcord.user.User;
import com.medcord.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ModerationService {
    private final MuteRepository mutes;
    private final ReportRepository reports;
    private final MessageRepository messages;
    private final MessageService messageService;
    private final ChannelRepository channels;
    private final MembershipRepository memberships;
    private final PermissionService perms;
    private final UserRepository users;
    private final AuditService audit;

    public ModerationService(MuteRepository mutes, ReportRepository reports, MessageRepository messages, MessageService messageService,
                             ChannelRepository channels, MembershipRepository memberships, PermissionService perms,
                             UserRepository users, AuditService audit) {
        this.mutes = mutes; this.reports = reports; this.messages = messages; this.messageService = messageService;
        this.channels = channels; this.memberships = memberships; this.perms = perms; this.users = users; this.audit = audit;
    }

    public record MuteDto(UUID userId, String displayName, Instant until, String reason) {}
    public record ReportDto(UUID id, Status status, Reason reason, String details, String reporterName, Instant createdAt,
                            UUID messageId, UUID channelId, String channelName, UUID authorId, String authorName, String body,
                            boolean messageDeleted, String handledByName, Instant handledAt) {}

    // ---- mutes ----

    @Transactional
    public MuteDto mute(UUID communityId, UUID actorId, UUID targetId, int minutes, String reason) {
        Membership actor = perms.require(communityId, actorId, Permission.MANAGE_MEMBERS);
        if (actorId.equals(targetId)) throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot mute yourself");
        Membership target = memberships.findByCommunityIdAndUserId(communityId, targetId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Member not found"));
        if (target.topPosition() <= actor.topPosition()) throw new ApiException(HttpStatus.FORBIDDEN, "Cannot mute a member at or above your rank");
        CommunityMute m = mutes.findByCommunityIdAndUserId(communityId, targetId).orElseGet(CommunityMute::new);
        m.setCommunityId(communityId);
        m.setUserId(targetId);
        m.setUntil(Instant.now().plus(Duration.ofMinutes(minutes)));
        m.setReason(reason == null || reason.isBlank() ? null : reason.trim());
        m.setMutedBy(actorId);
        mutes.save(m);
        String name = audit.userName(targetId);
        audit.record(communityId, actorId, "MEMBER_MUTED", "USER", targetId, "Muted " + name + " for " + minutes + " min" + (m.getReason() == null ? "" : ": " + m.getReason()));
        return new MuteDto(targetId, name, m.getUntil(), m.getReason());
    }

    @Transactional
    public void unmute(UUID communityId, UUID actorId, UUID targetId) {
        perms.require(communityId, actorId, Permission.MANAGE_MEMBERS);
        mutes.findByCommunityIdAndUserId(communityId, targetId).ifPresent(m -> {
            mutes.delete(m);
            audit.record(communityId, actorId, "MEMBER_UNMUTED", "USER", targetId, "Unmuted " + audit.userName(targetId));
        });
    }

    @Transactional(readOnly = true)
    public List<MuteDto> activeMutes(UUID communityId, UUID actorId) {
        perms.require(communityId, actorId, Permission.MANAGE_MEMBERS);
        List<CommunityMute> list = mutes.active(communityId, Instant.now());
        Map<UUID, String> names = users.findAllById(list.stream().map(CommunityMute::getUserId).toList()).stream()
            .collect(Collectors.toMap(User::getId, User::getDisplayName));
        return list.stream().map(m -> new MuteDto(m.getUserId(), names.getOrDefault(m.getUserId(), "Unknown"), m.getUntil(), m.getReason())).toList();
    }

    // ---- reports ----

    @Transactional
    public void report(UUID messageId, UUID reporterId, Reason reason, String details) {
        Message m = messages.findById(messageId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Message not found"));
        Channel ch = channels.findById(m.getChannelId()).orElseThrow();
        if (ch.getCommunityId() == null) throw new ApiException(HttpStatus.BAD_REQUEST, "Only community messages can be reported");
        perms.membership(ch.getCommunityId(), reporterId);
        if (m.isDeleted()) throw new ApiException(HttpStatus.CONFLICT, "Message was deleted");
        if (m.getAuthorId().equals(reporterId)) throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot report your own message");
        if (reports.existsByMessageIdAndReporterId(messageId, reporterId)) throw new ApiException(HttpStatus.CONFLICT, "You already reported this message");
        MessageReport r = new MessageReport();
        r.setMessageId(messageId);
        r.setCommunityId(ch.getCommunityId());
        r.setReporterId(reporterId);
        r.setReason(reason);
        r.setDetails(details == null || details.isBlank() ? null : details.trim());
        reports.save(r);
    }

    @Transactional(readOnly = true)
    public List<ReportDto> queue(UUID communityId, UUID actorId, Status status) {
        perms.require(communityId, actorId, Permission.MODERATE_MESSAGES);
        return toDtos(status == null ? reports.all(communityId) : reports.queue(communityId, status));
    }

    /** Resolve or dismiss; optionally remove the reported message in the same step. */
    @Transactional
    public ReportDto resolve(UUID communityId, UUID reportId, UUID actorId, Status status, boolean deleteMessage) {
        perms.require(communityId, actorId, Permission.MODERATE_MESSAGES);
        if (status == Status.OPEN) throw new ApiException(HttpStatus.BAD_REQUEST, "Status must be RESOLVED or DISMISSED");
        MessageReport r = reports.findById(reportId).filter(x -> x.getCommunityId().equals(communityId))
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Report not found"));
        if (r.getStatus() != Status.OPEN) throw new ApiException(HttpStatus.CONFLICT, "Report already handled");
        if (deleteMessage) messageService.delete(r.getMessageId(), actorId);
        r.setStatus(status);
        r.setHandledBy(actorId);
        r.setHandledAt(Instant.now());
        reports.save(r);
        audit.record(communityId, actorId, status == Status.RESOLVED ? "REPORT_RESOLVED" : "REPORT_DISMISSED", "MESSAGE", r.getMessageId(),
            (status == Status.RESOLVED ? "Resolved" : "Dismissed") + " a " + r.getReason() + " report" + (deleteMessage ? " and deleted the message" : ""));
        return toDtos(List.of(r)).get(0);
    }

    private List<ReportDto> toDtos(List<MessageReport> list) {
        Map<UUID, Message> msgs = messages.findAllById(list.stream().map(MessageReport::getMessageId).collect(Collectors.toSet())).stream()
            .collect(Collectors.toMap(Message::getId, m -> m));
        Set<UUID> userIds = new HashSet<>();
        list.forEach(r -> { userIds.add(r.getReporterId()); if (r.getHandledBy() != null) userIds.add(r.getHandledBy()); });
        msgs.values().forEach(m -> userIds.add(m.getAuthorId()));
        Map<UUID, String> names = users.findAllById(userIds).stream().collect(Collectors.toMap(User::getId, User::getDisplayName));
        Map<UUID, String> channelNames = channels.findAllById(msgs.values().stream().map(Message::getChannelId).collect(Collectors.toSet())).stream()
            .collect(Collectors.toMap(Channel::getId, Channel::getName));
        return list.stream().map(r -> {
            Message m = msgs.get(r.getMessageId());
            return new ReportDto(r.getId(), r.getStatus(), r.getReason(), r.getDetails(), names.getOrDefault(r.getReporterId(), "Unknown"), r.getCreatedAt(),
                r.getMessageId(), m == null ? null : m.getChannelId(), m == null ? null : channelNames.get(m.getChannelId()),
                m == null ? null : m.getAuthorId(), m == null ? null : names.getOrDefault(m.getAuthorId(), "Unknown"),
                m == null || m.isDeleted() ? null : m.getBody(), m == null || m.isDeleted(),
                r.getHandledBy() == null ? null : names.get(r.getHandledBy()), r.getHandledAt());
        }).toList();
    }
}
