package com.medcord.call;

import com.medcord.common.ApiException;
import com.medcord.community.*;
import com.medcord.realtime.RealtimeEvent;
import com.medcord.realtime.RealtimeHub;
import com.medcord.user.ProfessionalProfile;
import com.medcord.user.ProfessionalProfileRepository;
import com.medcord.user.User;
import com.medcord.user.UserRepository;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Multi-party community voice/video rooms with screen sharing and WebRTC signaling over SSE.
 */
@Service
public class VoiceRoomService {
    private static final int MAX_PARTICIPANTS = 24;

    private final VoiceRoomParticipantRepository participants;
    private final ChannelRepository channels;
    private final PermissionService perms;
    private final UserRepository users;
    private final ProfessionalProfileRepository profiles;
    private final RealtimeHub realtime;

    public VoiceRoomService(VoiceRoomParticipantRepository participants, ChannelRepository channels,
                            PermissionService perms, UserRepository users,
                            ProfessionalProfileRepository profiles, RealtimeHub realtime) {
        this.participants = participants;
        this.channels = channels;
        this.perms = perms;
        this.users = users;
        this.profiles = profiles;
        this.realtime = realtime;
    }

    public record ParticipantDto(UUID userId, String displayName, String specialty, boolean verified,
                                 boolean micOn, boolean camOn, boolean screenSharing, Instant joinedAt) {}

    public record VoiceRoomDto(UUID channelId, UUID communityId, String name, String topic, boolean archived,
                               List<ParticipantDto> participants) {}

    @Transactional(readOnly = true)
    public List<VoiceRoomDto> listForCommunity(UUID communityId, UUID userId) {
        perms.membership(communityId, userId);
        List<Channel> voiceChannels = channels.findByCommunityIdOrderByPositionAscNameAsc(communityId).stream()
            .filter(c -> c.getType() == Channel.Type.VOICE)
            .toList();
        if (voiceChannels.isEmpty()) return List.of();
        List<UUID> chanIds = voiceChannels.stream().map(Channel::getId).toList();
        List<VoiceRoomParticipant> all = participants.findByChannelIdInOrderByJoinedAtAsc(chanIds);
        Map<UUID, List<ParticipantDto>> byChannel = toParticipantDtos(all);
        return voiceChannels.stream()
            .map(c -> new VoiceRoomDto(c.getId(), c.getCommunityId(), c.getName(), c.getTopic(), c.isArchived(),
                byChannel.getOrDefault(c.getId(), List.of())))
            .toList();
    }

    @Transactional(readOnly = true)
    public VoiceRoomDto getRoom(UUID channelId, UUID userId) {
        Channel ch = voiceChannel(channelId);
        perms.membership(ch.getCommunityId(), userId);
        return roomDto(ch);
    }

    @Transactional
    public VoiceRoomDto join(UUID channelId, UUID userId, boolean micOn, boolean camOn) {
        Channel ch = voiceChannel(channelId);
        perms.membership(ch.getCommunityId(), userId);
        if (ch.isArchived()) throw new ApiException(HttpStatus.CONFLICT, "This voice channel is archived");
        User u = users.findById(userId).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        if (u.getStatus() == User.Status.SUSPENDED) throw new ApiException(HttpStatus.FORBIDDEN, "Account suspended");

        // Leave any other voice channel this user is currently occupying
        for (VoiceRoomParticipant prev : participants.findByUserId(userId)) {
            if (!prev.getChannelId().equals(channelId)) {
                UUID oldChanId = prev.getChannelId();
                participants.delete(prev);
                participants.flush();
                channels.findById(oldChanId).ifPresent(oldCh ->
                    realtime.publishToCommunity(oldCh.getCommunityId(),
                        RealtimeEvent.of("VOICE_ROOM_UPDATED", oldChanId, oldCh.getCommunityId(), roomDto(oldCh))));
            }
        }

        VoiceRoomParticipant.Key key = new VoiceRoomParticipant.Key(channelId, userId);
        VoiceRoomParticipant existing = participants.findById(key).orElse(null);
        if (existing == null) {
            if (participants.findByChannelIdOrderByJoinedAtAsc(channelId).size() >= MAX_PARTICIPANTS) {
                throw new ApiException(HttpStatus.CONFLICT, "Voice room is full");
            }
            existing = new VoiceRoomParticipant();
            existing.setChannelId(channelId);
            existing.setUserId(userId);
        }
        existing.setMicOn(micOn);
        existing.setCamOn(camOn);
        existing.setScreenSharing(false);
        participants.saveAndFlush(existing);

        VoiceRoomDto dto = roomDto(ch);
        realtime.publishToCommunity(ch.getCommunityId(),
            RealtimeEvent.of("VOICE_ROOM_UPDATED", channelId, ch.getCommunityId(), dto));
        return dto;
    }

