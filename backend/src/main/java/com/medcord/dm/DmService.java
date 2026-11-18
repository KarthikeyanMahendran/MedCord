package com.medcord.dm;

import com.medcord.common.ApiException;
import com.medcord.community.Channel;
import com.medcord.community.ChannelRepository;
import com.medcord.community.MembershipRepository;
import com.medcord.dm.DmDtos.*;
import com.medcord.message.Message;
import com.medcord.message.MessageRepository;
import com.medcord.user.*;
import com.medcord.user.ProfessionalProfile.Verification;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DmService {
    private static final int MAX_PARTICIPANTS = 10;

    private final ChannelRepository channels;
    private final DmParticipantRepository participants;
    private final UserBlockRepository blocks;
    private final MembershipRepository memberships;
    private final MessageRepository messages;
    private final UserRepository users;
    private final ProfessionalProfileRepository profiles;

    public DmService(ChannelRepository channels, DmParticipantRepository participants, UserBlockRepository blocks,
                     MembershipRepository memberships, MessageRepository messages, UserRepository users,
                     ProfessionalProfileRepository profiles) {
        this.channels = channels; this.participants = participants; this.blocks = blocks;
        this.memberships = memberships; this.messages = messages; this.users = users; this.profiles = profiles;
    }

    /** One user -> 1:1 DM, several -> group DM (max 10 people including you). Reuses an existing DM with the same people. */
    @Transactional
    public ConversationDto start(UUID me, Set<UUID> others) {
        Set<UUID> all = new TreeSet<>(others);
        all.remove(me);
        if (all.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "Choose at least one other person");
        if (all.size() + 1 > MAX_PARTICIPANTS) throw new ApiException(HttpStatus.BAD_REQUEST, "A group DM can have at most " + MAX_PARTICIPANTS + " people");
        Map<UUID, User> found = users.findAllById(all).stream().collect(Collectors.toMap(User::getId, u -> u));
        for (UUID id : all) {
            User u = found.get(id);
            if (u == null) throw new ApiException(HttpStatus.NOT_FOUND, "User not found");
            if (u.getStatus() == User.Status.SUSPENDED) throw new ApiException(HttpStatus.FORBIDDEN, "You can't message this user");
            if (!memberships.shareCommunity(me, id)) throw new ApiException(HttpStatus.FORBIDDEN, "You can only message people you share a community with");
            if (blocks.eitherBlocked(me, id)) throw new ApiException(HttpStatus.FORBIDDEN, "You can't message this user");
        }
        all.add(me);
        String key = all.stream().map(UUID::toString).collect(Collectors.joining(","));
        Channel ch = channels.findByDmKey(key).orElseGet(() -> create(key, all));
        return toDto(ch, me);
    }

    private Channel create(String key, Set<UUID> all) {
        try {
            Channel ch = new Channel();
            ch.setType(Channel.Type.DM);
            ch.setName("dm");
            ch.setDmKey(key);
            ch = channels.saveAndFlush(ch);
            for (UUID id : all) participants.save(new DmParticipant(ch.getId(), id));
            participants.flush();
            return ch;
        } catch (DataIntegrityViolationException race) {
            return channels.findByDmKey(key).orElseThrow(() -> race);   // concurrent create: use the winner
        }
    }

    @Transactional(readOnly = true)
    public List<ConversationDto> list(UUID me) {
        List<Channel> mine = channels.findAllById(participants.channelIdsOf(me));
        List<ConversationDto> out = new ArrayList<>();
        for (Channel c : mine) out.add(toDto(c, me));
        out.sort(Comparator.comparing((ConversationDto d) -> d.lastMessage() == null ? java.time.Instant.EPOCH : d.lastMessage().at()).reversed());
        return out;
    }

    @Transactional(readOnly = true)
    public ConversationDto get(UUID channelId, UUID me) {
        if (!participants.existsByChannelIdAndUserId(channelId, me)) throw new ApiException(HttpStatus.NOT_FOUND, "Conversation not found");
        return toDto(channels.findById(channelId).orElseThrow(), me);
    }

    // ---- blocks ----

    @Transactional
    public void block(UUID me, UUID target) {
        if (me.equals(target)) throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot block yourself");
        if (!users.existsById(target)) throw new ApiException(HttpStatus.NOT_FOUND, "User not found");
        UserBlock.Key key = new UserBlock.Key(me, target);
        if (!blocks.existsById(key)) {
            UserBlock b = new UserBlock();
            b.setBlockerId(me);
            b.setBlockedId(target);
            blocks.save(b);
        }
    }

    @Transactional
    public void unblock(UUID me, UUID target) {
        blocks.deleteById(new UserBlock.Key(me, target));
    }

    @Transactional(readOnly = true)
    public List<BlockedUser> blocked(UUID me) {
        List<UserBlock> list = blocks.findByBlockerIdOrderByCreatedAtDesc(me);
        Map<UUID, User> byId = users.findAllById(list.stream().map(UserBlock::getBlockedId).toList()).stream().collect(Collectors.toMap(User::getId, u -> u));
        return list.stream().map(b -> new BlockedUser(b.getBlockedId(),
            byId.containsKey(b.getBlockedId()) ? byId.get(b.getBlockedId()).getDisplayName() : "Unknown", b.getCreatedAt())).toList();
    }

    // ---- mapping ----

    private ConversationDto toDto(Channel c, UUID me) {
        List<UUID> ids = participants.findByChannelId(c.getId()).stream().map(DmParticipant::getUserId).toList();
        Map<UUID, User> byId = users.findAllById(ids).stream().collect(Collectors.toMap(User::getId, u -> u));
        Map<UUID, ProfessionalProfile> profs = profiles.findAllById(ids).stream().collect(Collectors.toMap(ProfessionalProfile::getUserId, p -> p));
        List<Participant> people = ids.stream().filter(byId::containsKey).map(id -> {
            User u = byId.get(id);
            ProfessionalProfile p = profs.get(id);
            return new Participant(id, u.getDisplayName(), p == null ? null : p.getSpecialty(),
                p != null && p.getVerificationStatus() == Verification.APPROVED, Presence.online(u));
        }).sorted(Comparator.comparing(Participant::displayName, String.CASE_INSENSITIVE_ORDER)).toList();

        List<Participant> others = people.stream().filter(p -> !p.id().equals(me)).toList();
        boolean group = people.size() > 2;
        String name = others.isEmpty() ? "Just you" : others.stream().map(Participant::displayName).collect(Collectors.joining(", "));

        LastMessage last = messages.latest(c.getId(), PageRequest.of(0, 1)).stream().findFirst().map(m -> {
            User a = byId.get(m.getAuthorId());
            return new LastMessage(a == null ? "Unknown" : a.getDisplayName(), preview(m), m.getCreatedAt());
        }).orElse(null);

        boolean byMe = false, byThem = false;
        if (!group && others.size() == 1) {
            UUID other = others.get(0).id();
            byMe = blocks.existsById(new UserBlock.Key(me, other));
            byThem = blocks.existsById(new UserBlock.Key(other, me));
        }
        return new ConversationDto(c.getId(), group, name, people, last, byMe, byThem);
    }

    private static String preview(Message m) {
        if (m.isDeleted()) return "Message deleted";
        String b = m.getBody();
        return b.length() <= 80 ? b : b.substring(0, 80) + "…";
    }
}
