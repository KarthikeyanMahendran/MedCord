package com.medcord.nexconn;

import com.medcord.common.ApiException;
import com.medcord.user.User;
import com.medcord.user.UserRepository;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/chat")
public class ChatController {
    private final NexconnGateway gateway;
    private final UserRepository users;

    public ChatController(NexconnGateway gateway, UserRepository users) {
        this.gateway = gateway;
        this.users = users;
    }

    public record ChatToken(String appKey, String userId, String token) {}

    /** Issues a Nexconn client token for the signed-in user (registers the user on first call). */
    @GetMapping("/token")
    ChatToken token(@AuthenticationPrincipal Jwt jwt) {
        UUID id = UUID.fromString(jwt.getSubject());
        User u = users.findById(id).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        if (u.getStatus() == User.Status.SUSPENDED) throw new ApiException(HttpStatus.FORBIDDEN, "Account suspended");
        String nid = NexconnGateway.toNexconnUserId(id);
        NexconnGateway.TokenResult r = gateway.issueToken(nid, u.getDisplayName(), null);
        return new ChatToken(gateway.appKey(), nid, r.accessToken());
    }
}
