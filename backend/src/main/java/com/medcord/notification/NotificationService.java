package com.medcord.notification;

import com.medcord.common.ApiException;
import com.medcord.community.*;
import com.medcord.dm.DmParticipant;
import com.medcord.dm.DmParticipantRepository;
import com.medcord.message.ChannelAccess;
import com.medcord.message.Message;
import com.medcord.message.MessageRepository;
import com.medcord.notification.ChannelNotificationPref.Level;
import com.medcord.notification.NotificationDtos.*;
import com.medcord.realtime.RealtimeEvent;
import com.medcord.realtime.RealtimeHub;
import com.medcord.user.User;
import com.medcord.user.UserRepository;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {
    private static final Pattern EVERYONE_PATTERN = Pattern.compile("(?i)(^|\\s)@everyone(?=$|[\\s.,!?:;)])");

    private final ChannelReadStateRepository readStates;
    private final MessageMentionRepository mentions;
    private final UserNotificationPrefRepository userPrefs;
    private final ChannelNotificationPrefRepository channelPrefs;
    private final ChannelRepository channels;
    private final CommunityRepository communities;
    private final MembershipRepository memberships;
    private final RoleRepository roles;
    private final DmParticipantRepository dmParticipants;
    private final MessageRepository messages;
    private final UserRepository users;
    private final ChannelAccess access;
    private final RealtimeHub realtime;

    public NotificationService(ChannelReadStateRepository readStates, MessageMentionRepository mentions,
                               UserNotificationPrefRepository userPrefs, ChannelNotificationPrefRepository channelPrefs,
                               ChannelRepository channels, CommunityRepository communities,
                               MembershipRepository memberships, RoleRepository roles,
                               DmParticipantRepository dmParticipants, MessageRepository messages,
                               UserRepository users, ChannelAccess access, RealtimeHub realtime) {
        this.readStates = readStates;
        this.mentions = mentions;
        this.userPrefs = userPrefs;
        this.channelPrefs = channelPrefs;
        this.channels = channels;
        this.communities = communities;
        this.memberships = memberships;
        this.roles = roles;
        this.dmParticipants = dmParticipants;
        this.messages = messages;
        this.users = users;
        this.access = access;
        this.realtime = realtime;
    }

    /**
     * Parses @user, @role and @everyone mentions on a freshly persisted message, enforces @everyone permission,
     * persists mention rows, advances the author's own read cursor, and pushes live SSE notifications respecting DND/mute.
     */
    @Transactional
    public void onMessagePosted(Channel ch, Message msg, User author, Set<Permission> authorPerms) {
        // Advance author's read state so own messages are never unread
        upsertReadState(author.getId(), ch.getId(), msg.getId(), msg.getCreatedAt());

        String body = msg.getBody() == null ? "" : msg.getBody();
        String lower = body.toLowerCase(Locale.ROOT);
        Map<UUID, MentionMatch> matched = new LinkedHashMap<>();

        boolean hasEveryone = EVERYONE_PATTERN.matcher(body).find();
        if (hasEveryone && ch.getType() != Channel.Type.DM) {
            boolean canEveryone = authorPerms.contains(Permission.POST_ANNOUNCEMENTS)
                || authorPerms.contains(Permission.MODERATE_MESSAGES)
                || authorPerms.contains(Permission.MANAGE_COMMUNITY);
            if (!canEveryone) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Only moderators or announcers can use @everyone");
            }
        }

        List<UUID> memberUserIds;
        if (ch.getType() == Channel.Type.DM) {
            memberUserIds = dmParticipants.findByChannelId(ch.getId()).stream().map(DmParticipant::getUserId).toList();
        } else {
            List<Membership> ms = memberships.findByCommunityId(ch.getCommunityId());
            memberUserIds = ms.stream().map(Membership::getUserId).toList();

            if (hasEveryone) {
                for (UUID uid : memberUserIds) {
                    if (!uid.equals(author.getId())) {
                        matched.put(uid, new MentionMatch("EVERYONE", "@everyone"));
                    }
                }
            }

            if (lower.contains("@")) {
                List<Role> commRoles = new ArrayList<>(roles.findByCommunityIdOrderByPositionAsc(ch.getCommunityId()));
                commRoles.sort((a, b) -> Integer.compare(b.getName().length(), a.getName().length()));
                for (Role role : commRoles) {
                    if (containsMentionToken(lower, role.getName().toLowerCase(Locale.ROOT))) {
                        for (Membership m : ms) {
                            if (m.getUserId().equals(author.getId())) continue;
                            boolean holds = m.getRoles().stream().anyMatch(r -> r.getId().equals(role.getId()));
                            if (holds) matched.put(m.getUserId(), new MentionMatch("ROLE", "@" + role.getName()));
                        }
                    }
                }
            }
        }

        if (lower.contains("@") && !memberUserIds.isEmpty()) {
            List<User> members = new ArrayList<>(users.findAllById(memberUserIds));
            members.sort((a, b) -> Integer.compare(b.getDisplayName().length(), a.getDisplayName().length()));
            for (User member : members) {
                if (member.getId().equals(author.getId())) continue;
                if (containsMentionToken(lower, member.getDisplayName().toLowerCase(Locale.ROOT))) {
                    // Direct @user mention overrides ROLE / EVERYONE priority
                    matched.put(member.getId(), new MentionMatch("USER", "@" + member.getDisplayName()));
                }
            }
        }

        List<MessageMention> savedMentions = new ArrayList<>();
        for (var entry : matched.entrySet()) {
            MessageMention mm = new MessageMention();
            mm.setMessageId(msg.getId());
            mm.setChannelId(ch.getId());
            mm.setMentionedUserId(entry.getKey());
            mm.setMentionKind(entry.getValue().kind());
            mm.setLabel(entry.getValue().label());
            mm.setCreatedAt(msg.getCreatedAt());
            savedMentions.add(mm);
        }
        if (!savedMentions.isEmpty()) {
            mentions.saveAllAndFlush(savedMentions);
        }

        // Push live notification events (mentions in channels + all DMs for other participants)
        if (!realtime.hasSubscribers()) return;
        Set<UUID> notifyTargets = new LinkedHashSet<>(matched.keySet());
        if (ch.getType() == Channel.Type.DM) {
            for (UUID uid : memberUserIds) {
                if (!uid.equals(author.getId())) notifyTargets.add(uid);
            }
        }
        if (notifyTargets.isEmpty()) return;

        Map<UUID, UserNotificationPref> prefMap = userPrefs.findAllById(notifyTargets).stream()
            .collect(Collectors.toMap(UserNotificationPref::getUserId, x -> x));
        Map<UUID, Level> chanPrefMap = channelPrefs.findByChannelId(ch.getId()).stream()
            .collect(Collectors.toMap(ChannelNotificationPref::getUserId, ChannelNotificationPref::getLevel));

        String excerpt = body.isBlank() ? "Sent an attachment" : (body.length() <= 120 ? body : body.substring(0, 120) + "…");
        for (UUID targetId : notifyTargets) {
            MentionMatch m = matched.get(targetId);
            boolean isMention = m != null;
            UserNotificationPref up = prefMap.get(targetId);
            Level lvl = chanPrefMap.getOrDefault(targetId, Level.ALL);
            boolean suppressed = isDndActive(up) || lvl == Level.MUTE || (!isMention && lvl == Level.MENTIONS)
                || (up != null && !up.isShowToasts());

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("kind", isMention ? "MENTION" : "DM");
            payload.put("messageId", msg.getId());
            payload.put("channelId", ch.getId());
            if (ch.getCommunityId() != null) payload.put("communityId", ch.getCommunityId());
            payload.put("channelName", ch.getType() == Channel.Type.DM ? author.getDisplayName() : "#" + ch.getName());
            payload.put("authorName", author.getDisplayName());
            payload.put("excerpt", excerpt);
            payload.put("label", isMention ? m.label() : "Direct message");
            payload.put("suppressed", suppressed);
            realtime.sendToUser(targetId, RealtimeEvent.of("NOTIFICATION", ch.getId(), ch.getCommunityId(), payload));
        }
    }

    @Transactional
    public void markRead(UUID userId, UUID channelId, UUID messageId) {
        Channel ch = channels.findById(channelId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Channel not found"));
        access.permissions(ch, userId);

        UUID targetId = messageId;
        Instant readAt = Instant.now();
        if (targetId != null) {
            Message msg = messages.findById(targetId)
                .filter(m -> m.getChannelId().equals(channelId))
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "Message not found in this channel"));
            if (msg.getCreatedAt().isAfter(readAt)) readAt = msg.getCreatedAt();
        } else {
            List<Message> latest = messages.latest(channelId, PageRequest.of(0, 1));
            if (!latest.isEmpty()) {
                targetId = latest.get(0).getId();
                if (latest.get(0).getCreatedAt().isAfter(readAt)) readAt = latest.get(0).getCreatedAt();
            }
        }

        upsertReadState(userId, channelId, targetId, readAt);
        realtime.sendToUser(userId, RealtimeEvent.of("READ_STATE_UPDATED", channelId, ch.getCommunityId(),
            Map.of("channelId", channelId, "lastReadMessageId", targetId == null ? "" : targetId.toString())));
    }

    @Transactional(readOnly = true)
    public List<ChannelUnreadDto> unreads(UUID userId) {
        return readStates.computeUnreads(userId).stream()
            .map(r -> new ChannelUnreadDto(r.getChannelId(), r.getCommunityId(), r.getUnreadCount(), r.getMentionCount(), r.getLastReadMessageId()))
            .toList();
    }

    @Transactional(readOnly = true)
    public List<MentionItemDto> listMentions(UUID userId, int limit) {
        int size = Math.min(Math.max(limit, 1), 100);
        List<MessageMention> rows = mentions.findByMentionedUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, size));
        if (rows.isEmpty()) return List.of();

        Set<UUID> msgIds = rows.stream().map(MessageMention::getMessageId).collect(Collectors.toSet());
        Map<UUID, Message> msgMap = messages.findAllById(msgIds).stream().collect(Collectors.toMap(Message::getId, x -> x));
        Set<UUID> chanIds = rows.stream().map(MessageMention::getChannelId).collect(Collectors.toSet());
        Map<UUID, Channel> chanMap = channels.findAllById(chanIds).stream().collect(Collectors.toMap(Channel::getId, x -> x));
        Set<UUID> commIds = chanMap.values().stream().map(Channel::getCommunityId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<UUID, Community> commMap = communities.findAllById(commIds).stream().collect(Collectors.toMap(Community::getId, x -> x));
        Set<UUID> authorIds = msgMap.values().stream().map(Message::getAuthorId).collect(Collectors.toSet());
        Map<UUID, User> authorMap = users.findAllById(authorIds).stream().collect(Collectors.toMap(User::getId, x -> x));
        Map<UUID, ChannelReadState> rsMap = readStates.findByUserId(userId).stream()
            .collect(Collectors.toMap(ChannelReadState::getChannelId, x -> x));

        List<MentionItemDto> out = new ArrayList<>();
        for (MessageMention row : rows) {
            Message m = msgMap.get(row.getMessageId());
            Channel ch = chanMap.get(row.getChannelId());
            if (m == null || ch == null || m.isDeleted()) continue;
            User a = authorMap.get(m.getAuthorId());
            Community comm = ch.getCommunityId() == null ? null : commMap.get(ch.getCommunityId());
            ChannelReadState rs = rsMap.get(ch.getId());
            boolean unread = rs == null || row.getCreatedAt().isAfter(rs.getLastReadAt());
            String body = m.getBody() == null ? "" : m.getBody();
            String excerpt = body.length() <= 140 ? body : body.substring(0, 140) + "…";
            out.add(new MentionItemDto(row.getId(), m.getId(), ch.getId(), ch.getCommunityId(),
                ch.getType() == Channel.Type.DM ? (a == null ? "Direct message" : a.getDisplayName()) : ch.getName(),
                comm == null ? null : comm.getName(),
                a == null ? "Unknown" : a.getDisplayName(),
                excerpt, row.getMentionKind(), row.getLabel(), row.getCreatedAt(), unread));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public NotificationPrefsDto getPrefs(UUID userId) {
        UserNotificationPref p = userPrefs.findById(userId).orElseGet(() -> defaultPref(userId));
        Map<UUID, Level> levels = channelPrefs.findByUserId(userId).stream()
            .collect(Collectors.toMap(ChannelNotificationPref::getChannelId, ChannelNotificationPref::getLevel));
        return new NotificationPrefsDto(p.isDndEnabled(), p.getDndStart(), p.getDndEnd(), p.isShowToasts(), isDndActive(p), levels);
    }

    @Transactional
    public NotificationPrefsDto updatePrefs(UUID userId, UpdateNotificationPrefsRequest r) {
        UserNotificationPref p = userPrefs.findById(userId).orElseGet(() -> defaultPref(userId));
        if (r.dndEnabled() != null) p.setDndEnabled(r.dndEnabled());
        if (r.dndStart() != null) p.setDndStart(r.dndStart().isBlank() ? null : r.dndStart());
        if (r.dndEnd() != null) p.setDndEnd(r.dndEnd().isBlank() ? null : r.dndEnd());
        if (r.showToasts() != null) p.setShowToasts(r.showToasts());
        p.setUpdatedAt(Instant.now());
        userPrefs.saveAndFlush(p);
        return getPrefs(userId);
    }

    @Transactional
    public NotificationPrefsDto setChannelLevel(UUID userId, UUID channelId, Level level) {
        Channel ch = channels.findById(channelId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Channel not found"));
        access.permissions(ch, userId);
        ChannelNotificationPref.Key key = new ChannelNotificationPref.Key(userId, channelId);
        if (level == Level.ALL) {
            channelPrefs.deleteById(key);
        } else {
            ChannelNotificationPref cp = channelPrefs.findById(key).orElseGet(() -> {
                ChannelNotificationPref n = new ChannelNotificationPref();
                n.setUserId(userId);
                n.setChannelId(channelId);
                return n;
            });
            cp.setLevel(level);
            channelPrefs.saveAndFlush(cp);
        }
        return getPrefs(userId);
    }

    private void upsertReadState(UUID userId, UUID channelId, UUID messageId, Instant readAt) {
        ChannelReadState rs = readStates.findByUserIdAndChannelId(userId, channelId).orElseGet(() -> {
            ChannelReadState n = new ChannelReadState();
            n.setUserId(userId);
            n.setChannelId(channelId);
            return n;
        });
        if (messageId != null) rs.setLastReadMessageId(messageId);
        rs.setLastReadAt(readAt);
        readStates.saveAndFlush(rs);
    }

    private static UserNotificationPref defaultPref(UUID userId) {
        UserNotificationPref p = new UserNotificationPref();
        p.setUserId(userId);
        p.setDndEnabled(false);
        p.setShowToasts(true);
        return p;
    }

    static boolean isDndActive(UserNotificationPref p) {
        if (p == null) return false;
        if (p.isDndEnabled()) return true;
        if (p.getDndStart() == null || p.getDndEnd() == null) return false;
        try {
            LocalTime start = LocalTime.parse(p.getDndStart());
            LocalTime end = LocalTime.parse(p.getDndEnd());
            LocalTime now = LocalTime.now(ZoneOffset.UTC);
            if (start.equals(end)) return false;
            return start.isBefore(end) ? (!now.isBefore(start) && now.isBefore(end)) : (!now.isBefore(start) || now.isBefore(end));
        } catch (Exception ex) {
            return false;
        }
    }

    private static boolean containsMentionToken(String lowerBody, String lowerName) {
        if (lowerName == null || lowerName.isBlank()) return false;
        String needle = "@" + lowerName;
        int idx = lowerBody.indexOf(needle);
        while (idx >= 0) {
            boolean leftOk = idx == 0 || !Character.isLetterOrDigit(lowerBody.charAt(idx - 1));
            int after = idx + needle.length();
            boolean rightOk = after == lowerBody.length() || !Character.isLetterOrDigit(lowerBody.charAt(after));
            if (leftOk && rightOk) return true;
            idx = lowerBody.indexOf(needle, idx + 1);
        }
        return false;
    }

    private record MentionMatch(String kind, String label) {}
}
