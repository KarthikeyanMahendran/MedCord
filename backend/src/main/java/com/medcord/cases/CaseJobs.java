package com.medcord.cases;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class CaseJobs {
    private static final Logger log = LoggerFactory.getLogger(CaseJobs.class);
    private final CaseService service;

    public CaseJobs(CaseService service) { this.service = service; }

    @Scheduled(initialDelay = 60_000, fixedDelay = 30_000)
    void run() {
        try {
            int e = service.escalateOverdue();
            int f = service.sendDueFollowups();
            if (e + f > 0) log.info("case jobs: escalated={} followups={}", e, f);
        } catch (RuntimeException ex) {
            log.warn("case jobs failed: {}", ex.getMessage());
        }
    }
}
