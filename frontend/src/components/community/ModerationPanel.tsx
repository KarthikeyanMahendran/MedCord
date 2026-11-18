import { useCallback, useEffect, useState } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import { Alert, Badge, Button, EmptyState, Tabs } from '../ui'
import { listMutes, listReports, resolveReport, unmuteMember } from '../../api/moderation'
import type { Mute, Report, ReportStatus } from '../../api/moderation'
import { problemMessage } from '../../api/client'

const reasonLabel: Record<string, string> = { PHI: 'Patient info', HARASSMENT: 'Harassment', MISINFORMATION: 'Misinformation', SPAM: 'Spam', OTHER: 'Other' }
type Filter = ReportStatus | 'ALL'

export function ModerationPanel({ communityId, canModerate, canManageMembers }: { communityId: string; canModerate: boolean; canManageMembers: boolean }) {
  const [filter, setFilter] = useState<Filter>('OPEN')
  const [reports, setReports] = useState<Report[]>([])
  const [mutes, setMutes] = useState<Mute[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      if (canModerate) setReports(await listReports(communityId, filter === 'ALL' ? undefined : filter))
      if (canManageMembers) setMutes(await listMutes(communityId))
      setError(null)
    } catch (e) { setError(problemMessage(e)) }
  }, [communityId, filter, canModerate, canManageMembers])

  useEffect(() => { void load() }, [load])

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id)
    try { await fn(); await load() } catch (e) { setError(problemMessage(e)) } finally { setBusy(null) }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {error && <Alert tone="danger">{error}</Alert>}
      {canModerate && (
        <section aria-label="Reports" style={{ display: 'grid', gap: 10 }}>
          <Tabs<Filter> label="Report status" value={filter} onChange={setFilter}
            items={[{ value: 'OPEN', label: 'Open' }, { value: 'RESOLVED', label: 'Resolved' }, { value: 'DISMISSED', label: 'Dismissed' }, { value: 'ALL', label: 'All' }]} />
          {reports.length === 0 ? <EmptyState title="No reports here">Reported messages show up in this queue.</EmptyState> : reports.map((r) => (
            <div key={r.id} className="mc-rev" style={{ display: 'grid', gap: 6 }}>
              <div className="mc-row" style={{ flexWrap: 'wrap' }}>
                <Badge tone={r.reason === 'PHI' ? 'danger' : 'warning'}>{reasonLabel[r.reason]}</Badge>
                <Badge tone={r.status === 'OPEN' ? 'info' : 'neutral'}>{r.status.toLowerCase()}</Badge>
                <span className="mc-muted-sub">reported by {r.reporterName} · #{r.channelName} · {new Date(r.createdAt).toLocaleString()}</span>
              </div>
              <div className="mc-msg-body"><strong>{r.authorName}:</strong> {r.messageDeleted ? <em>message deleted</em> : r.body}</div>
              {r.details && <div className="mc-muted-sub">Note: {r.details}</div>}
              {r.status === 'OPEN' ? (
                <div className="mc-row" style={{ flexWrap: 'wrap' }}>
                  {!r.messageDeleted && <Button size="sm" variant="danger" loading={busy === r.id} onClick={() => act(r.id, () => resolveReport(communityId, r.id, 'RESOLVED', true))}><Trash2 size={14} /> Delete message and resolve</Button>}
                  <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => act(r.id, () => resolveReport(communityId, r.id, 'RESOLVED'))}><Check size={14} /> Resolve</Button>
                  <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => act(r.id, () => resolveReport(communityId, r.id, 'DISMISSED'))}><X size={14} /> Dismiss</Button>
                </div>
              ) : <span className="mc-muted-sub">Handled by {r.handledByName}{r.handledAt ? ` · ${new Date(r.handledAt).toLocaleString()}` : ''}</span>}
            </div>
          ))}
        </section>
      )}
      {canManageMembers && (
        <section aria-label="Active mutes" style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ fontSize: 15 }}>Active mutes</h3>
          {mutes.length === 0 ? <span className="mc-hint">No one is muted.</span> : mutes.map((m) => (
            <div key={m.userId} className="mc-row" style={{ justifyContent: 'space-between' }}>
              <span><strong>{m.displayName}</strong> <span className="mc-muted-sub">until {new Date(m.until).toLocaleString()}{m.reason ? ` · ${m.reason}` : ''}</span></span>
              <Button size="sm" variant="secondary" loading={busy === m.userId} onClick={() => act(m.userId, () => unmuteMember(communityId, m.userId))}>Unmute</Button>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
