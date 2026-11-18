export interface TabItem<T extends string> { value: T; label: string; count?: number }

export function Tabs<T extends string>({ items, value, onChange, label }: {
  items: TabItem<T>[]; value: T; onChange: (v: T) => void; label: string
}) {
  return (
    <div className="mc-tabs" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button key={t.value} role="tab" aria-selected={t.value === value} className={`mc-tab ${t.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(t.value)} type="button">
          {t.label}{t.count !== undefined && <span className="mc-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}
