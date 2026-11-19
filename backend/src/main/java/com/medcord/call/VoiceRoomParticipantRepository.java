package com.medcord.call;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VoiceRoomParticipantRepository extends JpaRepository<VoiceRoomParticipant, VoiceRoomParticipant.Key> {
    List<VoiceRoomParticipant> findByChannelIdOrderByJoinedAtAsc(UUID channelId);
    List<VoiceRoomParticipant> findByChannelIdInOrderByJoinedAtAsc(Collection<UUID> channelIds);
    List<VoiceRoomParticipant> findByUserId(UUID userId);
}
