import { useState } from 'react'
import { ClipboardList, FileText, ShieldCheck, Sparkles, Stethoscope, X } from 'lucide-react'
import type { CopilotMode } from '../../api/copilot'
import { Button } from '../ui'

interface Props {
  busy: boolean
  onInvoke: (mode: CopilotMode, prompt?: string) => Promise<void>
  onClose: () => void
}

const PRESETS: { mode: CopilotMode; label: string; desc: string; icon: typeof Sparkles }[] = [
  { mode: 'SUMMARIZE', label: 'Summarize Case Discussion', desc: 'Key clinical concepts, vitals/labs & open questions', icon: FileText },
  { mode: 'HANDOFF', label: 'Generate SBAR Shift Handoff', desc: 'Situation, Background, Assessment & Recommendation table', icon: ClipboardList },
  { mode: 'DIFFERENTIAL', label: 'Differential & Workup Checklist', desc: 'Can’t-miss diagnoses and immediate bedside workup', icon: Stethoscope },
]

/**
 * Quick launcher for the live streaming AI Clinical Co-Pilot (SSE + Nexconn StreamMessage).
 */
export function CopilotPopover({ busy, onInvoke, onClose }: Props) {
  const [question, setQuestion] = useState('')

  async function submitQuestion() {
    const q = question.trim()
    if (!q || busy) return
    setQuestion('')
    await onInvoke('ASK', q)
  }

  return (
    <div className="mc-copilot-pop" role="dialog" aria-label="Clinical Co-Pilot">
      <div className="mc-copilot-head">
        <div className="mc-row" style={{ gap: 6 }}>
          <Sparkles size={15} className="mc-copilot-icon" />
          <strong>MedCord Clinical Co-Pilot</strong>
          <span className="mc-att-exif"><ShieldCheck size={10} /> PHI scrubbed</span>
        </div>
        <Button variant="icon" size="sm" aria-label="Close Co-Pilot" onClick={onClose}><X size={14} /></Button>
      </div>
      <div className="mc-copilot-sub">
        Streams real-time clinical synthesis into this conversation via live StreamMessage.
      </div>
      <div className="mc-copilot-presets">
        {PRESETS.map((p) => {
          const Icon = p.icon
          return (
            <button key={p.mode} type="button" className="mc-copilot-opt" disabled={busy}
              onClick={() => void onInvoke(p.mode)}>
              <Icon size={15} className="mc-copilot-icon" />
              <span>
                <strong>{p.label}</strong>
                <small>{p.desc}</small>
              </span>
            </button>
          )
        })}
      </div>
      <div className="mc-copilot-ask">
        <input
          type="text"
          className="mc-input"
          aria-label="Ask Clinical Co-Pilot"
          placeholder="Ask a de-identified clinical question…"
          value={question}
          disabled={busy}
          maxLength={1000}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitQuestion() } }}
        />
        <Button size="sm" loading={busy} disabled={!question.trim()} onClick={submitQuestion}>
          <Sparkles size={13} /> Ask
        </Button>
      </div>
    </div>
  )
}
