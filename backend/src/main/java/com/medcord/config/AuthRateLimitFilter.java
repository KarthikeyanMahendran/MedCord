package com.medcord.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Fixed-window limiter for credential endpoints, keyed by client address + path.
 * In-memory: correct for a single instance. For multiple instances move the counters to Redis (see docs/runbook.md).
 * The client address is the TCP peer; behind a reverse proxy configure server.forward-headers-strategy so it is the real client.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class AuthRateLimitFilter extends OncePerRequestFilter {
    private static final Duration WINDOW = Duration.ofMinutes(1);
    private static final int MAX_TRACKED_KEYS = 50_000;

    private record Counter(long windowStart, int count) {}

    private final Map<String, Counter> counters = new ConcurrentHashMap<>();
    private final int limit;

    public AuthRateLimitFilter(@Value("${medcord.security.auth-rate-limit-per-minute:30}") int limit) {
        this.limit = limit;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        String p = req.getRequestURI();
        return !(HttpMethodIsPost(req) && (p.equals("/api/v1/auth/login") || p.equals("/api/v1/auth/register") || p.equals("/api/v1/auth/refresh")));
    }

    private static boolean HttpMethodIsPost(HttpServletRequest req) { return "POST".equalsIgnoreCase(req.getMethod()); }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        long now = System.currentTimeMillis();
        if (counters.size() > MAX_TRACKED_KEYS) counters.entrySet().removeIf(e -> now - e.getValue().windowStart() > WINDOW.toMillis());
        String key = req.getRemoteAddr() + "|" + req.getRequestURI();
        Counter c = counters.merge(key, new Counter(now, 1),
            (old, fresh) -> now - old.windowStart() >= WINDOW.toMillis() ? fresh : new Counter(old.windowStart(), old.count() + 1));
        if (c.count() > limit) {
            long retry = Math.max(1, (WINDOW.toMillis() - (now - c.windowStart()) + 999) / 1000);
            res.setStatus(429);
            res.setHeader("Retry-After", Long.toString(retry));
            res.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            res.getWriter().write("{\"type\":\"about:blank\",\"title\":\"Too Many Requests\",\"status\":429,\"detail\":\"Too many attempts. Try again in " + retry + " seconds.\"}");
            return;
        }
        chain.doFilter(req, res);
    }
}
