import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bot, Sparkles, X, Send, RotateCcw, Hash, ExternalLink, ChevronRight } from 'lucide-react'
import { askMedCordAi, type AiCitation } from '../../api/ai'
import { VerifiedMark } from '../ui'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: AiCitation[]
}

const STARTER_PROMPTS = [
  'What topics have doctors discussed recently?',
  'Can you summarize what our doctors discussed about treatments?',
  'Has anyone shared recent medical research in our channels?',
]

export function MedCordAiWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  // Detect if user is currently inside a specific community or channel
  const communityMatch = location.pathname.match(/\/communities\/([0-9a-fA-F-]+)/)
  const activeCommunityId = communityMatch ? communityMatch[1] : undefined
  const channelMatch = location.pathname.match(/\/channels\/([0-9a-fA-F-]+)/)
  const activeChannelId = channelMatch ? channelMatch[1] : undefined

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  const handleSend = async (questionText?: string) => {
    const text = (questionText || input).trim()
    if (!text || loading) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    }

    setMessages((prev) => [...prev, userMsg])
    if (!questionText) setInput('')
    setLoading(true)

    try {
      const res = await askMedCordAi(text, activeCommunityId, activeChannelId)
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: res.answer,
        citations: res.citations,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Unable to query knowledge base right now. Please verify your connection or try again shortly.',
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setMessages([])
  }

  return (
    <>
      {/* Floating Launcher Button */}
      {/* Floating Launcher Button */}
      <button
        type="button"
        className={`mc-ai-launcher ${isOpen ? 'is-active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open MedCord AI Assistant"
        title="MedCord AI Knowledge Assistant"
      >
        <div className="mc-ai-launcher-icon-wrap">
          <Sparkles size={16} className="mc-ai-sparkle-anim" />
        </div>
        <span className="mc-ai-launcher-text">MedCord AI</span>
        <span className="mc-ai-launcher-badge" />
      </button>

      {/* Floating Chat Window */}
      {isOpen && (
        <div className="mc-ai-window" role="dialog" aria-label="MedCord AI Chat">
          {/* Header */}
          <div className="mc-ai-header">
            <div className="mc-ai-header-left">
              <div className="mc-ai-icon-wrap">
                <Bot size={18} />
              </div>
              <div className="mc-ai-title">
                <strong>MedCord AI</strong>
                <span>Community Knowledge Assistant</span>
              </div>
            </div>
            <div className="mc-ai-header-actions">
              {messages.length > 0 && (
                <button
                  type="button"
                  className="mc-ai-btn-icon"
                  onClick={handleClear}
                  title="Clear conversation"
                  aria-label="Clear conversation"
                >
                  <RotateCcw size={15} />
                </button>
              )}
              <button
                type="button"
                className="mc-ai-btn-icon"
                onClick={() => setIsOpen(false)}
                title="Close assistant"
                aria-label="Close assistant"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="mc-ai-messages">
            {messages.length === 0 ? (
              <div className="mc-ai-welcome">
                <h4>Hello, Doctor!</h4>
                <p>
                  I understand the discussions and shared knowledge available to your account.
                  Ask me anything about them.
                </p>
                <div className="mc-ai-suggestions">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="mc-ai-suggestion-chip"
                      onClick={() => handleSend(prompt)}
                    >
                      <span>{prompt}</span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`mc-ai-msg ${m.role}`}>
                  <div className="mc-ai-bubble">{m.content}</div>

                  {/* Source Reference Citations */}
                  {m.citations && m.citations.length > 0 && (
                    <div className="mc-ai-citations">
                      <span className="mc-ai-citation-title">Source Discussions</span>
                      {m.citations.map((cite, idx) => {
                        const isDm = !cite.communityId || cite.channelName === 'dm'
                        const toUrl = isDm
                          ? `/messages/${cite.channelId}`
                          : `/communities/${cite.communityId}/channels/${cite.channelId}`
                        const authorDisplay = cite.authorName.startsWith('Dr.')
                          ? cite.authorName
                          : `Dr. ${cite.authorName}`

                        return (
                          <Link
                            key={cite.channelId + idx}
                            to={toUrl}
                            className="mc-ai-citation-card"
                            onClick={() => setIsOpen(false)}
                          >
                            <div className="mc-ai-citation-meta">
                              <span className="mc-ai-citation-chan">
                                <Hash size={13} />
                                {cite.channelName} {cite.communityName ? `· ${cite.communityName}` : ''}
                              </span>
                              <ExternalLink size={12} />
                            </div>
                            <div className="mc-ai-citation-author">
                              {authorDisplay} <VerifiedMark />
                            </div>
                            <div className="mc-ai-citation-snippet">&ldquo;{cite.snippet}&rdquo;</div>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))
            )}

            {loading && (
              <div className="mc-ai-msg assistant">
                <div className="mc-ai-bubble mc-ai-loading-bubble">
                  <div className="mc-ai-loading-indicator">
                    <div className="mc-ai-loading-icon-pulse">
                      <Sparkles size={13} className="mc-ai-sparkle-spin" />
                    </div>
                    <span className="mc-ai-loading-text">Synthesizing clinical discussions</span>
                    <div className="mc-ai-typing-dots">
                      <span className="mc-ai-dot" />
                      <span className="mc-ai-dot" />
                      <span className="mc-ai-dot" />
                    </div>
                  </div>
                  <div className="mc-ai-loading-bar">
                    <div className="mc-ai-loading-shimmer" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input */}
          <div className="mc-ai-footer">
            <form
              className="mc-ai-form"
              onSubmit={(e) => {
                e.preventDefault()
                void handleSend()
              }}
            >
              <input
                type="text"
                className="mc-ai-input"
                placeholder="Ask anything about community discussions..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
              />
              <button
                type="submit"
                className="mc-ai-send-btn"
                disabled={!input.trim() || loading}
                aria-label="Send query"
              >
                <Send size={15} />
              </button>
            </form>
            <div className="mc-ai-disclaimer">
              AI-generated information · Verify medical information independently.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
