package com.medcord.nexconn;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

/** Default transport until Nexconn is wired in (T-010). Logs only. */
@Component
@ConditionalOnMissingBean(value = ChannelTransport.class, ignored = NoopChannelTransport.class)
public class NoopChannelTransport implements ChannelTransport {
    private static final Logger log = LoggerFactory.getLogger(NoopChannelTransport.class);

    @Override public void onChannelCreated(UUID c, UUID ch, String name) { log.debug("channel created {} in {}", ch, c); }
    @Override public void onChannelArchived(UUID c, UUID ch) { log.debug("channel archived {} in {}", ch, c); }
    @Override public void onMemberJoined(UUID c, UUID u) { log.debug("member {} joined {}", u, c); }
    @Override public void onMemberLeft(UUID c, UUID u) { log.debug("member {} left {}", u, c); }
    @Override public void onCommunityDeleted(UUID c) { log.debug("community deleted {}", c); }
    @Override public void onMessageSent(UUID c, UUID ch, UUID m) { log.debug("message sent {} in {}", m, ch); }
    @Override public void onMessageEdited(UUID c, UUID ch, UUID m) { log.debug("message edited {} in {}", m, ch); }
    @Override public void onMessageDeleted(UUID c, UUID ch, UUID m) { log.debug("message deleted {} in {}", m, ch); }
}
