package com.medcord.call;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CallRepository extends JpaRepository<Call, UUID> {
    /** Calls still ringing or connected that involve this user (as caller or callee). */
    @Query("select c from Call c where (c.callerId = ?1 or c.calleeId = ?1) and c.status in ('RINGING', 'CONNECTED')")
    List<Call> activeFor(UUID userId);
}
