package com.medcord.message;

import com.medcord.common.ApiException;
import com.medcord.community.*;
import com.medcord.message.MessageDtos.*;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BookmarkService {
    private final MessageBookmarkRepository bookmarks;
    private final MessageRepository messages;
    private final ChannelRepository channels;
    private final CommunityRepository communities;
    private final ChannelAccess access;
    private final MessageService messageService;

    public BookmarkService(MessageBookmarkRepository bookmarks, MessageRepository messages, ChannelRepository channels,
                           CommunityRepository communities, ChannelAccess access, MessageService messageService) {
        this.bookmarks = bookmarks;
        this.messages = messages;
        this.channels = channels;
        this.communities = communities;
        this.access = access;
        this.messageService = messageService;
    }

    @Transactional
    public MessageDto save(UUID messageId, UUID userId, String note) {
        Message m = messages.findById(messageId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Message not found"));
        Channel ch = channels.findById(m.getChannelId()).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Channel not found"));
        access.permissions(ch, userId);
        if (m.isDeleted()) throw new ApiException(HttpStatus.CONFLICT, "Cannot bookmark a deleted message");

        MessageBookmark.Key key = new MessageBookmark.Key(userId, messageId);
        MessageBookmark bm = bookmarks.findById(key).orElseGet(() -> {
            MessageBookmark n = new MessageBookmark();
            n.setUserId(userId);
            n.setMessageId(messageId);
            return n;
        });
        if (note != null) bm.setNote(note.isBlank() ? null : note.trim());
        bookmarks.saveAndFlush(bm);
        return messageService.dto(m, userId);
    }

    @Transactional
    public MessageDto remove(UUID messageId, UUID userId) {
        Message m = messages.findById(messageId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Message not found"));
        Channel ch = channels.findById(m.getChannelId()).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Channel not found"));
        access.permissions(ch, userId);
        bookmarks.deleteById(new MessageBookmark.Key(userId, messageId));
        bookmarks.flush();
        return messageService.dto(m, userId);
    }

    @Transactional(readOnly = true)
    public List<BookmarkDto> list(UUID userId) {
        List<MessageBookmark> rows = bookmarks.findByUserIdOrderByCreatedAtDesc(userId);
        if (rows.isEmpty()) return List.of();

        List<UUID> msgIds = rows.stream().map(MessageBookmark::getMessageId).toList();
        Map<UUID, Message> msgMap = messages.findAllById(msgIds).stream().collect(Collectors.toMap(Message::getId, x -> x));
        Set<UUID> chanIds = msgMap.values().stream().map(Message::getChannelId).collect(Collectors.toSet());
        Map<UUID, Channel> chanMap = channels.findAllById(chanIds).stream().collect(Collectors.toMap(Channel::getId, x -> x));
        Set<UUID> commIds = chanMap.values().stream().map(Channel::getCommunityId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<UUID, Community> commMap = communities.findAllById(commIds).stream().collect(Collectors.toMap(Community::getId, x -> x));

        // Filter out channels the viewer no longer has access to and deleted messages
        List<MessageBookmark> visible = new ArrayList<>();
        List<Message> visibleMsgs = new ArrayList<>();
        Set<UUID> allowedChannels = new HashSet<>();
        Set<UUID> deniedChannels = new HashSet<>();

        for (MessageBookmark bm : rows) {
            Message m = msgMap.get(bm.getMessageId());
            if (m == null || m.isDeleted()) continue;
            Channel ch = chanMap.get(m.getChannelId());
            if (ch == null || deniedChannels.contains(ch.getId())) continue;
            if (!allowedChannels.contains(ch.getId())) {
                try {
                    access.permissions(ch, userId);
                    allowedChannels.add(ch.getId());
                } catch (ApiException ex) {
                    deniedChannels.add(ch.getId());
                    continue;
                }
            }
            visible.add(bm);
            visibleMsgs.add(m);
        }

        Map<UUID, MessageDto> dtoMap = messageService.toDtos(visibleMsgs, userId).stream()
            .collect(Collectors.toMap(MessageDto::id, x -> x));

        List<BookmarkDto> out = new ArrayList<>();
        for (MessageBookmark bm : visible) {
            MessageDto md = dtoMap.get(bm.getMessageId());
            if (md == null) continue;
            Channel ch = chanMap.get(md.channelId());
            Community comm = ch.getCommunityId() == null ? null : commMap.get(ch.getCommunityId());
            out.add(new BookmarkDto(md.id(), ch.getId(), ch.getCommunityId(),
                ch.getType() == Channel.Type.DM ? "Direct message" : ch.getName(),
                comm == null ? null : comm.getName(),
                bm.getNote(), bm.getCreatedAt(), md));
        }
        return out;
    }
}
