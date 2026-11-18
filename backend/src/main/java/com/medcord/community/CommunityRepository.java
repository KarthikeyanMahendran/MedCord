package com.medcord.community;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface CommunityRepository extends JpaRepository<Community, UUID> {
    boolean existsBySlug(String slug);

    @Query("select c from Community c where c.id in (select m.communityId from Membership m where m.userId = ?1) order by c.name")
    List<Community> findMine(UUID userId);

    @Query("select c from Community c where c.visibility = 'PUBLIC' and (lower(c.name) like lower(concat('%', ?1, '%')) "
        + "or lower(coalesce(c.specialtyTag,'')) like lower(concat('%', ?1, '%'))) order by c.name")
    List<Community> discover(String q);
}
