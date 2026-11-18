package com.medcord.admin;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VerificationDecisionRepository extends JpaRepository<VerificationDecision, UUID> {
    Optional<VerificationDecision> findFirstByUserIdOrderByDecidedAtDesc(UUID userId);
}
