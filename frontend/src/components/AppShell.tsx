import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { heartbeat } from '../api/dms'
import { ServerRail } from './shell/ServerRail'
import { SideColumn } from './shell/SideColumn'
import { CallOverlay } from './call/CallOverlay'
import { CallProvider } from '../context/CallContext'
import { MedCordAiWidget } from './ai/MedCordAiWidget'

/** Discord-style frame: server rail | contextual sidebar | content. */
export function AppShell() {
  // Presence: tell the server we're here every 30s while the tab is visible.
  useEffect(() => {
    const beat = () => { if (document.visibilityState !== 'hidden') heartbeat().catch(() => undefined) }
    beat()
    const t = setInterval(beat, 30000)
    document.addEventListener('visibilitychange', beat)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', beat) }
  }, [])

  return (
    <CallProvider>
      <div className="mc-shell">
        <ServerRail />
        <SideColumn />
        <div className="mc-content"><Outlet /></div>
        <MedCordAiWidget />
      </div>
      <CallOverlay />
    </CallProvider>
  )
}
