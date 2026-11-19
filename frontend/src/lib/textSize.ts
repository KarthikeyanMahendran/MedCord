/** Large-text mode for seniors and anyone who finds small type hard to read. Remembered on this device. */
export type TextSize = 'normal' | 'large' | 'xlarge'
const KEY = 'mc_text_size'
export const SIZES: { id: TextSize; label: string }[] = [{ id: 'normal', label: 'Normal' }, { id: 'large', label: 'Large' }, { id: 'xlarge', label: 'Extra large' }]

export function savedTextSize(): TextSize {
  try { const v = localStorage.getItem(KEY); if (v === 'large' || v === 'xlarge') return v } catch { /* storage blocked */ }
  return 'normal'
}

export function applyTextSize(size: TextSize) {
  document.documentElement.dataset.text = size
  try { localStorage.setItem(KEY, size) } catch { /* storage blocked */ }
}
