package com.medcord.outbreak;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Re-checks every active region once a minute, so old clusters fade out on their own. */
@Component
public class OutbreakJobs {
    private static final Logger log = LoggerFactory.getLogger(OutbreakJobs.class);
    private final OutbreakService service;

    public OutbreakJobs(OutbreakService service) { this.service = service; }

    @Scheduled(initialDelay = 90_000, fixedDelay = 60_000)
    void run() {
        try {
            service.evaluateAll();
        } catch (RuntimeException ex) {
            log.warn("outbreak radar job failed: {}", ex.getMessage());
        }
    }
}
