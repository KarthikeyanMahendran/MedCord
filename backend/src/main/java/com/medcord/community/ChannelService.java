package com.medcord.community;

import com.medcord.common.ApiException;
import com.medcord.community.CommunityDtos.*;
import com.medcord.nexconn.ChannelTransport;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ChannelService {
    private final ChannelRepository channels;
    private final PermissionService perms;
    private final ChannelTransport transport;
    private final com.medcord.audit.AuditService audit;

    public ChannelService(ChannelRepository channels, PermissionService perms, ChannelTransport transport, com.medcord.audit.AuditService audit) {
        this.audit = audit;
        this.channels = channels;
        this.perms = perms;
        this.transport = transport;
    }

    @Transactional(readOnly = true)
    public List<ChannelDto> list(UUID communityId, UUID userId) {
        perms.membership(communityId, userId);
        return channels.findByCommunityIdOrderByPositionAscNameAsc(communityId).stream().map(ChannelService::dto).toList();
    }

    @Transactional
    public ChannelDto create(UUID communityId, UUID userId, CreateChannelRequest r) {
        perms.require(communityId, userId, Permission.MANAGE_CHANNELS);
        Channel created = createUnchecked(communityId, r.name(), r.topic(), r.type() == null ? Channel.Type.TEXT : r.type());
        audit.record(communityId, userId, "CHANNEL_CREATED", "CHANNEL", created.getId(), "Created channel #" + created.getName());
        return dto(created);
    }

    /** Used for default channels at community creation (permission already established). */
    Channel createUnchecked(UUID communityId, String name, String topic, Channel.Type type) {
        if (channels.existsByCommunityIdAndNameIgnoreCase(communityId, name)) {
            throw new ApiException(HttpStatus.CONFLICT, "Channel name already exists");
        }
        Channel c = new Channel();
        c.setCommunityId(communityId);
        c.setName(name);
        c.setTopic(topic);
        c.setType(type);
        c.setPosition(channels.countByCommunityId(communityId));
        c = channels.save(c);
        transport.onChannelCreated(communityId, c.getId(), c.getName());
        return c;
    }

    @Transactional
    public ChannelDto update(UUID communityId, UUID channelId, UUID userId, UpdateChannelRequest r) {
        perms.require(communityId, userId, Permission.MANAGE_CHANNELS);
        Channel c = channels.findById(channelId).filter(x -> x.getCommunityId().equals(communityId))
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Channel not found"));
        if (r.name() != null && !r.name().equalsIgnoreCase(c.getName())) {
            if (channels.existsByCommunityIdAndNameIgnoreCase(communityId, r.name())) throw new ApiException(HttpStatus.CONFLICT, "Channel name already exists");
            c.setName(r.name());
        }
        if (r.topic() != null) c.setTopic(r.topic());
        if (r.archived() != null && r.archived() != c.isArchived()) {
            c.setArchived(r.archived());
            if (r.archived()) transport.onChannelArchived(communityId, channelId);
            audit.record(communityId, userId, r.archived() ? "CHANNEL_ARCHIVED" : "CHANNEL_UNARCHIVED", "CHANNEL", channelId, (r.archived() ? "Archived" : "Unarchived") + " channel #" + c.getName());
        }
        return dto(channels.save(c));
    }

    static ChannelDto dto(Channel c) {
        return new ChannelDto(c.getId(), c.getName(), c.getTopic(), c.getType(), c.getPosition(), c.isArchived());
    }
}
