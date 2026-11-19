import { api } from './client'

export type Permission = 'MANAGE_COMMUNITY' | 'MANAGE_CHANNELS' | 'MANAGE_ROLES' | 'MANAGE_MEMBERS'
  | 'CREATE_INVITE' | 'SEND_MESSAGES' | 'POST_ANNOUNCEMENTS' | 'MODERATE_MESSAGES'
export const ALL_PERMISSIONS: Permission[] = ['MANAGE_COMMUNITY', 'MANAGE_CHANNELS', 'MANAGE_ROLES', 'MANAGE_MEMBERS',
  'CREATE_INVITE', 'SEND_MESSAGES', 'POST_ANNOUNCEMENTS', 'MODERATE_MESSAGES']

export interface Community {
  id: string; name: string; slug: string; description: string | null; specialtyTag: string | null
  visibility: 'PUBLIC' | 'PRIVATE'; ownerId: string; memberCount: number; myPermissions: Permission[]
}
export interface Channel { id: string; name: string; topic: string | null; type: 'TEXT' | 'ANNOUNCEMENT' | 'VOICE'; position: number; archived: boolean }
export interface Role { id: string; name: string; position: number; system: boolean; permissions: Permission[] }
export interface RoleRef { id: string; name: string }
export interface Member { userId: string; displayName: string; specialty: string | null; verified: boolean; roles: RoleRef[]; joinedAt: string; online: boolean }
export interface Invite { id: string; code: string; expiresAt: string | null; maxUses: number | null; uses: number; revoked: boolean }
export interface InvitePreview { communityName: string; description: string | null; memberCount: number; valid: boolean }

const c = (id: string) => `/communities/${id}`

export const listMine = async () => (await api.get<Community[]>('/communities')).data
export const discover = async (q: string) => (await api.get<Community[]>('/communities/discover', { params: { q } })).data
export const getCommunity = async (id: string) => (await api.get<Community>(c(id))).data
export const createCommunity = async (b: { name: string; description?: string; specialtyTag?: string; visibility: 'PUBLIC' | 'PRIVATE' }) =>
  (await api.post<Community>('/communities', b)).data
export const joinCommunity = async (id: string) => (await api.post<Community>(`${c(id)}/join`)).data
export const leaveCommunity = async (id: string) => { await api.delete(`${c(id)}/members/me`) }
export const deleteCommunity = async (id: string) => { await api.delete(c(id)) }

export const listChannels = async (id: string) => (await api.get<Channel[]>(`${c(id)}/channels`)).data
export const createChannel = async (id: string, b: { name: string; topic?: string; type: 'TEXT' | 'ANNOUNCEMENT' | 'VOICE' }) =>
  (await api.post<Channel>(`${c(id)}/channels`, b)).data
export const updateChannel = async (id: string, ch: string, b: { archived?: boolean; topic?: string; name?: string }) =>
  (await api.patch<Channel>(`${c(id)}/channels/${ch}`, b)).data

export const listMembers = async (id: string) => (await api.get<Member[]>(`${c(id)}/members`)).data
export const kickMember = async (id: string, uid: string) => { await api.delete(`${c(id)}/members/${uid}`) }
export const banMember = async (id: string, uid: string, reason?: string) => { await api.put(`${c(id)}/members/${uid}/ban`, { reason }) }
export const assignRoles = async (id: string, uid: string, roleIds: string[]) =>
  (await api.put<RoleRef[]>(`${c(id)}/members/${uid}/roles`, { roleIds })).data

export const listRoles = async (id: string) => (await api.get<Role[]>(`${c(id)}/roles`)).data
export const createRole = async (id: string, b: { name: string; position: number; permissions: Permission[] }) =>
  (await api.post<Role>(`${c(id)}/roles`, b)).data
export const deleteRole = async (id: string, roleId: string) => { await api.delete(`${c(id)}/roles/${roleId}`) }

export const listInvites = async (id: string) => (await api.get<Invite[]>(`${c(id)}/invites`)).data
export const createInvite = async (id: string, b: { maxUses?: number; expiresInHours?: number }) =>
  (await api.post<Invite>(`${c(id)}/invites`, b)).data
export const revokeInvite = async (id: string, inviteId: string) => { await api.delete(`${c(id)}/invites/${inviteId}`) }
export const previewInvite = async (code: string) => (await api.get<InvitePreview>(`/invites/${code}`)).data
export const joinInvite = async (code: string) => (await api.post<Community>(`/invites/${code}/join`)).data
