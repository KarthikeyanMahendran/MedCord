package com.medcord.admin;

import com.medcord.common.ApiException;
import com.medcord.user.*;
import com.medcord.user.ProfessionalProfile.Verification;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class VerificationService {
    private final VerificationQueries queries;
    private final ProfessionalProfileRepository profiles;
    private final UserRepository users;
    private final VerificationDecisionRepository decisions;

    public VerificationService(VerificationQueries queries, ProfessionalProfileRepository profiles,
                               UserRepository users, VerificationDecisionRepository decisions) {
        this.queries = queries;
        this.profiles = profiles;
        this.users = users;
        this.decisions = decisions;
    }

    @Transactional(readOnly = true)
    public Page<VerificationItem> list(Verification status, int page, int size) {
        PageRequest pr = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
        return status == null ? queries.findAllItems(pr) : queries.findItemsByStatus(status, pr);
    }

    /** Only PENDING requests can be decided. Approval activates the account. Every decision is audited. */
    @Transactional
    public VerificationItem decide(UUID userId, UUID adminId, Verification decision, String reason) {
        if (decision == Verification.PENDING) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Decision must be APPROVED or REJECTED");
        }
        if (decision == Verification.REJECTED && (reason == null || reason.isBlank())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "A reason is required when rejecting");
        }
        ProfessionalProfile p = profiles.findById(userId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Verification request not found"));
        if (p.getVerificationStatus() != Verification.PENDING) {
            throw new ApiException(HttpStatus.CONFLICT, "Request already " + p.getVerificationStatus().name().toLowerCase());
        }
        User u = users.findById(userId).orElseThrow();
        p.setVerificationStatus(decision);
        if (decision == Verification.APPROVED) {
            p.setVerifiedAt(Instant.now());
            if (u.getStatus() == User.Status.PENDING) u.setStatus(User.Status.ACTIVE);
        }
        VerificationDecision d = new VerificationDecision();
        d.setUserId(userId);
        d.setDecidedBy(adminId);
        d.setDecision(decision.name());
        d.setReason(reason == null ? null : reason.trim());
        decisions.save(d);
        profiles.flush();
        users.flush();
        return queries.findItem(userId).orElseThrow();
    }
}
