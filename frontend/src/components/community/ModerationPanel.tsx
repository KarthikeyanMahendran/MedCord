import { useCallback, useEffect, useState } from 'react'
import { Check, Plus, ShieldCheck, Trash2, X } from 'lucide-react'
import { Alert, Badge, Button, EmptyState, Tabs } from '../ui'
import { listMutes, listReports, resolveReport, unmuteMember } from '../../api/moderation'
import type { Mute, Report, ReportStatus } from '../../api/moderation'
import { addBlockedTerm, getSafetyPolicy, removeBlockedTerm, updateSafetyPolicy } from '../../api/safety'
import type { PhiMode, SafetyPolicy } from '../../api/safety'
import { problemMessage } from '../../api/client'

const reasonLabel: Record<string, string> = { PHI: 'Patient info', HARASSMENT: 'Harassment', MISINFORMATION: 'Misinformation', SPAM: 'Spam', OTHER: 'Other' }
type Filter = ReportStatus | 'ALL'

export function ModerationPanel({ communityId, canModerate, canManageMembers, canManageCommunity = false }: {
  communityId: string
  canModerate: boolean
  canManageMembers: boolean
  canManageCommunity?: boolean
}) {
  const [filter, setFilter] = useState<Filter>('OPEN')
  const [reports, setReports] = useState<Report[]>([])
  const [mutes, setMutes] = useState<Mute[]>([])
  const [safety, setSafety] = useState<SafetyPolicy | null>(null)
  const [newTerm, setNewTerm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      if (canModerate) setReports(await listReports(communityId, filter === 'ALL' ? undefined : filter))
      if (canManageMembers) setMutes(await listMutes(communityId))
      if (canModerate || canManageCommunity) {
        getSafetyPolicy(communityId).then(setSafety).catch(() => undefined)
      }
      setError(null)
    } catch (e) { setError(problemMessage(e)) }
  }, [communityId, filter, canModerate, canManageMembers, canManageCommunity])

  useEffect(() => { void load() }, [load])

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id)
    try { await fn(); await load() } catch (e) { setError(problemMessage(e)) } finally { setBusy(null) }
  }

  async function savePolicy(phiMode: PhiMode, autoRedact: boolean) {
    setBusy('safety-policy')
    try {
      setSafety(await updateSafetyPolicy(communityId, { phiMode, autoRedact }))
      setError(null)
    } catch (e) { setError(problemMessage(e)) } finally { setBusy(null) }
  }

  async function submitTerm() {
    const clean = newTerm.trim()
    if (clean.length < 2) return
    setBusy('safety-term')
    try {
      const created = await addBlockedTerm(communityId, clean)
      setNewTerm('')
      setSafety((prev) => prev ? { ...prev, blockedTerms: [created, ...prev.blockedTerms] } : prev)
      setError(null)
    } catch (e) { setError(problemMessage(e)) } finally { setBusy(null) }
  }

  async function deleteTerm(termId: string) {
    setBusy(termId)
    try {
      await removeBlockedTerm(communityId, termId)
      setSafety((prev) => prev ? { ...prev, blockedTerms: prev.blockedTerms.filter((t) => t.id !== termId) } : prev)
      setError(null)
    } catch (e) { setError(problemMessage(e)) } finally { setBusy(null) }
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
      {safety && (canModerate || canManageCommunity) && (
        <section aria-label="Clinical Privacy Shield" className="mc-rev" style={{ display: 'grid', gap: 12 }}>
          <div className="mc-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div className="mc-row" style={{ gap: 6 }}>
              <ShieldCheck size={16} style={{ color: 'var(--mc-success)' }} />
              <h3 style={{ fontSize: 15, margin: 0 }}>Clinical Privacy Shield &amp; Nexconn Safety</h3>
            </div>
            <Badge tone={safety.nexconnModerationEnabled ? 'success' : 'neutral'}>
              {safety.nexconnModerationEnabled ? 'Nexconn Filter Connected' : 'Local PHI Shield Active'}
            </Badge>
          </div>
          {canManageCommunity && (
            <div className="mc-row" style={{ flexWrap: 'wrap', gap: 10 }}>
              <label className="mc-row" style={{ gap: 6, fontSize: 13 }}>
                <span>PHI Guardrail:</span>
                <select className="mc-input" aria-label="PHI guardrail mode" value={safety.phiMode} disabled={busy === 'safety-policy'}
                  onChange={(e) => void savePolicy(e.target.value as PhiMode, safety.autoRedact)}>
                  <option value="WARN">Warn before send (Recommended)</option>
                  <option value="STRICT_BLOCK">Strict Block (422 on raw PHI)</option>
                  <option value="OFF">Off</option>
                </select>
              </label>
              <label className="mc-row" style={{ gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={safety.autoRedact} disabled={busy === 'safety-policy'}
                  onChange={(e) => void savePolicy(safety.phiMode, e.target.checked)} />
                <span>Auto-redact detected PHI on send</span>
              </label>
            </div>
          )}
          {canModerate && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="mc-muted-sub">Custom restricted terms (hospital/ward names, trial codes — synced to Nexconn moderation when connected):</div>
              <div className="mc-row" style={{ gap: 8 }}>
                <input className="mc-input" placeholder="e.g. St. Jude Ward 4B" value={newTerm} maxLength={120}
                  onChange={(e) => setNewTerm(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitTerm() } }} />
                <Button size="sm" loading={busy === 'safety-term'} disabled={newTerm.trim().length < 2} onClick={submitTerm}>
                  <Plus size={14} /> Add term
                </Button>
              </div>
              {safety.blockedTerms.length > 0 && (
                <div className="mc-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {safety.blockedTerms.map((t) => (
                    <span key={t.id} className="mc-pending-att">
                      <span>{t.term}</span>
                      {t.syncedToNexconn && <Badge tone="success">Nexconn</Badge>}
                      <button type="button" className="mc-pending-att-rm" aria-label={`Remove ${t.term}`}
                        disabled={busy === t.id} onClick={() => void deleteTerm(t.id)}><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
