package com.medcord.audit;

import com.medcord.community.Permission;
import com.medcord.community.PermissionService;
import com.medcord.user.User;
import com.medcord.user.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Append-only trail of sensitive actions. record() joins the caller's transaction so it commits or rolls back with the action. */
@Service
public class AuditService {
    private final AuditRepository repo;
    private final UserRepository users;
    private final PermissionService perms;

    public AuditService(AuditRepository repo, UserRepository users, PermissionService perms) {
        this.repo = repo; this.users = users; this.perms = perms;
    }

    public record AuditDto(UUID id, String action, UUID actorId, String actorName, String targetType, UUID targetId, String summary, Instant createdAt) {}
    public record AuditPage(List<AuditDto> items, int page, int size, long total, int totalPages) {}

    public String userName(UUID userId) {
        return users.findById(userId).map(User::getDisplayName).orElse("a user");
    }

    public void record(UUID communityId, UUID actorId, String action, String targetType, UUID targetId, String summary) {
        AuditEntry e = new AuditEntry();
        e.setCommunityId(communityId);
        e.setActorId(actorId);
        e.setAction(action);
        e.setTargetType(targetType);
        e.setTargetId(targetId);
        e.setSummary(summary.length() > 500 ? summary.substring(0, 500) : summary);
        repo.save(e);
    }

    /** Owners/admins only (MANAGE_COMMUNITY). */
    @Transactional(readOnly = true)
    public AuditPage list(UUID communityId, UUID viewerId, String action, int page, int size) {
        perms.require(communityId, viewerId, Permission.MANAGE_COMMUNITY);
        PageRequest pr = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
        Page<AuditEntry> p = action == null || action.isBlank() ? repo.forCommunity(communityId, pr) : repo.forCommunityAndAction(communityId, action, pr);
        Map<UUID, String> names = users.findAllById(p.getContent().stream().map(AuditEntry::getActorId).collect(Collectors.toSet()))
            .stream().collect(Collectors.toMap(User::getId, User::getDisplayName));
        List<AuditDto> items = p.getContent().stream().map(a -> new AuditDto(a.getId(), a.getAction(), a.getActorId(),
            names.getOrDefault(a.getActorId(), "Unknown"), a.getTargetType(), a.getTargetId(), a.getSummary(), a.getCreatedAt())).toList();
        return new AuditPage(items, p.getNumber(), p.getSize(), p.getTotalElements(), p.getTotalPages());
    }
}
