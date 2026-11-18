package com.medcord.community;

import com.medcord.community.Channel.Type;
import com.medcord.community.Community.Visibility;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class CommunityDtos {
    private CommunityDtos() {}

    public record CreateCommunityRequest(
        @NotBlank @Size(min = 3, max = 100) String name, @Size(max = 1000) String description,
        @Size(max = 100) String specialtyTag, Visibility visibility) {}

    public record UpdateCommunityRequest(
        @Size(min = 3, max = 100) String name, @Size(max = 1000) String description,
        @Size(max = 100) String specialtyTag, Visibility visibility) {}

    public record CommunityDto(UUID id, String name, String slug, String description, String specialtyTag,
                               Visibility visibility, UUID ownerId, long memberCount, Set<Permission> myPermissions) {}

    public record CreateChannelRequest(
        @NotBlank @Pattern(regexp = "^[a-z0-9][a-z0-9-]{0,78}$", message = "lowercase letters, digits and dashes") String name,
        @Size(max = 500) String topic, Type type) {}

    public record UpdateChannelRequest(
        @Pattern(regexp = "^[a-z0-9][a-z0-9-]{0,78}$", message = "lowercase letters, digits and dashes") String name,
        @Size(max = 500) String topic, Boolean archived) {}

    public record ChannelDto(UUID id, String name, String topic, Type type, int position, boolean archived) {}

    public record CreateRoleRequest(@NotBlank @Size(max = 50) String name, @Min(1) @Max(1000) int position,
                                    @NotNull Set<Permission> permissions) {}

    public record UpdateRoleRequest(@Size(min = 1, max = 50) String name, Set<Permission> permissions) {}

    public record RoleDto(UUID id, String name, int position, boolean system, Set<Permission> permissions) {}

    public record AssignRolesRequest(@NotNull Set<UUID> roleIds) {}

    public record RoleRef(UUID id, String name) {}

    public record MemberDto(UUID userId, String displayName, String specialty, boolean verified,
                            List<RoleRef> roles, Instant joinedAt, boolean online) {}

    public record CreateInviteRequest(@Min(1) @Max(10000) Integer maxUses, @Min(1) @Max(8760) Integer expiresInHours) {}

    public record InviteDto(UUID id, String code, Instant expiresAt, Integer maxUses, int uses, boolean revoked) {}

    public record InvitePreview(String communityName, String description, long memberCount, boolean valid) {}

    public record BanRequest(@Size(max = 500) String reason) {}
}
