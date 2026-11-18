package com.medcord.search;

import com.medcord.common.ApiException;
import com.medcord.search.SearchDtos.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SearchService {
    private static final String SEL = "StartSel=, StopSel=, MaxFragments=1, MaxWords=28, MinWords=10, ShortWord=2";
    private final NamedParameterJdbcTemplate jdbc;

    public SearchService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Only returns messages from channels the user may read; deleted messages are never returned. */
    @Transactional(readOnly = true)
    public SearchPage search(UUID me, String q, UUID communityId, UUID channelId, UUID authorId, Instant from, Instant to, int limit, int offset) {
        String query = q == null ? "" : q.trim();
        if (query.length() < 2) throw new ApiException(HttpStatus.BAD_REQUEST, "Enter at least 2 characters");
        if (query.length() > 200) throw new ApiException(HttpStatus.BAD_REQUEST, "Query is too long");
        int size = Math.min(Math.max(limit, 1), 50);
        int skip = Math.max(offset, 0);

        MapSqlParameterSource p = new MapSqlParameterSource().addValue("q", query).addValue("me", me)
            .addValue("limit", size + 1).addValue("offset", skip);
        StringBuilder sql = new StringBuilder("""
            select m.id, m.channel_id, c.name as channel_name, (c.type = 'DM') as dm, c.community_id, co.name as community_name,
                   m.author_id, u.display_name as author_name, m.created_at, m.thread_id,
                   ts_headline('simple', m.body, tq, '""" + SEL + """
            ') as snippet
            from messages m
            join channels c on c.id = m.channel_id
            join users u on u.id = m.author_id
            left join communities co on co.id = c.community_id
            cross join websearch_to_tsquery('simple', :q) tq
            where to_tsvector('simple', m.body) @@ tq
              and m.deleted_at is null
              and (c.community_id in (select community_id from memberships where user_id = :me)
                   or (c.type = 'DM' and exists (select 1 from dm_participants dp where dp.channel_id = c.id and dp.user_id = :me)))
            """);
        if (communityId != null) { sql.append(" and c.community_id = :cid"); p.addValue("cid", communityId); }
        if (channelId != null) { sql.append(" and m.channel_id = :ch"); p.addValue("ch", channelId); }
        if (authorId != null) { sql.append(" and m.author_id = :aid"); p.addValue("aid", authorId); }
        if (from != null) { sql.append(" and m.created_at >= :from"); p.addValue("from", Timestamp.from(from)); }
        if (to != null) { sql.append(" and m.created_at < :to"); p.addValue("to", Timestamp.from(to)); }
        sql.append(" order by ts_rank(to_tsvector('simple', m.body), tq) desc, m.created_at desc, m.id desc limit :limit offset :offset");

        List<Hit> rows = jdbc.query(sql.toString(), p, (rs, i) -> new Hit(
            rs.getObject("id", UUID.class), rs.getObject("channel_id", UUID.class), rs.getString("channel_name"), rs.getBoolean("dm"),
            rs.getObject("community_id", UUID.class), rs.getString("community_name"), rs.getObject("author_id", UUID.class),
            rs.getString("author_name"), rs.getString("snippet"), rs.getTimestamp("created_at").toInstant(), rs.getObject("thread_id", UUID.class)));
        boolean hasMore = rows.size() > size;
        return new SearchPage(hasMore ? rows.subList(0, size) : rows, size, skip, hasMore);
    }
}
