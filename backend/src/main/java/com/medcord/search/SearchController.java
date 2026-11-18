package com.medcord.search;

import com.medcord.search.SearchDtos.SearchPage;
import java.time.Instant;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/search")
public class SearchController {
    private final SearchService service;

    public SearchController(SearchService service) {
        this.service = service;
    }

    @GetMapping
    SearchPage search(@AuthenticationPrincipal Jwt jwt, @RequestParam String q,
                      @RequestParam(required = false) UUID communityId, @RequestParam(required = false) UUID channelId,
                      @RequestParam(required = false) UUID authorId,
                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
                      @RequestParam(defaultValue = "20") int limit, @RequestParam(defaultValue = "0") int offset) {
        return service.search(UUID.fromString(jwt.getSubject()), q, communityId, channelId, authorId, from, to, limit, offset);
    }
}
