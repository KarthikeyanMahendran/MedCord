package com.medcord.message;

import com.medcord.common.ApiException;
import com.medcord.community.Channel;
import com.medcord.community.Permission;
import com.medcord.community.PermissionService;
import com.medcord.dm.DmParticipant;
import com.medcord.dm.DmParticipantRepository;
import com.medcord.dm.UserBlockRepository;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Single answer to "what may this user do in this channel?".
 * Community channels use role permissions; DMs allow participants to send, nothing administrative.
 */
@Service
public class ChannelAccess {
    private final PermissionService perms;
    private final DmParticipantRepository participants;
    private final UserBlockRepository blocks;

    public ChannelAccess(PermissionService perms, DmParticipantRepository participants, UserBlockRepository blocks) {
        this.perms = perms;
        this.participants = participants;
        this.blocks = blocks;
    }

    /** Throws 403 when the user cannot even see the channel. */
    public Set<Permission> permissions(Channel ch, UUID userId) {
        if (ch.getType() == Channel.Type.DM) {
            if (!participants.existsByChannelIdAndUserId(ch.getId(), userId)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "You are not part of this conversation");
            }
            return EnumSet.of(Permission.SEND_MESSAGES);
        }
        return perms.permissions(perms.membership(ch.getCommunityId(), userId));
    }

    public void require(Channel ch, UUID userId, Permission p) {
        if (!permissions(ch, userId).contains(p)) throw new ApiException(HttpStatus.FORBIDDEN, "Missing permission: " + p);
    }

    /** Extra rule for posting: in a 1:1 DM neither side may have blocked the other. */
    public void assertCanPost(Channel ch, UUID userId) {
        if (ch.getType() != Channel.Type.DM) return;
        List<DmParticipant> all = participants.findByChannelId(ch.getId());
        if (all.size() == 2) {
            UUID other = all.stream().map(DmParticipant::getUserId).filter(u -> !u.equals(userId)).findFirst().orElse(userId);
            if (blocks.eitherBlocked(userId, other)) throw new ApiException(HttpStatus.FORBIDDEN, "You can't message this user");
        }
    }
}
