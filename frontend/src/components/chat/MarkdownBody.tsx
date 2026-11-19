import { Fragment } from 'react'
import type { ReactNode } from 'react'

/**
 * XSS-safe Markdown renderer built purely with React elements (no dangerouslySetInnerHTML).
 * Supports headings, bold, italic, strikethrough, inline code, fenced code blocks, blockquotes,
 * ordered/unordered lists, GFM tables (great for lab panels), safe http/https links, and @mentions.
 */
export function MarkdownBody({ text, suffix }: { text: string; suffix?: ReactNode }) {
  const blocks = parseBlocks(text)
  return (
    <div className="mc-md">
      {blocks.map((block, i) => {
        const isLast = i === blocks.length - 1
        return <Fragment key={i}>{renderBlock(block, isLast ? suffix : undefined)}</Fragment>
      })}
    </div>
  )
}

type Block =
  | { type: 'code'; lang: string; content: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'quote'; lines: string[] }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; lines: string[] }

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') { i++; continue }

    // Fenced code block ```
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // consume closing ```
      out.push({ type: 'code', lang, content: codeLines.join('\n') })
      continue
    }

    // GFM Table: header row + separator row (|---|---|)
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])) {
      const headers = splitTableRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitTableRow(lines[i]))
        i++
      }
      out.push({ type: 'table', headers, rows })
      continue
    }

    // Heading (#, ##, ###)
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      out.push({ type: 'heading', level: heading[1].length, text: heading[2] })
      i++
      continue
    }

    // Blockquote (> ...)
    if (/^\s*>\s?/.test(line)) {
      const qLines: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        qLines.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      out.push({ type: 'quote', lines: qLines })
      continue
    }

    // Unordered list (- or *)
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      out.push({ type: 'ul', items })
      continue
    }

    // Ordered list (1. )
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      out.push({ type: 'ol', items })
      continue
    }

    // Paragraph (consecutive plain lines)
    const pLines: string[] = []
    while (
      i < lines.length
      && lines[i].trim() !== ''
      && !lines[i].trimStart().startsWith('```')
      && !/^(#{1,3})\s+/.test(lines[i])
      && !/^\s*>\s?/.test(lines[i])
      && !/^\s*[-*]\s+/.test(lines[i])
      && !/^\s*\d+\.\s+/.test(lines[i])
      && !(lines[i].includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1]))
    ) {
      pLines.push(lines[i])
      i++
    }
    out.push({ type: 'paragraph', lines: pLines })
  }

  return out
}

function splitTableRow(row: string): string[] {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((c) => c.trim())
}

function renderBlock(block: Block, suffix?: ReactNode): ReactNode {
  switch (block.type) {
    case 'code':
      return (
        <pre className="mc-md-pre">
          {block.lang && <span className="mc-md-lang">{block.lang}</span>}
          <code>{block.content}</code>
          {suffix}
        </pre>
      )
    case 'table':
      return (
        <div className="mc-md-table-wrap">
          <table className="mc-md-table">
            <thead>
              <tr>{block.headers.map((h, idx) => <th key={idx}>{renderInline(h)}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((r, ri) => (
                <tr key={ri}>{block.headers.map((_, ci) => <td key={ci}>{renderInline(r[ci] ?? '')}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {suffix}
        </div>
      )
    case 'heading': {
      const Tag = block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5'
      return <Tag className="mc-md-h">{renderInline(block.text)}{suffix}</Tag>
    }
    case 'quote':
      return (
        <blockquote className="mc-md-quote">
          {block.lines.map((l, idx) => (
            <Fragment key={idx}>
              {idx > 0 && <br />}
              {renderInline(l)}
            </Fragment>
          ))}
          {suffix}
        </blockquote>
      )
    case 'ul':
      return (
        <ul className="mc-md-list">
          {block.items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}{idx === block.items.length - 1 ? suffix : null}</li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol className="mc-md-list">
          {block.items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}{idx === block.items.length - 1 ? suffix : null}</li>
          ))}
        </ol>
      )
    case 'paragraph':
      return (
        <p className="mc-md-p">
          {block.lines.map((l, idx) => (
            <Fragment key={idx}>
              {idx > 0 && <br />}
              {renderInline(l)}
            </Fragment>
          ))}
          {suffix}
        </p>
      )
  }
}

// Inline tokenizer: `code`, **bold**, *italic*, ~~strike~~, [label](https://...), bare https://..., @mentions
const INLINE_RE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\*[^*\n]+\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<)]+|@(?:everyone|Dr\.\s+[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?|[A-Za-z][A-Za-z0-9._'-]*(?:\s+[A-Z][A-Za-z'-]*)?))/g

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  const re = new RegExp(INLINE_RE.source, 'g')

  while ((match = re.exec(text)) !== null) {
    const start = match.index
    const token = match[0]
    if (start > last) nodes.push(text.slice(last, start))

    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(<code key={key++} className="mc-md-code">{token.slice(1, -1)}</code>)
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={key++}>{renderInline(token.slice(2, -2))}</strong>)
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      nodes.push(<del key={key++}>{renderInline(token.slice(2, -2))}</del>)
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(<em key={key++}>{renderInline(token.slice(1, -1))}</em>)
    } else if (token.startsWith('[')) {
      const m = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/)
      if (m) {
        nodes.push(<a key={key++} href={m[2]} target="_blank" rel="noopener noreferrer" className="mc-md-link">{m[1]}</a>)
      } else {
        nodes.push(token)
      }
    } else if (token.startsWith('http://') || token.startsWith('https://')) {
      nodes.push(<a key={key++} href={token} target="_blank" rel="noopener noreferrer" className="mc-md-link">{token}</a>)
    } else if (token.startsWith('@')) {
      const prevChar = start > 0 ? text[start - 1] : ''
      if (prevChar && /[A-Za-z0-9]/.test(prevChar)) {
        // Likely an email address like priya@medcord.dev — keep plain text
        nodes.push(token)
      } else {
        const lower = token.toLowerCase()
        const isEveryone = lower === '@everyone'
        const isAi = lower === '@ai' || lower === '@copilot'
        nodes.push(
          <span
            key={key++}
            className={`mc-mention ${isEveryone ? 'is-everyone' : ''} ${isAi ? 'is-ai' : ''}`.trim()}
          >
            {token}
          </span>
        )
      }
    } else {
      nodes.push(token)
    }
    last = start + token.length
  }

  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}
