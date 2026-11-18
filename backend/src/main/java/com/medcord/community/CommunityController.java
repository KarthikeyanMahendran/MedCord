package com.medcord.community;

import com.medcord.community.CommunityDtos.*;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class CommunityController {
    private final CommunityService service;
    private final ChannelService channels;
    private final RoleService roles;

    public CommunityController(CommunityService service, ChannelService channels, RoleService roles) {
        this.service = service; this.channels = channels; this.roles = roles;
    }

    private static UUID me(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    // communities
    @PostMapping("/communities") @ResponseStatus(HttpStatus.CREATED)
    CommunityDto create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateCommunityRequest r) { return service.create(me(jwt), r); }

    @GetMapping("/communities")
    List<CommunityDto> mine(@AuthenticationPrincipal Jwt jwt) { return service.mine(me(jwt)); }

    @GetMapping("/communities/discover")
    List<CommunityDto> discover(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) String q) { return service.discover(q, me(jwt)); }

    @GetMapping("/communities/{id}")
    CommunityDto get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.get(id, me(jwt)); }

    @PatchMapping("/communities/{id}")
    CommunityDto update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody UpdateCommunityRequest r) { return service.update(id, me(jwt), r); }

    @DeleteMapping("/communities/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { service.delete(id, me(jwt)); }

    // membership
    @PostMapping("/communities/{id}/join")
    CommunityDto join(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.joinPublic(id, me(jwt)); }

    @DeleteMapping("/communities/{id}/members/me") @ResponseStatus(HttpStatus.NO_CONTENT)
    void leave(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { service.leave(id, me(jwt)); }

    @GetMapping("/communities/{id}/members")
    List<MemberDto> members(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.members(id, me(jwt)); }

    @DeleteMapping("/communities/{id}/members/{userId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void kick(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID userId) { service.kick(id, me(jwt), userId); }

    @PutMapping("/communities/{id}/members/{userId}/ban") @ResponseStatus(HttpStatus.NO_CONTENT)
    void ban(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID userId, @Valid @RequestBody(required = false) BanRequest r) {
        service.ban(id, me(jwt), userId, r == null ? null : r.reason());
    }

    @DeleteMapping("/communities/{id}/members/{userId}/ban") @ResponseStatus(HttpStatus.NO_CONTENT)
    void unban(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID userId) { service.unban(id, me(jwt), userId); }

    @PutMapping("/communities/{id}/members/{userId}/roles")
    List<RoleRef> assignRoles(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID userId, @Valid @RequestBody AssignRolesRequest r) {
        return roles.assign(id, me(jwt), userId, r.roleIds());
    }

    // channels
    @GetMapping("/communities/{id}/channels")
    List<ChannelDto> channels(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return channels.list(id, me(jwt)); }

    @PostMapping("/communities/{id}/channels") @ResponseStatus(HttpStatus.CREATED)
    ChannelDto createChannel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody CreateChannelRequest r) { return channels.create(id, me(jwt), r); }

    @PatchMapping("/communities/{id}/channels/{channelId}")
    ChannelDto updateChannel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID channelId, @Valid @RequestBody UpdateChannelRequest r) {
        return channels.update(id, channelId, me(jwt), r);
    }

    // roles
    @GetMapping("/communities/{id}/roles")
    List<RoleDto> roles(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return roles.list(id, me(jwt)); }

    @PostMapping("/communities/{id}/roles") @ResponseStatus(HttpStatus.CREATED)
    RoleDto createRole(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody CreateRoleRequest r) { return roles.create(id, me(jwt), r); }

    @PatchMapping("/communities/{id}/roles/{roleId}")
    RoleDto updateRole(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID roleId, @Valid @RequestBody UpdateRoleRequest r) { return roles.update(id, roleId, me(jwt), r); }

    @DeleteMapping("/communities/{id}/roles/{roleId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteRole(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID roleId) { roles.delete(id, roleId, me(jwt)); }

    // invites
    @PostMapping("/communities/{id}/invites") @ResponseStatus(HttpStatus.CREATED)
    InviteDto createInvite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody(required = false) CreateInviteRequest r) {
        return service.createInvite(id, me(jwt), r == null ? new CreateInviteRequest(null, null) : r);
    }

    @GetMapping("/communities/{id}/invites")
    List<InviteDto> invites(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return service.listInvites(id, me(jwt)); }

    @DeleteMapping("/communities/{id}/invites/{inviteId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void revokeInvite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID inviteId) { service.revokeInvite(id, me(jwt), inviteId); }

    @GetMapping("/invites/{code}")
    InvitePreview preview(@PathVariable String code) { return service.preview(code); }

    @PostMapping("/invites/{code}/join")
    CommunityDto joinByInvite(@AuthenticationPrincipal Jwt jwt, @PathVariable String code) { return service.joinByInvite(code, me(jwt)); }
}
