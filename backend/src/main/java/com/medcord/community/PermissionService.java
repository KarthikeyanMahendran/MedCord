package com.medcord.community;

import com.medcord.common.ApiException;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** Server-side permission evaluator: a member's permissions are the union of their roles' permissions. */
@Service
public class PermissionService {
    private final MembershipRepository memberships;

    public PermissionService(MembershipRepository memberships) {
        this.memberships = memberships;
    }

    public Membership membership(UUID communityId, UUID userId) {
        return memberships.findByCommunityIdAndUserId(communityId, userId)
            .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "You are not a member of this community"));
    }

    public Set<Permission> permissions(Membership m) {
        Set<Permission> out = EnumSet.noneOf(Permission.class);
        m.getRoles().forEach(r -> out.addAll(r.getPermissions()));
        return out;
    }

    public Membership require(UUID communityId, UUID userId, Permission p) {
        Membership m = membership(communityId, userId);
        if (!permissions(m).contains(p)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Missing permission: " + p);
        }
        return m;
    }
}
