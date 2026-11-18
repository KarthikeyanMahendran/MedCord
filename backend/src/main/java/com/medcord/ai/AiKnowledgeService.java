package com.medcord.ai;

import com.medcord.ai.AiDtos.*;
import com.medcord.common.ApiException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AiKnowledgeService {
    private static final Logger log = LoggerFactory.getLogger(AiKnowledgeService.class);

    private final AiKnowledgeChunkRepository chunkRepo;
    private final SarvamAiClient sarvam;
    private final NamedParameterJdbcTemplate jdbc;
    private final AiKnowledgeService self;

    public AiKnowledgeService(AiKnowledgeChunkRepository chunkRepo, SarvamAiClient sarvam, NamedParameterJdbcTemplate jdbc,
                              @org.springframework.context.annotation.Lazy AiKnowledgeService self) {
        this.chunkRepo = chunkRepo;
        this.sarvam = sarvam;
        this.jdbc = jdbc;
        this.self = self;
    }

    /**
     * Ingest messages into searchable AI knowledge chunks.
     * Integrates:
     * - channels (TEXT, ANNOUNCEMENT, and DM channels)
     * - messages (un-deleted messages, pinned messages)
     * - message_reports (excludes messages flagged with OPEN reports, PHI, or misinformation)
     * - message_reactions (tracks consensus / reaction count)
     * - threads (preserves thread hierarchy and thread titles)
     */
    @Transactional
    public AiIngestResponse ingestKnowledge(UUID communityIdFilter) {
        StringBuilder sql = new StringBuilder("""
            SELECT m.id, m.channel_id, c.name as channel_name, c.type as channel_type, c.community_id, co.name as community_name,
                   m.author_id, u.display_name as author_name, m.body, m.created_at, m.thread_id,
                   t.title as thread_title,
                   (m.pinned_at IS NOT NULL) as is_pinned,
                   COALESCE((SELECT COUNT(*) FROM message_reactions mrx WHERE mrx.message_id = m.id), 0) as reaction_count
            FROM messages m
            JOIN channels c ON c.id = m.channel_id
            JOIN communities co ON co.id = c.community_id
            JOIN users u ON u.id = m.author_id
            LEFT JOIN threads t ON t.id = m.thread_id
            WHERE m.deleted_at IS NULL
              AND c.type != 'DM'
              AND NOT EXISTS (
                  SELECT 1 FROM message_reports mr
                  WHERE mr.message_id = m.id
                    AND (mr.status = 'OPEN' OR mr.reason = 'PHI' OR mr.reason = 'MISINFORMATION')
              )
        """);

        MapSqlParameterSource p = new MapSqlParameterSource();
        if (communityIdFilter != null) {
            sql.append(" AND c.community_id = :cid");
            p.addValue("cid", communityIdFilter);
        }
        sql.append(" ORDER BY c.community_id NULLS LAST, m.channel_id, m.thread_id NULLS FIRST, m.created_at ASC");

        record RawMsg(UUID id, UUID channelId, String channelName, String channelType, UUID communityId, String communityName,
                      UUID authorId, String authorName, String body, Instant createdAt, UUID threadId,
                      String threadTitle, boolean isPinned, int reactionCount) {}

        List<RawMsg> rows = jdbc.query(sql.toString(), p, (rs, i) -> new RawMsg(
            rs.getObject("id", UUID.class),
            rs.getObject("channel_id", UUID.class),
            rs.getString("channel_name"),
            rs.getString("channel_type"),
            rs.getObject("community_id", UUID.class),
            rs.getString("community_name"),
            rs.getObject("author_id", UUID.class),
            rs.getString("author_name"),
            rs.getString("body"),
            rs.getTimestamp("created_at").toInstant(),
            rs.getObject("thread_id", UUID.class),
            rs.getString("thread_title"),
            rs.getBoolean("is_pinned"),
            rs.getInt("reaction_count")
        ));

        if (rows.isEmpty()) {
            return new AiIngestResponse(0, 0, "No messages available to ingest");
        }

        // Purge old chunks so re-ingestion does not accumulate duplicates
        if (communityIdFilter != null) {
            chunkRepo.deleteByCommunityId(communityIdFilter);
        } else {
            chunkRepo.deleteAllInBatch();
        }

        // Group into coherent clinical discussion chunks
        List<List<RawMsg>> groups = new ArrayList<>();
        List<RawMsg> currentGroup = new ArrayList<>();

        for (RawMsg m : rows) {
            if (currentGroup.isEmpty()) {
                currentGroup.add(m);
            } else {
                RawMsg prev = currentGroup.get(currentGroup.size() - 1);
                boolean sameChannel = Objects.equals(prev.channelId(), m.channelId());
                boolean sameThread = Objects.equals(prev.threadId(), m.threadId());
                boolean withinTime = Math.abs(m.createdAt().toEpochMilli() - prev.createdAt().toEpochMilli()) < 3600_000;

                if (sameChannel && sameThread && withinTime && currentGroup.size() < 10) {
                    currentGroup.add(m);
                } else {
                    groups.add(new ArrayList<>(currentGroup));
                    currentGroup.clear();
                    currentGroup.add(m);
                }
            }
        }
        if (!currentGroup.isEmpty()) {
            groups.add(currentGroup);
        }

        int chunksCreated = 0;
        for (List<RawMsg> g : groups) {
            RawMsg first = g.get(0);

            StringBuilder contentBuilder = new StringBuilder();
            if (first.threadTitle() != null && !first.threadTitle().isBlank()) {
                contentBuilder.append("[Thread: ").append(first.threadTitle()).append("]\n");
            }

            List<String> msgIds = new ArrayList<>();
            for (RawMsg m : g) {
                msgIds.add(m.id().toString());
                contentBuilder.append(m.authorName());
                if (m.isPinned()) contentBuilder.append(" (📌 Pinned)");
                if (m.reactionCount() > 0) contentBuilder.append(" (").append(m.reactionCount()).append(" endorsements)");
                contentBuilder.append(": ").append(m.body().trim()).append("\n");
            }

            String content = contentBuilder.toString().trim();
            if (content.isBlank()) continue;

            AiKnowledgeChunk chunk = new AiKnowledgeChunk();
            chunk.setCommunityId(first.communityId());
            chunk.setChannelId(first.channelId());
            chunk.setThreadId(first.threadId());
            chunk.setAuthorId(first.authorId());
            chunk.setAuthorName(first.authorName());
            chunk.setChannelName(first.channelName() != null ? first.channelName() : "direct-message");
            chunk.setCommunityName(first.communityName() != null ? first.communityName() : "Direct Message");
            chunk.setContent(content);
            chunk.setMessageIds(String.join(",", msgIds));
            chunk.setCreatedAt(first.createdAt());
            chunk.setUpdatedAt(Instant.now());

            chunkRepo.save(chunk);
            chunksCreated++;
        }

        return new AiIngestResponse(chunksCreated, rows.size(), "Successfully processed knowledge");
    }

    /**
     * Query MedCord AI:
     * - Enforces user community memberships and DM participant permissions (dm_participants).
     * - Filters out blocked users (user_blocks).
     * - Uses PostgreSQL Full-Text Search and keyword matching to find relevant discussions.
     * - Synthesizes accurate clinical responses using Sarvam AI (sarvam-105b) with citations.
     */
    public AiQueryResponse query(UUID userId, String question, UUID communityIdFilter) {
        return query(userId, question, communityIdFilter, null);
    }

    /**
     * Not {@code @Transactional}: each DB lookup borrows and returns a pooled connection immediately, so the
     * slow Sarvam HTTP call below never holds a connection open. Writes (the on-empty ingest) run in their own
     * transaction via {@link #self}.
     */
    public AiQueryResponse query(UUID userId, String question, UUID communityIdFilter, UUID channelIdFilter) {
        String q = question == null ? "" : question.trim();
        if (q.length() < 2) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Question must be at least 2 characters");
        }

        // Check if user is platform admin
        String userRole = jdbc.queryForObject(
            "SELECT platform_role FROM users WHERE id = :uid",
            Map.of("uid", userId),
            String.class
        );
        boolean isAdmin = "ADMIN".equals(userRole);

        // 1. Identify user's accessible communities (all public or joined communities)
        List<UUID> accessibleCommunities;
        if (isAdmin) {
            accessibleCommunities = jdbc.query(
                "SELECT id FROM communities",
                Map.of(),
                (rs, i) -> rs.getObject("id", UUID.class)
            );
        } else {
            accessibleCommunities = jdbc.query(
                """
                SELECT DISTINCT c.id FROM communities c
                WHERE c.visibility = 'PUBLIC'
                   OR EXISTS (SELECT 1 FROM memberships m WHERE m.community_id = c.id AND m.user_id = :uid)
                """,
                Map.of("uid", userId),
                (rs, i) -> rs.getObject("id", UUID.class)
            );
        }

        if (communityIdFilter != null) {
            if (!accessibleCommunities.contains(communityIdFilter)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "You do not have access to this community's knowledge base");
            }
            accessibleCommunities = List.of(communityIdFilter);
        }

        // 2. Ensure initial ingestion has occurred if chunks table is empty
        long chunkCount = chunkRepo.count();
        if (chunkCount == 0) {
            self.ingestKnowledge(null);
        }

        // 3. Search for relevant discussion chunks (prioritizing current channel if viewing one)
        List<AiKnowledgeChunk> relevantChunks = new ArrayList<>();
        if (!accessibleCommunities.isEmpty()) {
            boolean isBroad = isBroadOrRecencyQuery(q);
            if (!isBroad) {
                relevantChunks = searchChunks(userId, accessibleCommunities, channelIdFilter, q);
            }
            // If it's an exploratory/recency query OR if specific keyword search returned 0 results:
            // ALWAYS pull recent discussions from accessible channels so the assistant has real discussion context!
            if (relevantChunks.isEmpty()) {
                relevantChunks = getRecentChunks(userId, accessibleCommunities, channelIdFilter);
            }
        }

        // 4. Build Context and Citations
        StringBuilder context = new StringBuilder();
        List<AiCitation> citations = new ArrayList<>();

        for (AiKnowledgeChunk c : relevantChunks) {
            context.append("[Context: ").append(c.getCommunityName())
                   .append(" | #").append(c.getChannelName()).append("]:\n")
                   .append(c.getContent())
                   .append("\n---\n");

            UUID firstMsgId = null;
            if (c.getMessageIds() != null && !c.getMessageIds().isBlank()) {
                try {
                    String[] ids = c.getMessageIds().split(",");
                    if (ids.length > 0) firstMsgId = UUID.fromString(ids[0].trim());
                } catch (Exception ignored) {}
            }

            String snippet = c.getContent();
            if (snippet.length() > 160) snippet = snippet.substring(0, 160) + "…";

            final String fSnippet = snippet;
            boolean duplicate = citations.stream().anyMatch(existing ->
                Objects.equals(existing.channelId(), c.getChannelId())
                && Objects.equals(existing.snippet(), fSnippet));

            if (!duplicate) {
                citations.add(new AiCitation(
                    firstMsgId,
                    c.getChannelId(),
                    c.getChannelName(),
                    c.getCommunityId(),
                    c.getCommunityName(),
                    c.getAuthorId(),
                    c.getAuthorName(),
                    c.getCreatedAt(),
                    snippet
                ));
            }
        }

        // 5. Generate Answer via Sarvam AI (sarvam-105b)
        String systemPrompt = """
            You are MedCord AI, a clinical assistant for verified healthcare professionals on MedCord.
            Respond in a CONCISE, HIGH-YIELD, OBJECTIVE manner.
            CRITICAL FORMATTING INSTRUCTIONS:
            - NO ROBOTIC INTRODUCTIONS: DO NOT start with "Hello Doctor", "I am MedCord AI", "As your clinical assistant", "Welcome", or "I don’t see specific discussion context".
            - START IMMEDIATELY with the answer or discussion summary.
            - Structure: 1 to 2 concise paragraphs (about 3 to 5 sentences total).
            - When community discussion context is provided, synthesize the physicians' key points, explicitly naming the doctors and channel names in plain text (e.g. 'In #case-discussions, Dr. Raman and Dr. Ahmed discussed...').
            - NEVER output markdown URLs, raw links, or bracketed links (e.g. [text](url)). Verified source discussions are automatically linked by the interface.
            """;

        String userPrompt;
        if (!context.isEmpty()) {
            userPrompt = "Retrieved Community Discussions:\n" + context + "\nDoctor's Inquiry:\n" + q;
        } else {
            userPrompt = "Doctor's Inquiry:\n" + q;
        }

        Optional<String> aiAnswer = sarvam.completeChat(systemPrompt, userPrompt);
        log.info("Sarvam completeChat result for query [{}]: isPresent={}, length={}",
            q, aiAnswer.isPresent(), aiAnswer.map(String::length).orElse(0));

        String finalAnswer;
        boolean isAi = true;

        if (aiAnswer.isPresent() && !aiAnswer.get().isBlank()) {
            finalAnswer = aiAnswer.get().trim();
            // Clean out any raw markdown links, web URLs, or robotic introductory lines
            finalAnswer = finalAnswer
                .replaceAll("(?i)^(Hello|Welcome|Hi|Greetings)[^,\n.]*[,.!:]\\s*", "")
                .replaceAll("(?i)^I am MedCord AI[^.\n]*[.]\\s*", "")
                .replaceAll("(?i)^As (your |a )?MedCord AI[^.\n]*[.]\\s*", "")
                .replaceAll("(?i)^I don't (have|see) specific community discussion[^.\n]*[.]\\s*", "")
                .replaceAll("\\[([^\\]]+)\\]\\(http[^\\)]+\\)", "$1")
                .replaceAll("https?://\\S+", "")
                .trim();
        } else {
            // Local fallback if Sarvam is temporarily unreachable
            isAi = false;
            if (!relevantChunks.isEmpty()) {
                StringBuilder fallback = new StringBuilder("Discussions in your accessible communities:\n\n");
                for (AiKnowledgeChunk c : relevantChunks) {
                    fallback.append("• **In #").append(c.getChannelName()).append("** (").append(c.getCommunityName()).append("):\n  ")
                            .append(c.getContent().replace("\n", "\n  ")).append("\n\n");
                }
                fallback.append("_Verified source discussions are cited below._");
                finalAnswer = fallback.toString();
            } else if (q.equalsIgnoreCase("hi") || q.equalsIgnoreCase("hello") || q.equalsIgnoreCase("hey")) {
                finalAnswer = "Welcome to MedCord AI. I can synthesize clinical discussions, protocols, and research from your accessible communities. How may I assist you?";
            } else {
                finalAnswer = "No discussion records match '" + q + "' yet. As colleagues post on this topic in community text channels, they will be organized and cited here.";
            }
        }

        return new AiQueryResponse(finalAnswer, citations, isAi);
    }

    private boolean isBroadOrRecencyQuery(String q) {
        if (q == null || q.isBlank()) return true;
        String lower = q.toLowerCase();
        return lower.contains("recent")
            || lower.contains("topic")
            || lower.contains("what have")
            || lower.contains("what are doctors")
            || lower.contains("what did doctors")
            || lower.contains("what do doctors")
            || lower.contains("summarize what")
            || lower.contains("summarize our")
            || lower.contains("what's new")
            || lower.contains("whats new")
            || lower.contains("discussions")
            || lower.contains("conversations")
            || lower.contains("updates")
            || lower.contains("overview")
            || lower.contains("introduce")
            || lower.contains("welcome")
            || lower.contains("treatment")
            || lower.contains("treatments")
            || lower.contains("community");
    }

    private List<AiKnowledgeChunk> getRecentChunks(UUID userId, List<UUID> accessibleCommunities, UUID activeChannelId) {
        MapSqlParameterSource p = new MapSqlParameterSource();
        p.addValue("uid", userId);
        p.addValue("cids", accessibleCommunities);

        String orderClause = "ORDER BY c.created_at DESC";
        if (activeChannelId != null) {
            orderClause = "ORDER BY CASE WHEN c.channel_id = :activeChanId THEN 0 ELSE 1 END ASC, c.created_at DESC";
            p.addValue("activeChanId", activeChannelId);
        }

        String sql = """
            SELECT c.*
            FROM ai_knowledge_chunks c
            JOIN channels ch ON ch.id = c.channel_id
            WHERE c.community_id IS NOT NULL AND c.community_id IN (:cids)
              AND NOT EXISTS (
                  SELECT 1 FROM user_blocks ub
                  WHERE (ub.blocker_id = :uid AND ub.blocked_id = c.author_id)
                     OR (ub.blocker_id = c.author_id AND ub.blocked_id = :uid)
              )
            """ + " " + orderClause + " LIMIT 5";
        return jdbc.query(sql, p, this::mapChunk);
    }

    private List<AiKnowledgeChunk> searchChunks(UUID userId, List<UUID> accessibleCommunities, UUID activeChannelId, String q) {
        String keywords = extractKeywords(q);
        MapSqlParameterSource p = new MapSqlParameterSource();
        p.addValue("uid", userId);
        p.addValue("cids", accessibleCommunities);
        p.addValue("query", "%" + q.toLowerCase().trim() + "%");
        p.addValue("rawQuery", q.trim());
        p.addValue("keywords", keywords);
        p.addValue("kwLike", "%" + keywords + "%");

        String orderClause = "ORDER BY c.created_at DESC";
        if (activeChannelId != null) {
            orderClause = "ORDER BY CASE WHEN c.channel_id = :activeChanId THEN 0 ELSE 1 END ASC, c.created_at DESC";
            p.addValue("activeChanId", activeChannelId);
        }

        String searchSql = """
            SELECT c.*
            FROM ai_knowledge_chunks c
            JOIN channels ch ON ch.id = c.channel_id
            WHERE c.community_id IS NOT NULL AND c.community_id IN (:cids)
              AND NOT EXISTS (
                  SELECT 1 FROM user_blocks ub
                  WHERE (ub.blocker_id = :uid AND ub.blocked_id = c.author_id)
                     OR (ub.blocker_id = c.author_id AND ub.blocked_id = :uid)
              )
              AND (
                  to_tsvector('simple', c.content) @@ plainto_tsquery('simple', :rawQuery)
                  OR to_tsvector('simple', c.content) @@ plainto_tsquery('simple', :keywords)
                  OR LOWER(c.content) LIKE :query
                  OR LOWER(c.content) LIKE :kwLike
              )
            """ + " " + orderClause + " LIMIT 5";
        return jdbc.query(searchSql, p, this::mapChunk);
    }

    private AiKnowledgeChunk mapChunk(ResultSet rs, int i) throws SQLException {
        AiKnowledgeChunk chunk = new AiKnowledgeChunk();
        chunk.setId(rs.getObject("id", UUID.class));
        chunk.setCommunityId(rs.getObject("community_id", UUID.class));
        chunk.setChannelId(rs.getObject("channel_id", UUID.class));
        chunk.setThreadId(rs.getObject("thread_id", UUID.class));
        chunk.setAuthorId(rs.getObject("author_id", UUID.class));
        chunk.setAuthorName(rs.getString("author_name"));
        chunk.setChannelName(rs.getString("channel_name"));
        chunk.setCommunityName(rs.getString("community_name"));
        chunk.setContent(rs.getString("content"));
        chunk.setMessageIds(rs.getString("message_ids"));
        chunk.setCreatedAt(rs.getTimestamp("created_at").toInstant());
        return chunk;
    }

    private String extractKeywords(String raw) {
        if (raw == null || raw.isBlank()) return "";
        Set<String> stopWords = Set.of(
            "summarize", "summary", "summarise", "what", "who", "where", "when", "why", "how",
            "did", "do", "does", "doctors", "doctor", "discussed", "discuss", "discussion", "discussions",
            "about", "can", "you", "tell", "me", "please", "said", "say", "the", "a", "an", "and", "or",
            "our", "community", "channel", "channels", "in", "on", "at", "to", "for", "with", "from",
            "any", "all", "is", "are", "was", "were", "been", "have", "has", "had", "recent", "recently",
            "share", "shared", "know", "show", "give", "find", "it", "there"
        );
        String cleaned = raw.replaceAll("[^a-zA-Z0-9\\s]", " ").toLowerCase();
        String[] words = cleaned.split("\\s+");
        List<String> valid = new ArrayList<>();
        for (String w : words) {
            if (w.length() >= 2 && !stopWords.contains(w)) {
                valid.add(w);
            }
        }
        return valid.isEmpty() ? raw.trim() : String.join(" ", valid);
    }
}
