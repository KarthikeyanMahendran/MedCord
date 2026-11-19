/** The MedCord logo: an M with a medical cross, circled by an orbit that stands for the connection between village and doctor. */
export function LogoMark({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <img src="/medcord-logo.png" width={size} height={size} alt={title ?? ''} aria-hidden={title ? undefined : true} draggable={false} style={{ display: 'block', objectFit: 'contain' }} />
  )
}
