package com.medcord.admin;

import com.medcord.user.ProfessionalProfile;
import com.medcord.user.ProfessionalProfile.Verification;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface VerificationQueries extends JpaRepository<ProfessionalProfile, UUID> {
    String SELECT = "select new com.medcord.admin.VerificationItem(u.id, u.displayName, u.email, p.specialty, "
        + "p.licenseNumber, p.licenseCountry, p.verificationStatus, u.createdAt, p.verifiedAt) "
        + "from ProfessionalProfile p, User u where u.id = p.userId";

    @Query(value = SELECT + " order by u.createdAt asc",
           countQuery = "select count(p) from ProfessionalProfile p")
    Page<VerificationItem> findAllItems(Pageable pageable);

    @Query(value = SELECT + " and p.verificationStatus = ?1 order by u.createdAt asc",
           countQuery = "select count(p) from ProfessionalProfile p where p.verificationStatus = ?1")
    Page<VerificationItem> findItemsByStatus(Verification status, Pageable pageable);

    @Query(SELECT + " and u.id = ?1")
    Optional<VerificationItem> findItem(UUID userId);
}
