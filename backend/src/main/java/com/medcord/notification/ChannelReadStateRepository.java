package com.medcord.notification;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ChannelReadStateRepository extends JpaRepository<ChannelReadState, ChannelReadState.Key> {
    List<ChannelReadState> findByUserId(UUID userId);
    Optional<ChannelReadState> findByUserIdAndChannelId(UUID userId, UUID channelId);

    interface UnreadRow {
        UUID getChannelId();
        UUID getCommunityId();
        UUID getLastReadMessageId();
        long getUnreadCount();
        long getMentionCount();
    }

    @Query(value = """
        WITH accessible AS (
            SELECT c.id AS channel_id, c.community_id
            FROM channels c
            JOIN memberships m ON m.community_id = c.community_id AND m.user_id = :userId
            WHERE c.type IN ('TEXT', 'ANNOUNCEMENT')
            UNION ALL
            SELECT c.id AS channel_id, NULL::uuid AS community_id
            FROM channels c
            JOIN dm_participants d ON d.channel_id = c.id AND d.user_id = :userId
            WHERE c.type = 'DM'
        )
        SELECT
            a.channel_id AS channelId,
            a.community_id AS communityId,
            rs.last_read_message_id AS lastReadMessageId,
            COUNT(msg.id) FILTER (
                WHERE msg.id IS NOT NULL
                  AND msg.deleted_at IS NULL
                  AND msg.thread_id IS NULL
                  AND msg.author_id <> :userId
                  AND (rs.last_read_at IS NULL OR msg.created_at > rs.last_read_at)
            ) AS unreadCount,
            COUNT(mn.id) FILTER (
                WHERE mn.id IS NOT NULL
                  AND (rs.last_read_at IS NULL OR mn.created_at > rs.last_read_at)
            ) AS mentionCount
        FROM accessible a
        LEFT JOIN channel_read_states rs ON rs.channel_id = a.channel_id AND rs.user_id = :userId
        LEFT JOIN messages msg ON msg.channel_id = a.channel_id
            AND msg.deleted_at IS NULL AND msg.thread_id IS NULL AND msg.author_id <> :userId
            AND (rs.last_read_at IS NULL OR msg.created_at > rs.last_read_at)
        LEFT JOIN message_mentions mn ON mn.message_id = msg.id AND mn.mentioned_user_id = :userId
        GROUP BY a.channel_id, a.community_id, rs.last_read_message_id
        """, nativeQuery = true)
    List<UnreadRow> computeUnreads(UUID userId);
}
