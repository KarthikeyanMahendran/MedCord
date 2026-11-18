package com.medcord.community;

import com.medcord.common.ApiException;
import com.medcord.community.CommunityDtos.*;

import com.medcord.nexconn.ChannelTransport;
import com.medcord.user.*;
import com.medcord.user.ProfessionalProfile.Verification;
import java.security.SecureRandom;
import java.text.Normalizer;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CommunityService {
    private static final String ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
    private static final SecureRandom RNG = new SecureRandom();

    private final CommunityRepository communities;
    private final MembershipRepository memberships;
    private final InviteRepository invites;
    private final BanRepository bans;
    private final RoleRepository roleRepo;
    private final UserRepository users;
    private final ProfessionalProfileRepository profiles;
    private final RoleService roles;
    private final ChannelService channels;
    private final PermissionService perms;
    private final ChannelTransport transport;

    public CommunityService(CommunityRepository communities, MembershipRepository memberships, InviteRepository invites,
                            BanRepository bans, RoleRepository roleRepo, UserRepository users,
                            ProfessionalProfileRepository profiles, RoleService roles, ChannelService channels,
                            PermissionService perms, ChannelTransport transport) {
        this.communities = communities; this.memberships = memberships; this.invites = invites; this.bans = bans;
        this.roleRepo = roleRepo; this.users = users; this.profiles = profiles; this.roles = roles;
        this.channels = channels; this.perms = perms; this.transport = transport;
    }

    // ---- communities ----

    @Transactional
    public CommunityDto create(UUID userId, CreateCommunityRequest r) {
        User u = users.findById(userId).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Unknown user"));
        boolean verified = u.getStatus() == User.Status.ACTIVE
            && profiles.findById(userId).map(p -> p.getVerificationStatus() == Verification.APPROVED).orElse(false);
        if (!verified) throw new ApiException(HttpStatus.FORBIDDEN, "Only verified professionals can create communities");

        Community c = new Community();
        c.setName(r.name().trim());
        c.setSlug(uniqueSlug(r.name()));
        c.setDescription(r.description());
        c.setSpecialtyTag(r.specialtyTag());
        c.setVisibility(r.visibility() == null ? Community.Visibility.PUBLIC : r.visibility());
        c.setOwnerId(userId);
        c = communities.saveAndFlush(c);

        Map<String, Role> defaults = roles.seedDefaults(c.getId());
        Membership m = new Membership();
        m.setCommunityId(c.getId());
        m.setUserId(userId);
        m.getRoles().add(defaults.get("OWNER"));
        m.getRoles().add(defaults.get("MEMBER"));
        memberships.save(m);

        channels.createUnchecked(c.getId(), "general", "General discussion", Channel.Type.TEXT);
        channels.createUnchecked(c.getId(), "announcements", "Official announcements", Channel.Type.ANNOUNCEMENT);
        transport.onMemberJoined(c.getId(), userId);
        return dto(c, userId);
    }

    @Transactional(readOnly = true)
    public List<CommunityDto> mine(UUID userId) {
        return communities.findMine(userId).stream().map(c -> dto(c, userId)).toList();
    }

    @Transactional(readOnly = true)
    public List<CommunityDto> discover(String q, UUID userId) {
        return communities.discover(q == null ? "" : q.trim()).stream().map(c -> dto(c, userId)).toList();
    }

    @Transactional(readOnly = true)
    public CommunityDto get(UUID id, UUID userId) {
        Community c = communities.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Community not found"));
        boolean member = memberships.findByCommunityIdAndUserId(id, userId).isPresent();
        if (!member && c.getVisibility() == Community.Visibility.PRIVATE) throw new ApiException(HttpStatus.NOT_FOUND, "Community not found");
        return dto(c, userId);
    }

    @Transactional
    public CommunityDto update(UUID id, UUID userId, UpdateCommunityRequest r) {
        perms.require(id, userId, Permission.MANAGE_COMMUNITY);
        Community c = communities.findById(id).orElseThrow();
        if (r.name() != null && !r.name().isBlank()) c.setName(r.name().trim());
        if (r.description() != null) c.setDescription(r.description());
        if (r.specialtyTag() != null) c.setSpecialtyTag(r.specialtyTag());
        if (r.visibility() != null) c.setVisibility(r.visibility());
        return dto(communities.save(c), userId);
    }

    @Transactional
    public void delete(UUID id, UUID userId) {
        Community c = communities.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Community not found"));
        if (!c.getOwnerId().equals(userId)) throw new ApiException(HttpStatus.FORBIDDEN, "Only the owner can delete a community");
        communities.delete(c);
        transport.onCommunityDeleted(id);
    }

    // ---- membership ----

    @Transactional
    public CommunityDto joinPublic(UUID id, UUID userId) {
        Community c = communities.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Community not found"));
        if (c.getVisibility() != Community.Visibility.PUBLIC) throw new ApiException(HttpStatus.NOT_FOUND, "Community not found");
        addMember(c, userId);
        return dto(c, userId);
    }

    @Transactional
    public CommunityDto joinByInvite(String code, UUID userId) {
        Invite inv = invites.findByCode(code).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Invite not found"));
        Community c = communities.findById(inv.getCommunityId()).orElseThrow();
        if (bans.existsByCommunityIdAndUserId(c.getId(), userId)) throw new ApiException(HttpStatus.FORBIDDEN, "You are banned from this community");
        if (memberships.findByCommunityIdAndUserId(c.getId(), userId).isPresent()) return dto(c, userId);
        if (!isUsable(inv)) throw new ApiException(HttpStatus.GONE, "Invite is expired, revoked or fully used");
        if (invites.consume(inv.getId()) != 1) throw new ApiException(HttpStatus.GONE, "Invite is expired, revoked or fully used");
        addMember(c, userId);
        return dto(c, userId);
    }

    private void addMember(Community c, UUID userId) {
        if (bans.existsByCommunityIdAndUserId(c.getId(), userId)) throw new ApiException(HttpStatus.FORBIDDEN, "You are banned from this community");
        if (memberships.findByCommunityIdAndUserId(c.getId(), userId).isPresent()) return;
        User u = users.findById(userId).orElseThrow();
        if (u.getStatus() == User.Status.SUSPENDED) throw new ApiException(HttpStatus.FORBIDDEN, "Account suspended");
        Membership m = new Membership();
        m.setCommunityId(c.getId());
        m.setUserId(userId);
        m.getRoles().add(roleRepo.findByCommunityIdAndSystemKey(c.getId(), "MEMBER").orElseThrow());
        memberships.save(m);
        transport.onMemberJoined(c.getId(), userId);
    }

    @Transactional
    public void leave(UUID id, UUID userId) {
        Community c = communities.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Community not found"));
        if (c.getOwnerId().equals(userId)) throw new ApiException(HttpStatus.CONFLICT, "The owner cannot leave; delete the community instead");
        if (memberships.remove(id, userId) == 0) throw new ApiException(HttpStatus.NOT_FOUND, "You are not a member");
        transport.onMemberLeft(id, userId);
    }

    @Transactional(readOnly = true)
    public List<MemberDto> members(UUID id, UUID userId) {
        perms.membership(id, userId);
        List<MemberDto> out = new ArrayList<>();
        for (Membership m : memberships.findByCommunityId(id)) {
            User u = users.findById(m.getUserId()).orElse(null);
            if (u == null) continue;
            ProfessionalProfile p = profiles.findById(u.getId()).orElse(null);
            out.add(new MemberDto(u.getId(), u.getDisplayName(), p == null ? null : p.getSpecialty(),
                p != null && p.getVerificationStatus() == Verification.APPROVED,
                m.getRoles().stream().sorted(Comparator.comparingInt(Role::getPosition)).map(r -> new RoleRef(r.getId(), r.getName())).toList(),
                m.getJoinedAt()));
        }
        out.sort(Comparator.comparing(MemberDto::displayName, String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    @Transactional
    public void kick(UUID id, UUID actorId, UUID targetId) {
        removeMember(id, actorId, targetId);
    }

    @Transactional
    public void ban(UUID id, UUID actorId, UUID targetId, String reason) {
        removeMember(id, actorId, targetId);
        if (!bans.existsByCommunityIdAndUserId(id, targetId)) {
            Ban b = new Ban();
            b.setCommunityId(id);
            b.setUserId(targetId);
            b.setBannedBy(actorId);
            b.setReason(reason);
            bans.save(b);
        }
    }

    @Transactional
    public void unban(UUID id, UUID actorId, UUID targetId) {
        perms.require(id, actorId, Permission.MANAGE_MEMBERS);
        bans.findByCommunityIdAndUserId(id, targetId).ifPresentOrElse(bans::delete,
            () -> { throw new ApiException(HttpStatus.NOT_FOUND, "User is not banned"); });
    }

    private void removeMember(UUID id, UUID actorId, UUID targetId) {
        Membership actor = perms.require(id, actorId, Permission.MANAGE_MEMBERS);
        if (actorId.equals(targetId)) throw new ApiException(HttpStatus.BAD_REQUEST, "You cannot remove yourself; use leave");
        Membership target = memberships.findByCommunityIdAndUserId(id, targetId)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Member not found"));
        if (target.topPosition() <= actor.topPosition()) throw new ApiException(HttpStatus.FORBIDDEN, "Cannot remove a member at or above your rank");
        memberships.remove(id, targetId);
        transport.onMemberLeft(id, targetId);
    }

    // ---- invites ----

    @Transactional
    public InviteDto createInvite(UUID id, UUID userId, CreateInviteRequest r) {
        perms.require(id, userId, Permission.CREATE_INVITE);
        Invite inv = new Invite();
        inv.setCommunityId(id);
        inv.setCreatedBy(userId);
        inv.setCode(newCode());
        inv.setMaxUses(r.maxUses());
        if (r.expiresInHours() != null) inv.setExpiresAt(Instant.now().plus(Duration.ofHours(r.expiresInHours())));
        return invDto(invites.save(inv));
    }

    @Transactional(readOnly = true)
    public List<InviteDto> listInvites(UUID id, UUID userId) {
        perms.require(id, userId, Permission.CREATE_INVITE);
        return invites.findByCommunityIdOrderByIdDesc(id).stream().map(CommunityService::invDto).toList();
    }

    @Transactional
    public void revokeInvite(UUID id, UUID userId, UUID inviteId) {
        perms.require(id, userId, Permission.CREATE_INVITE);
        Invite inv = invites.findById(inviteId).filter(i -> i.getCommunityId().equals(id))
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Invite not found"));
        if (inv.getRevokedAt() == null) inv.setRevokedAt(Instant.now());
    }

    @Transactional(readOnly = true)
    public InvitePreview preview(String code) {
        Invite inv = invites.findByCode(code).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Invite not found"));
        Community c = communities.findById(inv.getCommunityId()).orElseThrow();
        return new InvitePreview(c.getName(), c.getDescription(), memberships.countByCommunityId(c.getId()), isUsable(inv));
    }

    // ---- helpers ----

    private static boolean isUsable(Invite i) {
        return i.getRevokedAt() == null
            && (i.getExpiresAt() == null || i.getExpiresAt().isAfter(Instant.now()))
            && (i.getMaxUses() == null || i.getUses() < i.getMaxUses());
    }

    private CommunityDto dto(Community c, UUID userId) {
        Set<Permission> mine = memberships.findByCommunityIdAndUserId(c.getId(), userId)
            .map(perms::permissions).orElse(EnumSet.noneOf(Permission.class));
        return new CommunityDto(c.getId(), c.getName(), c.getSlug(), c.getDescription(), c.getSpecialtyTag(),
            c.getVisibility(), c.getOwnerId(), memberships.countByCommunityId(c.getId()), mine);
    }

    private static InviteDto invDto(Invite i) {
        return new InviteDto(i.getId(), i.getCode(), i.getExpiresAt(), i.getMaxUses(), i.getUses(), i.getRevokedAt() != null);
    }

    private String uniqueSlug(String name) {
        String base = Normalizer.normalize(name, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
            .toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (base.isBlank()) base = "community";
        if (base.length() > 100) base = base.substring(0, 100);
        String slug = base;
        while (communities.existsBySlug(slug)) slug = base + "-" + randomChars(4);
        return slug;
    }

    private static String newCode() { return randomChars(10); }

    private static String randomChars(int n) {
        StringBuilder sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) sb.append(ALPHABET.charAt(RNG.nextInt(ALPHABET.length())));
        return sb.toString();
    }
}
