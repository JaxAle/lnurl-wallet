// Führt angestoßene Zahlungen zu Ende (bezahlwache.ts) — solange die Wallet offen und sichtbar ist, wie die
// Einlöse-Wache; kein eigenes Bild.
import type {Component} from 'solid-js'
import {onCleanup, onMount} from 'solid-js'

import {useWallet} from '../WalletContext'
import {istZahlung, pruefeZahlung} from './bezahlwache'

const ABSTAND_MS = 10_000

const Bezahlwache: Component = () => {
  const {bearers, updateBearer, removeBearer, logActivity} = useWallet()
  let laeuft = false
  let uhr: ReturnType<typeof setInterval> | undefined

  const runde = async () => {
    if (laeuft || document.hidden) return
    const offen = bearers().filter(istZahlung)
    if (offen.length === 0) return
    laeuft = true
    try {
      for (const b of offen)
        await pruefeZahlung(b, {updateBearer, removeBearer, logActivity})
    } finally {
      laeuft = false
    }
  }

  onMount(() => {
    void runde()
    uhr = setInterval(() => void runde(), ABSTAND_MS)
    document.addEventListener('visibilitychange', runde)
  })
  onCleanup(() => {
    if (uhr) clearInterval(uhr)
    document.removeEventListener('visibilitychange', runde)
  })

  return null
}

export default Bezahlwache
