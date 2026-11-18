import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, CardBody } from '../components/ui'
import { joinInvite, previewInvite } from '../api/communities'
import type { InvitePreview } from '../api/communities'
import { problemMessage } from '../api/client'

export default function JoinInvite() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { previewInvite(code).then(setPreview).catch((e) => setError(problemMessage(e))) }, [code])

  async function join() {
    setBusy(true); setError(null)
    try { const c = await joinInvite(code); navigate(`/communities/${c.id}`, { replace: true }) }
    catch (e) { setError(problemMessage(e)) } finally { setBusy(false) }
  }

  return (
    <main className="mc-page" style={{ maxWidth: 520 }}>
      <Card><CardBody style={{ display: 'grid', gap: 12 }}>
        {error && <Alert tone="danger">{error}</Alert>}
        {preview ? (<>
          <h1 style={{ fontSize: 22 }}>You're invited to {preview.communityName}</h1>
          {preview.description && <p className="mc-hint" style={{ margin: 0 }}>{preview.description}</p>}
          <span className="mc-muted-sub">{preview.memberCount} members</span>
          {preview.valid ? <Button onClick={join} loading={busy}>Accept invite</Button> : <Alert tone="danger">This invite is expired, revoked or fully used.</Alert>}
        </>) : !error && <div className="mc-skeleton" style={{ height: 60 }} />}
        <Link to="/communities">Back to communities</Link>
      </CardBody></Card>
    </main>
  )
}
