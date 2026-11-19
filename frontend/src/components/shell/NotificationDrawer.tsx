import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AtSign, Bell, BellOff, Moon, Settings } from 'lucide-react'
import { listMentions } from '../../api/notifications'
import type { MentionItem } from '../../api/notifications'
import { problemMessage } from '../../api/client'
import { useRealtime } from '../../context/RealtimeContext'
import { Alert, Badge, Button, EmptyState, FormGroup, Input, Modal, Tabs } from '../ui'

type Tab = 'mentions' | 'prefs'

export function NotificationDrawer() {
  const navigate = useNavigate()
  const { drawerOpen, setDrawerOpen, prefs, savePrefs, refreshPrefs, markRead } = useRealtime()
  const [tab, setTab] = useState<Tab>('mentions')
  const [mentions, setMentions] = useState<MentionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState<string | null>(null)

  const [dndEnabled, setDndEnabled] = useState(false)
  const [dndStart, setDndStart] = useState('')
  const [dndEnd, setDndEnd] = useState('')
  const [showToasts, setShowToasts] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadMentions = useCallback(async () => {
    setLoading(true)
    try {
      setMentions(await listMentions(50))
      setError(null)
    } catch (e) {
      setError(problemMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!drawerOpen) return
    setSavedNotice(null)
    void loadMentions()
    void refreshPrefs()
  }, [drawerOpen, loadMentions, refreshPrefs])

  useEffect(() => {
    if (!prefs) return
    setDndEnabled(prefs.dndEnabled)
    setDndStart(prefs.dndStart ?? '')
    setDndEnd(prefs.dndEnd ?? '')
    setShowToasts(prefs.showToasts)
  }, [prefs])

  async function onSavePrefs() {
    setSaving(true); setError(null); setSavedNotice(null)
    try {
      await savePrefs({
        dndEnabled,
        dndStart: dndStart.trim() ? dndStart.trim() : null,
        dndEnd: dndEnd.trim() ? dndEnd.trim() : null,
        showToasts,
      })
      setSavedNotice('Notification preferences saved.')
    } catch (e) {
      setError(problemMessage(e))
    } finally {
      setSaving(false)
    }
  }

  function openMention(m: MentionItem) {
    void markRead(m.channelId, m.messageId)
    setDrawerOpen(false)
    if (m.communityId) navigate(`/communities/${m.communityId}/channels/${m.channelId}`)
    else navigate(`/messages/${m.channelId}`)
  }

  return (
    <Modal isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title="Notifications" size="md">
      <div style={{ display: 'grid', gap: 14 }}>
        <Tabs<Tab>
          label="Notification sections"
          items={[
            { value: 'mentions', label: 'Mentions' },
            { value: 'prefs', label: 'DND & Quiet hours' },
          ]}
          value={tab}
          onChange={(t) => { setTab(t); setSavedNotice(null) }}
        />

        {error && <Alert tone="danger">{error}</Alert>}
        {savedNotice && <Alert tone="success">{savedNotice}</Alert>}

        {tab === 'mentions' && (
          <div className="mc-notif-list">
            {loading && <div className="mc-skeleton" style={{ height: 64 }} />}
            {!loading && mentions.length === 0 && (
              <EmptyState title="No mentions yet" icon={<AtSign size={18} />}>
                When colleagues mention you with @name, @role, or @everyone, they will appear here.
              </EmptyState>
            )}
            {!loading && mentions.map((m) => (
              <button key={m.id} type="button" className={`mc-notif-item ${m.unread ? 'is-unread' : ''}`} onClick={() => openMention(m)}>
                <div className="mc-row" style={{ justifyContent: 'space-between', width: '100%' }}>
                  <div className="mc-row" style={{ gap: 6 }}>
                    <Badge tone={m.mentionKind === 'EVERYONE' ? 'warning' : 'info'}>{m.label}</Badge>
                    <strong style={{ fontSize: 13 }}>{m.authorName}</strong>
                    <span className="mc-muted-sub">📢 Mentioned in {m.communityName ? `${m.communityName} · #${m.channelName}` : (m.channelName || 'Direct message')}</span>
                  </div>
                  <span className="mc-muted-sub">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="mc-notif-excerpt">{m.excerpt}</div>
              </button>
            ))}
          </div>
        )}

        {tab === 'prefs' && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="mc-pref-row">
              <div>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {dndEnabled ? <BellOff size={15} /> : <Bell size={15} />} Do Not Disturb
                </strong>
                <div className="mc-muted-sub">Suppresses live pop-up toasts while keeping unread badges and mentions intact.</div>
              </div>
              <input type="checkbox" aria-label="Enable Do Not Disturb" checked={dndEnabled} onChange={(e) => setDndEnabled(e.target.checked)} />
            </div>

            <div className="mc-pref-row">
              <div>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Settings size={15} /> In-app toast notifications
                </strong>
                <div className="mc-muted-sub">Show brief corner alerts for incoming mentions and direct messages.</div>
              </div>
              <input type="checkbox" aria-label="Show in-app toasts" checked={showToasts} onChange={(e) => setShowToasts(e.target.checked)} />
            </div>

            <div style={{ display: 'grid', gap: 8, paddingTop: 4, borderTop: '1px solid var(--mc-border)' }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <Moon size={14} /> On-call quiet hours (UTC, HH:MM)
              </strong>
              <div className="mc-grid-2">
                <FormGroup id="dnd-start" label="Quiet start">
                  <Input id="dnd-start" type="time" value={dndStart} onChange={(e) => setDndStart(e.target.value)} />
                </FormGroup>
                <FormGroup id="dnd-end" label="Quiet end">
                  <Input id="dnd-end" type="time" value={dndEnd} onChange={(e) => setDndEnd(e.target.value)} />
                </FormGroup>
              </div>
              {prefs?.dndActiveNow && <Badge tone="warning">DND is currently active</Badge>}
            </div>

            <div className="mc-row" style={{ justifyContent: 'flex-end' }}>
              <Button onClick={onSavePrefs} loading={saving}>Save preferences</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
