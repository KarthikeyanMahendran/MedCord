import { useNavigate } from 'react-router-dom'
import { MessageCircle, X } from 'lucide-react'
import { useRealtime } from '../../context/RealtimeContext'
import { Button } from '../ui'

export function ToastStack() {
  const navigate = useNavigate()
  const { toasts, dismissToast } = useRealtime()
  if (toasts.length === 0) return null

  return (
    <div className="mc-toast-stack" aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className="mc-toast" role="status">
          <button
            type="button"
            className="mc-toast-main"
            onClick={() => {
              dismissToast(t.id)
              if (t.communityId) navigate(`/communities/${t.communityId}/channels/${t.channelId}`)
              else navigate(`/messages/${t.channelId}`)
            }}
          >
            <div className="mc-toast-head">
              {t.kind === 'MENTION' ? (
                <>
                  <span aria-hidden="true">📢</span>
                  <strong>Mentioned in {t.channelName ? `#${t.channelName}` : 'channel'}</strong>
                  <span className="mc-muted-sub">by {t.authorName}</span>
                </>
              ) : (
                <>
                  <MessageCircle size={13} />
                  <strong>Direct message 💬 from {t.authorName}</strong>
                </>
              )}
            </div>
            <div className="mc-toast-body">{t.excerpt}</div>
          </button>
          <Button variant="icon" size="sm" aria-label="Dismiss notification" onClick={() => dismissToast(t.id)}>
            <X size={13} />
          </Button>
        </div>
      ))}
    </div>
  )
}
