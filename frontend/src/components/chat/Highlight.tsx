const START = ''
const END = ''

/** Renders a server snippet where matches are wrapped in private-use sentinels. Plain text only: no HTML is ever injected. */
export function Highlight({ text }: { text: string }) {
  const parts: { t: string; hit: boolean }[] = []
  let hit = false
  for (const chunk of text.split(new RegExp(`([${START}${END}])`))) {
    if (chunk === START) { hit = true; continue }
    if (chunk === END) { hit = false; continue }
    if (chunk) parts.push({ t: chunk, hit })
  }
  return <>{parts.map((p, i) => (p.hit ? <mark key={i} className="mc-mark">{p.t}</mark> : <span key={i}>{p.t}</span>))}</>
}
