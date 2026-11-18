package com.medcord.community;

import static com.medcord.community.Permission.*;

import com.medcord.common.ApiException;
import com.medcord.community.CommunityDtos.*;

import java.util.*;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RoleService {
    private final RoleRepository roles;
    private final MembershipRepository memberships;
    private final PermissionService perms;

    public RoleService(RoleRepository roles, MembershipRepository memberships, PermissionService perms) {
        this.roles = roles;
        this.memberships = memberships;
        this.perms = perms;
    }

    /** Creates OWNER/ADMIN/MODERATOR/MEMBER for a new community and returns them by system key. */
    @Transactional
    public Map<String, Role> seedDefaults(UUID communityId) {
        Map<String, Role> out = new LinkedHashMap<>();
        out.put("OWNER", mk(communityId, "Owner", 0, "OWNER", EnumSet.allOf(Permission.class)));
        out.put("ADMIN", mk(communityId, "Admin", 1, "ADMIN", EnumSet.allOf(Permission.class)));
        out.put("MODERATOR", mk(communityId, "Moderator", 2, "MODERATOR",
            EnumSet.of(MODERATE_MESSAGES, MANAGE_MEMBERS, SEND_MESSAGES, CREATE_INVITE)));
        out.put("MEMBER", mk(communityId, "Member", 3, "MEMBER", EnumSet.of(SEND_MESSAGES)));
        return out;
    }

    private Role mk(UUID communityId, String name, int pos, String key, Set<Permission> p) {
        Role r = new Role();
        r.setCommunityId(communityId);
        r.setName(name);
        r.setPosition(pos);
        r.setSystemKey(key);
        r.getPermissions().addAll(p);
        return roles.save(r);
    }

    @Transactional(readOnly = true)
    public List<RoleDto> list(UUID communityId, UUID actorId) {
        perms.membership(communityId, actorId);
        return roles.findByCommunityIdOrderByPositionAsc(communityId).stream().map(RoleService::dto).toList();
    }

    @Transactional
    public RoleDto create(UUID communityId, UUID actorId, CreateRoleRequest r) {
        Membership actor = perms.require(communityId, actorId, MANAGE_ROLES);
        if (r.position() <= actor.topPosition()) throw new ApiException(HttpStatus.FORBIDDEN, "Cannot create a role at or above your own rank");
        if (roles.existsByCommunityIdAndNameIgnoreCase(communityId, r.name().trim())) throw new ApiException(HttpStatus.CONFLICT, "Role name already exists");
        requireHeld(actor, r.permissions());
        return dto(mk(communityId, r.name().trim(), r.position(), null, r.permissions()));
    }

    @Transactional
    public RoleDto update(UUID communityId, UUID roleId, UUID actorId, UpdateRoleRequest r) {
        Membership actor = perms.require(communityId, actorId, MANAGE_ROLES);
        Role role = find(communityId, roleId);
        guardManageable(actor, role);
        if (r.name() != null && !r.name().isBlank() && !r.name().trim().equalsIgnoreCase(role.getName())) {
            if (role.isSystem()) throw new ApiException(HttpStatus.BAD_REQUEST, "System roles cannot be renamed");
            if (roles.existsByCommunityIdAndNameIgnoreCase(communityId, r.name().trim())) throw new ApiException(HttpStatus.CONFLICT, "Role name already exists");
            role.setName(r.name().trim());
        }
        if (r.permissions() != null) {
            requireHeld(actor, r.permissions());
            role.getPermissions().clear();
            role.getPermissions().addAll(r.permissions());
        }
        return dto(roles.save(role));
    }

    @Transactional
    public void delete(UUID communityId, UUID roleId, UUID actorId) {
        Membership actor = perms.require(communityId, actorId, MANAGE_ROLES);
        Role role = find(communityId, roleId);
        guardManageable(actor, role);
        if (role.isSystem()) throw new ApiException(HttpStatus.BAD_REQUEST, "System roles cannot be deleted");
        roles.delete(role);
    }

    /** Replaces the target's roles. MEMBER is always retained; OWNER can never be assigned here. */
    @Transactional
    public List<RoleRef> assign(UUID communityId, UUID actorId, UUID targetUserId, Set<UUID> roleIds) {
        Membership actor = perms.require(communityId, actorId, MANAGE_ROLES);
        Membership target = memberships.findByCommunityIdAndUserId(communityId, targetUserId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Member not found"));
        if (target.topPosition() <= actor.topPosition()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Cannot change roles of a member at or above your rank");
        }
        Set<Role> next = new HashSet<>();
        for (UUID id : roleIds) {
            Role role = find(communityId, id);
            guardManageable(actor, role);
            next.add(role);
        }
        next.add(roles.findByCommunityIdAndSystemKey(communityId, "MEMBER").orElseThrow());
        target.getRoles().clear();
        target.getRoles().addAll(next);
        memberships.save(target);
        return target.getRoles().stream().sorted(Comparator.comparingInt(Role::getPosition))
            .map(x -> new RoleRef(x.getId(), x.getName())).toList();
    }

    private Role find(UUID communityId, UUID roleId) {
        Role r = roles.findById(roleId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Role not found"));
        if (!r.getCommunityId().equals(communityId)) throw new ApiException(HttpStatus.NOT_FOUND, "Role not found");
        return r;
    }

    private void guardManageable(Membership actor, Role role) {
        if ("OWNER".equals(role.getSystemKey())) throw new ApiException(HttpStatus.FORBIDDEN, "The Owner role cannot be modified");
        if (role.getPosition() <= actor.topPosition()) throw new ApiException(HttpStatus.FORBIDDEN, "Cannot manage a role at or above your own rank");
    }

    private void requireHeld(Membership actor, Set<Permission> wanted) {
        Set<Permission> held = perms.permissions(actor);
        if (!held.containsAll(wanted)) throw new ApiException(HttpStatus.FORBIDDEN, "Cannot grant permissions you do not hold");
    }

    static RoleDto dto(Role r) {
        return new RoleDto(r.getId(), r.getName(), r.getPosition(), r.isSystem(),
            r.getPermissions().stream().collect(Collectors.toCollection(() -> EnumSet.noneOf(Permission.class))));
    }
}