    @Transactional
    public void leave(UUID channelId, UUID userId) {
        Channel ch = voiceChannel(channelId);
        perms.membership(ch.getCommunityId(), userId);
        participants.deleteById(new VoiceRoomParticipant.Key(channelId, userId));
        participants.flush();
        realtime.publishToCommunity(ch.getCommunityId(),
            RealtimeEvent.of("VOICE_ROOM_UPDATED", channelId, ch.getCommunityId(), roomDto(ch)));
    }

    @Transactional
    public VoiceRoomDto updateState(UUID channelId, UUID userId, Boolean micOn, Boolean camOn, Boolean screenSharing) {
        Channel ch = voiceChannel(channelId);
        perms.membership(ch.getCommunityId(), userId);
        VoiceRoomParticipant p = participants.findById(new VoiceRoomParticipant.Key(channelId, userId))
            .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "You are not in this voice room"));
        if (micOn != null) p.setMicOn(micOn);
        if (camOn != null) p.setCamOn(camOn);
        if (screenSharing != null) p.setScreenSharing(screenSharing);
        participants.saveAndFlush(p);

        VoiceRoomDto dto = roomDto(ch);
        realtime.publishToCommunity(ch.getCommunityId(),
            RealtimeEvent.of("VOICE_ROOM_UPDATED", channelId, ch.getCommunityId(), dto));
        return dto;
    }

    @Transactional(readOnly = true)
    public void signal(UUID channelId, UUID fromUserId, UUID toUserId, String kind, Object data) {
        Channel ch = voiceChannel(channelId);
        perms.membership(ch.getCommunityId(), fromUserId);
        if (!participants.existsById(new VoiceRoomParticipant.Key(channelId, fromUserId))) {
            throw new ApiException(HttpStatus.CONFLICT, "Join the voice room before signaling");
        }
        if (!participants.existsById(new VoiceRoomParticipant.Key(channelId, toUserId))) {
            return; // Peer already left
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("channelId", channelId);
        payload.put("fromUserId", fromUserId);
        payload.put("kind", kind);
        payload.put("data", data);
        realtime.sendToUser(toUserId, RealtimeEvent.of("VOICE_SIGNAL", channelId, ch.getCommunityId(), payload));
    }

    private VoiceRoomDto roomDto(Channel ch) {
        List<VoiceRoomParticipant> list = participants.findByChannelIdOrderByJoinedAtAsc(ch.getId());
        List<ParticipantDto> dtos = toParticipantDtos(list).getOrDefault(ch.getId(), List.of());
        return new VoiceRoomDto(ch.getId(), ch.getCommunityId(), ch.getName(), ch.getTopic(), ch.isArchived(), dtos);
    }

    private Map<UUID, List<ParticipantDto>> toParticipantDtos(List<VoiceRoomParticipant> rows) {
        if (rows.isEmpty()) return Map.of();
        Set<UUID> uids = rows.stream().map(VoiceRoomParticipant::getUserId).collect(Collectors.toSet());
        Map<UUID, User> uMap = users.findAllById(uids).stream().collect(Collectors.toMap(User::getId, x -> x));
        Map<UUID, ProfessionalProfile> pMap = profiles.findAllById(uids).stream()
            .collect(Collectors.toMap(ProfessionalProfile::getUserId, x -> x));

        Map<UUID, List<ParticipantDto>> out = new HashMap<>();
        for (VoiceRoomParticipant row : rows) {
            User u = uMap.get(row.getUserId());
            ProfessionalProfile p = pMap.get(row.getUserId());
            out.computeIfAbsent(row.getChannelId(), k -> new ArrayList<>()).add(new ParticipantDto(
                row.getUserId(),
                u == null ? "Unknown" : u.getDisplayName(),
                p == null ? null : p.getSpecialty(),
                p != null && p.getVerificationStatus() == ProfessionalProfile.Verification.APPROVED,
                row.isMicOn(), row.isCamOn(), row.isScreenSharing(), row.getJoinedAt()
            ));
        }
        return out;
    }

    private Channel voiceChannel(UUID channelId) {
        Channel ch = channels.findById(channelId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Channel not found"));
        if (ch.getType() != Channel.Type.VOICE) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Not a voice channel");
        }
        return ch;
    }
}
