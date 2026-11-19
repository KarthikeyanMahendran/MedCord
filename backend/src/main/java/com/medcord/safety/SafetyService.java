package com.medcord.safety;

import com.medcord.audit.AuditService;
import com.medcord.common.ApiException;
import com.medcord.community.Channel;
import com.medcord.community.ChannelRepository;
import com.medcord.community.Permission;
import com.medcord.community.PermissionService;
import com.medcord.message.ChannelAccess;
import com.medcord.nexconn.NexconnGateway;
import com.medcord.safety.PhiDetector.ScanResult;
import com.medcord.safety.SafetyPolicy.PhiMode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Enforces the Clinical Privacy Shield: pre-send PHI detection/redaction, per-community safety policies,
 * custom restricted terms synced with Nexconn's content-safety profanity filter, and category-only audit logging.
 */
@Service
public class SafetyService {
    private final SafetyPolicyRepository policies;
    private final BlockedTermRepository terms;
    private final ChannelRepository channels;
    private final ChannelAccess access;
    private final PermissionService perms;
    private final NexconnGateway nexconn;
    private final AuditService audit;
    private final TransactionTemplate requiresNewTx;

    public SafetyService(SafetyPolicyRepository policies, BlockedTermRepository terms, ChannelRepository channels,
                         ChannelAccess access, PermissionService perms, NexconnGateway nexconn, AuditService audit,
                         PlatformTransactionManager txManager) {
        this.policies = policies;
        this.terms = terms;
        this.channels = channels;
        this.access = access;
        this.perms = perms;
        this.nexconn = nexconn;
        this.audit = audit;
        this.requiresNewTx = new TransactionTemplate(txManager);
        this.requiresNewTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public record BlockedTermDto(UUID id, String term, boolean syncedToNexconn, Instant createdAt) {}

    public record SafetyPolicyDto(UUID communityId, PhiMode phiMode, boolean autoRedact,
                                  boolean nexconnModerationEnabled, List<BlockedTermDto> blockedTerms) {}

    public record ScanResponse(boolean hasPhi, PhiMode effectiveMode, boolean autoRedactPolicy,
                               List<String> categories, List<PhiDetector.Finding> findings, String redactedText) {}

    public record EnforcedBody(String body, boolean redacted, List<String> categories) {}

    @Transactional(readOnly = true)
    public SafetyPolicyDto getPolicy(UUID communityId, UUID viewerId) {
        perms.membership(communityId, viewerId);
        SafetyPolicy p = policies.findById(communityId).orElseGet(() -> defaultPolicy(communityId));
        List<BlockedTermDto> termDtos = terms.findByCommunityIdOrderByCreatedAtDesc(communityId).stream()
            .map(SafetyService::toDto).toList();
        return new SafetyPolicyDto(communityId, p.getPhiMode(), p.isAutoRedact(), nexconn.enabled(), termDtos);
    }

    @Transactional
    public SafetyPolicyDto updatePolicy(UUID communityId, UUID actorId, PhiMode phiMode, boolean autoRedact) {
        perms.require(communityId, actorId, Permission.MANAGE_COMMUNITY);
        SafetyPolicy p = policies.findById(communityId).orElseGet(() -> defaultPolicy(communityId));
        p.setPhiMode(phiMode);
        p.setAutoRedact(autoRedact);
        p.setUpdatedBy(actorId);
        p.setUpdatedAt(Instant.now());
        policies.saveAndFlush(p);
        audit.record(communityId, actorId, "SAFETY_POLICY_UPDATED", "COMMUNITY", communityId,
            "Set PHI privacy shield to " + phiMode + (autoRedact ? " (auto-redact enabled)" : ""));
        return getPolicy(communityId, actorId);
    }

    @Transactional
    public BlockedTermDto addTerm(UUID communityId, UUID actorId, String rawTerm) {
        perms.require(communityId, actorId, Permission.MODERATE_MESSAGES);
        String clean = rawTerm == null ? "" : rawTerm.trim();
        if (clean.length() < 2 || clean.length() > 120) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Restricted term must be between 2 and 120 characters");
        }
        if (terms.findByCommunityIdAndTermIgnoreCase(communityId, clean).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "This term is already in the restricted list");
        }
        boolean synced = nexconn.addProfanityWord(clean);
        BlockedTerm entity = new BlockedTerm();
        entity.setCommunityId(communityId);
        entity.setTerm(clean);
        entity.setSyncedToNexconn(synced);
        entity.setCreatedBy(actorId);
        entity = terms.saveAndFlush(entity);
        audit.record(communityId, actorId, "BLOCKED_TERM_ADDED", "COMMUNITY", communityId,
            "Added restricted content-safety term" + (synced ? " (synced to Nexconn)" : ""));
        return toDto(entity);
    }

    @Transactional
    public void removeTerm(UUID communityId, UUID termId, UUID actorId) {
        perms.require(communityId, actorId, Permission.MODERATE_MESSAGES);
        BlockedTerm entity = terms.findById(termId)
            .filter(t -> t.getCommunityId().equals(communityId))
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Restricted term not found"));
        if (entity.isSyncedToNexconn()) {
            nexconn.removeProfanityWord(entity.getTerm());
        }
        terms.delete(entity);
        audit.record(communityId, actorId, "BLOCKED_TERM_REMOVED", "COMMUNITY", communityId,
            "Removed restricted content-safety term");
    }

    @Transactional(readOnly = true)
    public ScanResponse scanForChannel(UUID channelId, UUID viewerId, String body) {
        Channel ch = channels.findById(channelId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Channel not found"));
        access.permissions(ch, viewerId);
        SafetyPolicy p = ch.getCommunityId() == null ? defaultPolicy(null)
            : policies.findById(ch.getCommunityId()).orElseGet(() -> defaultPolicy(ch.getCommunityId()));
        List<String> blocked = ch.getCommunityId() == null ? List.of()
            : terms.findByCommunityIdOrderByCreatedAtDesc(ch.getCommunityId()).stream().map(BlockedTerm::getTerm).toList();
        ScanResult res = PhiDetector.scan(body, blocked);
        return new ScanResponse(res.hasPhi(), p.getPhiMode(), p.isAutoRedact(),
            res.categories(), res.findings(), res.redactedText());
    }

    /**
     * Enforces the channel's PHI privacy policy before persisting a message or edit.
     * Audit logs record ONLY matched PHI categories, never raw patient identifiers.
     */
    public EnforcedBody enforceBeforeSend(Channel ch, UUID actorId, String body, boolean clientRequestedAutoRedact) {
        if (body == null || body.isBlank()) {
            return new EnforcedBody(body == null ? "" : body, false, List.of());
        }
        UUID communityId = ch.getCommunityId();
        SafetyPolicy p = communityId == null ? defaultPolicy(null)
            : policies.findById(communityId).orElseGet(() -> defaultPolicy(communityId));
        if (p.getPhiMode() == PhiMode.OFF && !clientRequestedAutoRedact) {
            return new EnforcedBody(body, false, List.of());
        }
        List<String> blocked = communityId == null ? List.of()
            : terms.findByCommunityIdOrderByCreatedAtDesc(communityId).stream().map(BlockedTerm::getTerm).toList();
        ScanResult scan = PhiDetector.scan(body, blocked);
        if (!scan.hasPhi()) {
            return new EnforcedBody(body, false, List.of());
        }

        if (clientRequestedAutoRedact || p.isAutoRedact()) {
            if (communityId != null) {
                audit.record(communityId, actorId, "PHI_REDACTED", "CHANNEL", ch.getId(),
                    "Auto-redacted potential PHI categories [" + String.join(", ", scan.categories()) + "] in #" + ch.getName());
            }
            return new EnforcedBody(scan.redactedText(), true, scan.categories());
        }

        if (p.getPhiMode() == PhiMode.STRICT_BLOCK) {
            if (communityId != null) {
                // Persist the security audit event in a separate transaction so the 422 rollback preserves it.
                requiresNewTx.executeWithoutResult(status ->
                    audit.record(communityId, actorId, "PHI_BLOCKED", "CHANNEL", ch.getId(),
                        "Blocked message containing potential PHI categories [" + String.join(", ", scan.categories()) + "] in #" + ch.getName())
                );
            }
            throw new ApiException(
                HttpStatus.valueOf(422),
                "Potential patient data (PHI) detected: " + String.join(", ", scan.categories())
                    + ". Remove identifiers or use Auto-Redact before sending.",
                Map.of(
                    "code", "PHI_DETECTED",
                    "phiCategories", scan.categories(),
                    "redactedSuggestion", scan.redactedText()
                )
            );
        }

        // WARN mode allows sending after the client-side warning banner; no raw PHI logged.
        return new EnforcedBody(body, false, scan.categories());
    }

    private static SafetyPolicy defaultPolicy(UUID communityId) {
        SafetyPolicy p = new SafetyPolicy();
        p.setCommunityId(communityId);
        p.setPhiMode(PhiMode.WARN);
        p.setAutoRedact(false);
        return p;
    }

    private static BlockedTermDto toDto(BlockedTerm t) {
        return new BlockedTermDto(t.getId(), t.getTerm(), t.isSyncedToNexconn(), t.getCreatedAt());
    }
}
