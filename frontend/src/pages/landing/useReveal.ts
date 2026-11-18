import { useEffect, useRef, useState } from 'react'

/** Adds `is-in` to an element once it scrolls into view. */
export function useReveal<T extends HTMLElement>(threshold = 0.18) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect() } }, { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [seen, threshold])
  return [ref, seen] as const
}

/** Counts from 0 to `to` once `start` is true. */
export function useCount(to: number, start: boolean, ms = 1400) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!start) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(to); return }
    let raf = 0; const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, start, ms])
  return n
}
