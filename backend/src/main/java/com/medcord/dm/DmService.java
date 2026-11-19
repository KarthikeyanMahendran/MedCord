package com.medcord.dm;

import com.medcord.common.ApiException;
import com.medcord.community.Channel;
import com.medcord.community.ChannelRepository;
import com.medcord.community.MembershipRepository;
import com.medcord.dm.DmDtos.*;
import com.medcord.message.MessageRepository;
import com.medcord.user.*;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
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
    private final JdbcClient jdbc;

    public DmService(ChannelRepository channels, DmParticipantRepository participants, UserBlockRepository blocks,
                     MembershipRepository memberships, MessageRepository messages, UserRepository users,
                     ProfessionalProfileRepository profiles, JdbcClient jdbc) {
        this.channels = channels; this.participants = participants; this.blocks = blocks;
        this.memberships = memberships; this.messages = messages; this.users = users; this.profiles = profiles;
        this.jdbc = jdbc;
    }

    /** One user -> 1:1 DM, several -> group DM (max 10 people including you). Reuses an existing DM with the same people. */
    @Transactional
    public ConversationDto start(UUID me, Set<UUID> others) {
        if (others == null || others.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "Choose at least one other person");
        Set<UUID> all = others.stream().filter(java.util.Objects::nonNull).collect(Collectors.toCollection(TreeSet::new));
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
        return get(ch.getId(), me);
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
        return list(me, 50, 0);
    }

    @Transactional(readOnly = true)
    public List<ConversationDto> list(UUID me, int limit, int offset) {
        record ChannelLast(UUID channelId, String dmKey, String lastBody, Instant lastAt, boolean lastDeleted, String lastAuthorName) {}
        List<ChannelLast> paged = jdbc.sql("""
            SELECT 
                c.id AS channel_id,
                c.dm_key,
                lm.body AS last_body,
                lm.created_at AS last_created_at,
                (lm.deleted_at IS NOT NULL) AS last_deleted,
                lm.author_name AS last_author_name
            FROM dm_participants my_dp
            JOIN channels c ON c.id = my_dp.channel_id AND c.type = 'DM'
            LEFT JOIN LATERAL (
                SELECT m.body, m.created_at, m.deleted_at, u.display_name AS author_name
                FROM messages m
                JOIN users u ON u.id = m.author_id
                WHERE m.channel_id = c.id AND m.thread_id IS NULL
                ORDER BY m.created_at DESC, m.id DESC
                LIMIT 1
            ) lm ON true
            WHERE my_dp.user_id = :me
            ORDER BY COALESCE(lm.created_at, my_dp.joined_at, '1970-01-01'::timestamptz) DESC
            LIMIT :limit OFFSET :offset
            """)
            .param("me", me)
            .param("limit", Math.max(limit, 1))
            .param("offset", Math.max(offset, 0))
            .query((rs, rowNum) -> new ChannelLast(
                (UUID) rs.getObject("channel_id"),
                rs.getString("dm_key"),
                rs.getString("last_body"),
                rs.getTimestamp("last_created_at") == null ? null : rs.getTimestamp("last_created_at").toInstant(),
                rs.getBoolean("last_deleted"),
                rs.getString("last_author_name")
            )).list();

        if (paged.isEmpty()) return List.of();

        List<UUID> channelIds = paged.stream().map(ChannelLast::channelId).toList();

        record PartRow(UUID channelId, UUID userId, String displayName, Instant lastSeenAt, String specialty, String verificationStatus) {}
        List<PartRow> allParts = jdbc.sql("""
            SELECT dp.channel_id, dp.user_id, u.display_name, u.last_seen_at, p.specialty, p.verification_status
            FROM dm_participants dp
            JOIN users u ON u.id = dp.user_id
            LEFT JOIN professional_profiles p ON p.user_id = u.id
            WHERE dp.channel_id IN (:channelIds)
            """)
            .param("channelIds", channelIds)
            .query((rs, rowNum) -> new PartRow(
                (UUID) rs.getObject("channel_id"),
                (UUID) rs.getObject("user_id"),
                rs.getString("display_name"),
                rs.getTimestamp("last_seen_at") == null ? null : rs.getTimestamp("last_seen_at").toInstant(),
                rs.getString("specialty"),
                rs.getString("verification_status")
            )).list();

        Map<UUID, List<PartRow>> partsByChannel = new HashMap<>();
        for (PartRow pr : allParts) {
            partsByChannel.computeIfAbsent(pr.channelId(), k -> new ArrayList<>()).add(pr);
        }

        Set<UUID> blockedByMe = new HashSet<>();
        Set<UUID> blockedMe = new HashSet<>();
        jdbc.sql("SELECT blocker_id, blocked_id FROM user_blocks WHERE blocker_id = :me OR blocked_id = :me")
            .param("me", me)
            .query((rs, rowNum) -> {
                UUID blocker = (UUID) rs.getObject("blocker_id");
                UUID blocked = (UUID) rs.getObject("blocked_id");
                if (blocker.equals(me)) blockedByMe.add(blocked);
                if (blocked.equals(me)) blockedMe.add(blocker);
                return null;
            }).list();

        Instant onlineCutoff = Instant.now().minus(Presence.WINDOW);
        List<ConversationDto> out = new ArrayList<>();
        for (ChannelLast cl : paged) {
            List<PartRow> pRows = partsByChannel.getOrDefault(cl.channelId(), List.of());
            List<Participant> people = pRows.stream().map(p -> new Participant(
                p.userId(),
                p.displayName(),
                p.specialty(),
                "APPROVED".equals(p.verificationStatus()),
                p.lastSeenAt() != null && p.lastSeenAt().isAfter(onlineCutoff)
            )).sorted(Comparator.comparing(Participant::displayName, String.CASE_INSENSITIVE_ORDER)).toList();

            List<Participant> others = people.stream().filter(p -> !p.id().equals(me)).toList();
            boolean group = people.size() > 2;
            String name = others.isEmpty() ? "Just you" : others.stream().map(Participant::displayName).collect(Collectors.joining(", "));

            LastMessage last = null;
            if (cl.lastAt() != null) {
                last = new LastMessage(
                    cl.lastAuthorName() == null ? "Unknown" : cl.lastAuthorName(),
                    preview(cl.lastBody(), cl.lastDeleted()),
                    cl.lastAt()
                );
            }

            boolean byMe = false, byThem = false;
            if (!group && others.size() == 1) {
                UUID other = others.get(0).id();
                byMe = blockedByMe.contains(other);
                byThem = blockedMe.contains(other);
            }

            out.add(new ConversationDto(cl.channelId(), group, name, people, last, byMe, byThem));
        }

        return out;
    }

    @Transactional(readOnly = true)
    public ConversationDto get(UUID channelId, UUID me) {
        record PartRow(UUID userId, String displayName, Instant lastSeenAt, String specialty, String verificationStatus) {}
        List<PartRow> parts = jdbc.sql("""
            SELECT dp.user_id, u.display_name, u.last_seen_at, p.specialty, p.verification_status
            FROM dm_participants dp
            JOIN channels c ON c.id = dp.channel_id AND c.type = 'DM'
            JOIN users u ON u.id = dp.user_id
            LEFT JOIN professional_profiles p ON p.user_id = u.id
            WHERE dp.channel_id = :channelId
            """)
            .param("channelId", channelId)
            .query((rs, rowNum) -> new PartRow(
                (UUID) rs.getObject("user_id"),
                rs.getString("display_name"),
                rs.getTimestamp("last_seen_at") == null ? null : rs.getTimestamp("last_seen_at").toInstant(),
                rs.getString("specialty"),
                rs.getString("verification_status")
            )).list();

        if (parts.isEmpty() || parts.stream().noneMatch(p -> p.userId().equals(me))) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Conversation not found");
        }

        Instant onlineCutoff = Instant.now().minus(Presence.WINDOW);
        List<Participant> people = parts.stream().map(p -> new Participant(
            p.userId(),
            p.displayName(),
            p.specialty(),
            "APPROVED".equals(p.verificationStatus()),
            p.lastSeenAt() != null && p.lastSeenAt().isAfter(onlineCutoff)
        )).sorted(Comparator.comparing(Participant::displayName, String.CASE_INSENSITIVE_ORDER)).toList();

        List<Participant> others = people.stream().filter(p -> !p.id().equals(me)).toList();
        boolean group = people.size() > 2;
        String name = others.isEmpty() ? "Just you" : others.stream().map(Participant::displayName).collect(Collectors.joining(", "));

        record MsgRow(String body, Instant createdAt, boolean deleted, String authorName) {}
        Optional<MsgRow> lastMsgRow = jdbc.sql("""
            SELECT m.body, m.created_at, (m.deleted_at IS NOT NULL) AS deleted, u.display_name AS author_name
            FROM messages m
            JOIN users u ON u.id = m.author_id
            WHERE m.channel_id = :channelId AND m.thread_id IS NULL
            ORDER BY m.created_at DESC, m.id DESC
            LIMIT 1
            """)
            .param("channelId", channelId)
            .query((rs, rowNum) -> new MsgRow(
                rs.getString("body"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getBoolean("deleted"),
                rs.getString("author_name")
            )).optional();

        LastMessage last = lastMsgRow.map(m -> new LastMessage(
            m.authorName() == null ? "Unknown" : m.authorName(),
            preview(m.body(), m.deleted()),
            m.createdAt()
        )).orElse(null);

        boolean byMe = false, byThem = false;
        if (!group && others.size() == 1) {
            UUID other = others.get(0).id();
            List<UUID> blockers = jdbc.sql("""
                SELECT blocker_id FROM user_blocks
                WHERE (blocker_id = :me AND blocked_id = :other)
                   OR (blocker_id = :other AND blocked_id = :me)
                """)
                .param("me", me)
                .param("other", other)
                .query((rs, rowNum) -> (UUID) rs.getObject("blocker_id")).list();
            byMe = blockers.contains(me);
            byThem = blockers.contains(other);
        }

        return new ConversationDto(channelId, group, name, people, last, byMe, byThem);
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

    private static String preview(String b, boolean deleted) {
        if (deleted) return "Message deleted";
        if (b == null) return "";
        return b.length() <= 80 ? b : b.substring(0, 80) + "…";
    }
}
