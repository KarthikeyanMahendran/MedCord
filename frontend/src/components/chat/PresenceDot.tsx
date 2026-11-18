export function PresenceDot({ online }: { online: boolean }) {
  return <span className={`mc-presence ${online ? 'is-online' : ''}`} role="img" aria-label={online ? 'Online' : 'Offline'} />
}
