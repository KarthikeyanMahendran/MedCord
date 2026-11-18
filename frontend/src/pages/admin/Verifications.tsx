import { useCallback, useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { Alert, Badge, Button, Card, CardBody, EmptyState, FormGroup, Modal, Pagination, Table, Tabs, Textarea } from '../../components/ui'
import type { Column, Tone } from '../../components/ui'
import { decideVerification, listVerifications } from '../../api/admin'
import type { Page, VerificationItem, VerificationStatus } from '../../api/admin'
import { problemMessage } from '../../api/client'

type Filter = VerificationStatus | 'ALL'
const tone: Record<VerificationStatus, Tone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger' }
const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function Verifications() {
  const [filter, setFilter] = useState<Filter>('PENDING')
  const [page, setPage] = useState(0)
  const [data, setData] = useState<Page<VerificationItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<VerificationItem | null>(null)
  const [reason, setReason] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await listVerifications(filter === 'ALL' ? undefined : filter, page))
    } catch (e) {
      setError(problemMessage(e))
    } finally {
      setLoading(false)
    }
  }, [filter, page])

  useEffect(() => { void load() }, [load])

  async function decide(item: VerificationItem, decision: 'APPROVED' | 'REJECTED', why?: string) {
    setBusyId(item.userId)
    setError(null)
    try {
      await decideVerification(item.userId, decision, why)
      setNotice(`${item.displayName} was ${decision.toLowerCase()}.`)
      setRejecting(null)
      setReason('')
      await load()
    } catch (e) {
      setError(problemMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const columns: Column<VerificationItem>[] = [
    { key: 'who', header: 'Professional', render: (r) => (<div><strong>{r.displayName}</strong><div className="mc-muted-sub">{r.email}</div></div>) },
    { key: 'spec', header: 'Specialty', render: (r) => r.specialty },
    { key: 'lic', header: 'License', render: (r) => (<div><code>{r.licenseNumber}</code><div className="mc-muted-sub">{r.licenseCountry}</div></div>) },
    { key: 'date', header: 'Submitted', render: (r) => fmt(r.submittedAt) },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={tone[r.status]}>{r.status.toLowerCase()}</Badge> },
    {
      key: 'actions', header: '', width: '190px',
      render: (r) => r.status !== 'PENDING' ? null : (
        <div className="mc-row" style={{ justifyContent: 'flex-end' }}>
          <Button size="sm" loading={busyId === r.userId} onClick={() => decide(r, 'APPROVED')} aria-label={`Approve ${r.displayName}`}><Check size={14} /> Approve</Button>
          <Button size="sm" variant="secondary" disabled={busyId === r.userId} onClick={() => { setRejecting(r); setReason('') }} aria-label={`Reject ${r.displayName}`}><X size={14} /> Reject</Button>
        </div>
      ),
    },
  ]

  return (
    <main className="mc-page mc-page-wide">
      <div>
        <h1 style={{ fontSize: 22 }}>Verification queue</h1>
        <p className="mc-hint" style={{ margin: '4px 0 0' }}>Review professional licences. Approving activates the account and grants the verified badge.</p>
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <Card>
        <CardBody>
          <Tabs<Filter> label="Filter by status" value={filter} onChange={(f) => { setFilter(f); setPage(0); setNotice(null) }}
            items={[{ value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }, { value: 'ALL', label: 'All' }]} />
          <Table columns={columns} rows={data?.items ?? []} rowKey={(r) => r.userId} loading={loading}
            empty={<EmptyState title="Nothing here">No requests match this filter.</EmptyState>} />
          <Pagination page={page} totalPages={data?.totalPages ?? 0} onChange={setPage} />
        </CardBody>
      </Card>

      <Modal isOpen={rejecting !== null} onClose={() => setRejecting(null)} title={`Reject ${rejecting?.displayName ?? ''}`} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button>
          <Button variant="danger" loading={busyId !== null} disabled={!reason.trim()} onClick={() => rejecting && decide(rejecting, 'REJECTED', reason)}>Reject</Button>
        </>}>
        <FormGroup id="reason" label="Reason (shown to the user and kept in the audit log)" hint="Required">
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. License number could not be verified" />
        </FormGroup>
      </Modal>
    </main>
  )
}
