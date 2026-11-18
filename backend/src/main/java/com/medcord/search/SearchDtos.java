package com.medcord.search;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class SearchDtos {
    private SearchDtos() {}

    /**
     * snippet marks matches with U+E000 (start) and U+E001 (end), never HTML, so clients can highlight
     * without rendering untrusted markup.
     */
    public record Hit(UUID messageId, UUID channelId, String channelName, boolean dm, UUID communityId, String communityName,
                      UUID authorId, String authorName, String snippet, Instant createdAt, UUID threadId) {}

    public record SearchPage(List<Hit> items, int limit, int offset, boolean hasMore) {}
}
