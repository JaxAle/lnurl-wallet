// Beobachtet übergebene Scheine, solange die Wallet offen und sichtbar ist (einloesen.ts).
// Kein eigenes Bild: meldet die Ausgabestelle einen Schein als verbraucht, wird er als
// ausgegeben markiert, und das Zählwerk zählt herunter.
import type {Component} from 'solid-js'
import {onCleanup, onMount} from 'solid-js'

import {useWallet} from '../WalletContext'
import {pruefeRunde, unterwegsIds} from './einloesen'

// Abstand der Nachfragen: oft genug, dass der Absender es während der Übergabe sieht,
// selten genug, dass die Ausgabestelle nicht belästigt wird (ein GET je Schein und Runde)
const ABSTAND_MS = 8000

const EinloeseWache: Component = () => {
  const {bearers, updateBearer, logActivity} = useWallet()
  let laeuft = false
  let uhr: ReturnType<typeof setInterval> | undefined

  const runde = async () => {
    if (laeuft || document.hidden || unterwegsIds().length === 0) return
    laeuft = true
    try {
      await pruefeRunde(bearers(), async id => {
        await updateBearer(id, {spent: true})
        // im Verlauf soll stehen, dass Geld gegangen ist — das Original kennt nur „Mark done“
        const b = bearers().find(x => x.id === id)
        if (b) {
          let stelle = ''
          try {
            stelle = new URL(b.url).host
          } catch {
            // ohne Adresse eben ohne Ausgabestelle
          }
          logActivity(
            'spent',
            `${Math.floor(b.amount / 1000).toLocaleString('de-DE')} Sats gesendet — vom Empfänger eingelöst${stelle ? ` (${stelle})` : ''}.`,
            b.label
          )
        }
      })
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

export default EinloeseWache
