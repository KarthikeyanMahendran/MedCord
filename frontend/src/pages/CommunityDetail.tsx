import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, Copy, Hash, Megaphone, MessageCircle, Trash2 } from 'lucide-react'
import { ModerationPanel } from '../components/community/ModerationPanel'
import { AuditPanel } from '../components/community/AuditPanel'
import { muteMember } from '../api/moderation'
import { Alert, Badge, Button, Card, CardBody, EmptyState, FormGroup, Input, Modal, Tabs } from '../components/ui'
import * as api from '../api/communities'
import type { Channel, Community, Invite, Member, Permission, Role } from '../api/communities'
import { ALL_PERMISSIONS } from '../api/communities'
import { startDm } from '../api/dms'
import { PresenceDot } from '../components/chat/PresenceDot'
import { fieldErrors, problemMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'

type Tab = 'channels' | 'members' | 'roles' | 'invites' | 'moderation' | 'audit'
const label = (p: string) => p.toLowerCase().replace(/_/g, ' ')

export default function CommunityDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [community, setCommunity] = useState<Community | null>(null)
  const [tab, setTab] = useState<Tab>('channels')
  const [channels, setChannels] = useState<Channel[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [modal, setModal] = useState<null | 'channel' | 'role' | 'assign' | 'delete'>(null)
  const [assignFor, setAssignFor] = useState<Member | null>(null)
  const [assignIds, setAssignIds] = useState<Set<string>>(new Set())
  const [chForm, setChForm] = useState({ name: '', topic: '', type: 'TEXT' as 'TEXT' | 'ANNOUNCEMENT' })
  const [roleForm, setRoleForm] = useState({ name: '', position: 4, permissions: new Set<Permission>(['SEND_MESSAGES']) })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const can = (p: Permission) => community?.myPermissions.includes(p) ?? false
  const isMember = (community?.myPermissions.length ?? 0) > 0
  const isOwner = community?.ownerId === user?.id

  const fail = (e: unknown) => setError(problemMessage(e))

  const load = useCallback(async () => {
    try {
      const c = await api.getCommunity(id)
      setCommunity(c)
      if (c.myPermissions.length > 0) {
        const [ch, m, r] = await Promise.all([api.listChannels(id), api.listMembers(id), api.listRoles(id)])
        setChannels(ch); setMembers(m); setRoles(r)
        if (c.myPermissions.includes('CREATE_INVITE')) setInvites(await api.listInvites(id))
      }
      setError(null)
    } catch (e) { fail(e) }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true); setError(null); setErrors({})
    try { await fn(); if (ok) setNotice(ok); await load(); return true }
    catch (e) { const fe = fieldErrors(e); setErrors(fe); if (!Object.keys(fe).length) fail(e); return false }
    finally { setBusy(false) }
  }

  async function submitChannel(e: FormEvent) {
    e.preventDefault()
    if (await run(() => api.createChannel(id, { name: chForm.name, topic: chForm.topic || undefined, type: chForm.type }), 'Channel created.')) {
      setModal(null); setChForm({ name: '', topic: '', type: 'TEXT' })
    }
  }
  async function submitRole(e: FormEvent) {
    e.preventDefault()
    if (await run(() => api.createRole(id, { name: roleForm.name, position: roleForm.position, permissions: [...roleForm.permissions] }), 'Role created.')) {
      setModal(null); setRoleForm({ name: '', position: 4, permissions: new Set(['SEND_MESSAGES']) })
    }
  }
  async function submitAssign() {
    if (assignFor && await run(() => api.assignRoles(id, assignFor.userId, [...assignIds]), 'Roles updated.')) setModal(null)
  }
  const copy = (code: string) => navigator.clipboard?.writeText(`${window.location.origin}/invite/${code}`).then(() => setNotice('Invite link copied.'))

  if (!community) return <main className="mc-page">{error ? <Alert tone="danger">{error}</Alert> : <div className="mc-skeleton" style={{ height: 80 }} />}</main>

  const tabs: { value: Tab; label: string }[] = [{ value: 'channels', label: 'Channels' }, { value: 'members', label: 'Members' }]
  if (isMember) tabs.push({ value: 'roles', label: 'Roles' })
  if (can('CREATE_INVITE')) tabs.push({ value: 'invites', label: 'Invites' })
  if (can('MODERATE_MESSAGES') || can('MANAGE_MEMBERS')) tabs.push({ value: 'moderation', label: 'Moderation' })
  if (can('MANAGE_COMMUNITY')) tabs.push({ value: 'audit', label: 'Audit log' })

  return (
    <main className="mc-page mc-page-wide">
      <div className="mc-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Link to="/communities" className="mc-muted-sub">← Communities</Link>
          <h1 style={{ fontSize: 22, marginTop: 4 }}>{community.name}</h1>
          <div className="mc-row" style={{ marginTop: 6 }}>
            {community.specialtyTag && <Badge tone="info">{community.specialtyTag}</Badge>}
            <Badge tone="neutral">{community.visibility.toLowerCase()}</Badge>
            <span className="mc-muted-sub">{community.memberCount} members</span>
          </div>
          {community.description && <p className="mc-hint" style={{ margin: '8px 0 0' }}>{community.description}</p>}
        </div>
        <div className="mc-row">
          {!isMember && <Button onClick={() => run(() => api.joinCommunity(id), 'Joined.')} loading={busy}>Join</Button>}
          {isMember && !isOwner && <Button variant="secondary" size="sm" onClick={async () => { if (await run(() => api.leaveCommunity(id))) navigate('/communities') }}>Leave</Button>}
          {isOwner && <Button variant="danger" size="sm" onClick={() => setModal('delete')}><Trash2 size={14} /> Delete</Button>}
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      {!isMember && <Alert tone="info">Join this community to see its channels and members.</Alert>}

      {isMember && (
        <Card><CardBody>
          <Tabs<Tab> label="Community sections" items={tabs} value={tab} onChange={(t) => { setTab(t); setNotice(null) }} />
          <div style={{ paddingTop: 16 }}>
            {tab === 'channels' && (<>
              {can('MANAGE_CHANNELS') && <div style={{ marginBottom: 12 }}><Button size="sm" onClick={() => { setErrors({}); setModal('channel') }}>New channel</Button></div>}
              {channels.length === 0 ? <EmptyState title="No channels" /> : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                  {channels.map((c) => (
                    <li key={c.id} className="mc-row" style={{ justifyContent: 'space-between', padding: '8px 10px', border: '1px solid var(--mc-border)', borderRadius: 8, opacity: c.archived ? 0.6 : 1 }}>
                      <div className="mc-row">
                        {c.type === 'ANNOUNCEMENT' ? <Megaphone size={16} /> : <Hash size={16} />}
                        <div><Link to={`/communities/${id}/channels/${c.id}`}><strong>{c.name}</strong></Link> {c.archived && <Badge tone="neutral">archived</Badge>}<div className="mc-muted-sub">{c.topic}</div></div>
                      </div>
                      {can('MANAGE_CHANNELS') && <Button variant="ghost" size="sm" onClick={() => run(() => api.updateChannel(id, c.id, { archived: !c.archived }))}><Archive size={14} /> {c.archived ? 'Unarchive' : 'Archive'}</Button>}
                    </li>
                  ))}
                </ul>
              )}
            </>)}

            {tab === 'members' && (
              <div className="mc-table-wrap"><table className="mc-table">
                <thead><tr><th>Member</th><th>Roles</th><th /></tr></thead>
                <tbody>{members.map((m) => (
                  <tr key={m.userId}>
                    <td><div className="mc-row" style={{ gap: 8 }}><PresenceDot online={m.online} /><strong>{m.displayName}</strong></div> {m.verified && <Badge tone="success">verified</Badge>}<div className="mc-muted-sub">{m.specialty}</div></td>
                    <td><div className="mc-row" style={{ flexWrap: 'wrap', gap: 4 }}>{m.roles.map((r) => <Badge key={r.id} tone={r.name === 'Owner' ? 'warning' : 'neutral'}>{r.name}</Badge>)}</div></td>
                    <td style={{ textAlign: 'right' }}>
                      {m.userId !== user?.id && (
                        <Button variant="ghost" size="sm" aria-label={`Message ${m.displayName}`} onClick={async () => { try { const c = await startDm([m.userId]); navigate(`/messages/${c.id}`) } catch (e) { fail(e) } }}><MessageCircle size={14} /> Message</Button>)}
                      {can('MANAGE_ROLES') && m.userId !== user?.id && (
                        <Button variant="ghost" size="sm" onClick={() => { setAssignFor(m); setAssignIds(new Set(m.roles.map((r) => r.id))); setErrors({}); setModal('assign') }}>Roles</Button>)}
                      {can('MANAGE_MEMBERS') && m.userId !== user?.id && (<>
                        <Button variant="ghost" size="sm" aria-label={`Mute ${m.displayName}`} onClick={() => run(() => muteMember(id, m.userId, 60, 'Muted by moderator'), `${m.displayName} was muted for 1 hour.`)}>Mute 1h</Button>
                        <Button variant="ghost" size="sm" onClick={() => run(() => api.kickMember(id, m.userId), `${m.displayName} was removed.`)}>Remove</Button>
                        <Button variant="ghost" size="sm" aria-label={`Ban ${m.displayName}`} onClick={() => run(() => api.banMember(id, m.userId, 'Banned by moderator'), `${m.displayName} was banned.`)}>Ban</Button></>)}
                    </td>
                  </tr>))}</tbody>
              </table></div>
            )}

            {tab === 'roles' && (<>
              {can('MANAGE_ROLES') && <div style={{ marginBottom: 12 }}><Button size="sm" onClick={() => { setErrors({}); setModal('role') }}>New role</Button></div>}
              <div style={{ display: 'grid', gap: 10 }}>{roles.map((r) => (
                <div key={r.id} style={{ border: '1px solid var(--mc-border)', borderRadius: 8, padding: 12 }}>
                  <div className="mc-row" style={{ justifyContent: 'space-between' }}>
                    <div><strong>{r.name}</strong> <span className="mc-muted-sub">rank {r.position}{r.system ? ' · system' : ''}</span></div>
                    {can('MANAGE_ROLES') && !r.system && <Button variant="ghost" size="sm" onClick={() => run(() => api.deleteRole(id, r.id), 'Role deleted.')}><Trash2 size={14} /></Button>}
                  </div>
                  <div className="mc-row" style={{ flexWrap: 'wrap', gap: 4, marginTop: 8 }}>{r.permissions.map((p) => <Badge key={p} tone="info">{label(p)}</Badge>)}</div>
                </div>))}</div>
            </>)}

            {tab === 'moderation' && <ModerationPanel communityId={id} canModerate={can('MODERATE_MESSAGES')} canManageMembers={can('MANAGE_MEMBERS')} />}
            {tab === 'audit' && <AuditPanel communityId={id} />}

            {tab === 'invites' && (<>
              <div style={{ marginBottom: 12 }} className="mc-row">
                <Button size="sm" loading={busy} onClick={() => run(() => api.createInvite(id, { expiresInHours: 168 }), 'Invite created (valid 7 days).')}>Create invite link</Button>
              </div>
              {invites.length === 0 ? <EmptyState title="No invites yet" /> : (
                <div className="mc-table-wrap"><table className="mc-table">
                  <thead><tr><th>Code</th><th>Uses</th><th>Expires</th><th /></tr></thead>
                  <tbody>{invites.map((i) => (
                    <tr key={i.id}>
                      <td><code>{i.code}</code> {i.revoked && <Badge tone="danger">revoked</Badge>}</td>
                      <td>{i.uses}{i.maxUses ? ` / ${i.maxUses}` : ''}</td>
                      <td>{i.expiresAt ? new Date(i.expiresAt).toLocaleDateString() : 'never'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <Button variant="ghost" size="sm" onClick={() => copy(i.code)}><Copy size={14} /> Copy link</Button>
                        {!i.revoked && <Button variant="ghost" size="sm" onClick={() => run(() => api.revokeInvite(id, i.id), 'Invite revoked.')}>Revoke</Button>}
                      </td>
                    </tr>))}</tbody>
                </table></div>)}
            </>)}
          </div>
        </CardBody></Card>
      )}

      <Modal isOpen={modal === 'channel'} onClose={() => setModal(null)} title="New channel" size="sm">
        <form onSubmit={submitChannel} style={{ display: 'grid', gap: 14 }}>
          <FormGroup id="chname" label="Name" hint="Lowercase letters, digits and dashes" error={errors.name}><Input id="chname" value={chForm.name} onChange={(e) => setChForm({ ...chForm, name: e.target.value.toLowerCase() })} invalid={!!errors.name} required /></FormGroup>
          <FormGroup id="chtopic" label="Topic"><Input id="chtopic" value={chForm.topic} onChange={(e) => setChForm({ ...chForm, topic: e.target.value })} /></FormGroup>
          <FormGroup id="chtype" label="Type"><select id="chtype" className="mc-input" value={chForm.type} onChange={(e) => setChForm({ ...chForm, type: e.target.value as 'TEXT' | 'ANNOUNCEMENT' })}><option value="TEXT">Text</option><option value="ANNOUNCEMENT">Announcement</option></select></FormGroup>
          <div className="mc-row" style={{ justifyContent: 'flex-end' }}><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" loading={busy}>Create</Button></div>
        </form>
      </Modal>

      <Modal isOpen={modal === 'role'} onClose={() => setModal(null)} title="New role" size="sm">
        <form onSubmit={submitRole} style={{ display: 'grid', gap: 14 }}>
          <FormGroup id="rname" label="Name" error={errors.name}><Input id="rname" value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} invalid={!!errors.name} required /></FormGroup>
          <FormGroup id="rpos" label="Rank" hint="Higher number = lower rank. Must be below your own rank (Member is 3)" error={errors.position}><Input id="rpos" type="number" min={1} max={1000} value={roleForm.position} onChange={(e) => setRoleForm({ ...roleForm, position: Number(e.target.value) })} /></FormGroup>
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            <legend className="mc-label">Permissions</legend>
            {ALL_PERMISSIONS.filter((p) => can(p)).map((p) => (
              <label key={p} className="mc-row" style={{ gap: 8 }}>
                <input type="checkbox" checked={roleForm.permissions.has(p)} onChange={(e) => { const s = new Set(roleForm.permissions); if (e.target.checked) s.add(p); else s.delete(p); setRoleForm({ ...roleForm, permissions: s }) }} />{label(p)}
              </label>))}
          </fieldset>
          <div className="mc-row" style={{ justifyContent: 'flex-end' }}><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" loading={busy}>Create</Button></div>
        </form>
      </Modal>

      <Modal isOpen={modal === 'assign'} onClose={() => setModal(null)} title={`Roles for ${assignFor?.displayName ?? ''}`} size="sm"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button loading={busy} onClick={submitAssign}>Save</Button></>}>
        <div style={{ display: 'grid', gap: 8 }}>
          {roles.filter((r) => r.name !== 'Owner' && r.name !== 'Member').map((r) => (
            <label key={r.id} className="mc-row" style={{ gap: 8 }}>
              <input type="checkbox" checked={assignIds.has(r.id)} onChange={(e) => { const s = new Set(assignIds); if (e.target.checked) s.add(r.id); else s.delete(r.id); setAssignIds(s) }} />{r.name}
            </label>))}
          <span className="mc-hint">Everyone keeps the Member role. You can only assign roles ranked below yours.</span>
        </div>
      </Modal>

      <Modal isOpen={modal === 'delete'} onClose={() => setModal(null)} title="Delete community?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button variant="danger" loading={busy} onClick={async () => { if (await run(() => api.deleteCommunity(id))) navigate('/communities') }}>Delete forever</Button></>}>
        This permanently deletes <strong>{community.name}</strong>, its channels, roles and invites. This cannot be undone.
      </Modal>
    </main>
  )
}
