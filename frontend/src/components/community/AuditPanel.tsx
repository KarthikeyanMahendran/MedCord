import { useEffect, useState } from 'react'
import { Alert, Badge, EmptyState, Pagination } from '../ui'
import { listAudit } from '../../api/moderation'
import type { AuditPage } from '../../api/moderation'
import { problemMessage } from '../../api/client'

const FILTERS = ['', 'MEMBER_MUTED', 'MEMBER_BANNED', 'MEMBER_REMOVED', 'MESSAGE_DELETED_BY_MOD', 'ROLES_ASSIGNED', 'ROLE_CREATED', 'CHANNEL_CREATED', 'REPORT_RESOLVED']

export function AuditPanel({ communityId }: { communityId: string }) {
  const [page, setPage] = useState(0)
  const [action, setAction] = useState('')
  const [data, setData] = useState<AuditPage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    listAudit(communityId, page, action).then((d) => { if (alive) { setData(d); setError(null) } }).catch((e) => alive && setError(problemMessage(e)))
    return () => { alive = false }
  }, [communityId, page, action])

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="mc-row" style={{ justifyContent: 'space-between' }}>
        <span className="mc-hint">Every sensitive action is recorded and cannot be edited or removed.</span>
        <select className="mc-input" style={{ width: 240 }} aria-label="Filter by action" value={action} onChange={(e) => { setAction(e.target.value); setPage(0) }}>
          {FILTERS.map((f) => <option key={f} value={f}>{f ? f.toLowerCase().replace(/_/g, ' ') : 'All actions'}</option>)}
        </select>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {data && data.items.length === 0 ? <EmptyState title="No audit entries" /> : (
        <div className="mc-table-wrap"><table className="mc-table">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>{data?.items.map((a) => (
            <tr key={a.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{new Date(a.createdAt).toLocaleString()}</td>
              <td>{a.actorName}</td>
              <td><Badge tone="neutral">{a.action.toLowerCase().replace(/_/g, ' ')}</Badge></td>
              <td>{a.summary}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      <Pagination page={page} totalPages={data?.totalPages ?? 0} onChange={setPage} />
    </div>
  )
}
