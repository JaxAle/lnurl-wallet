// Beobachtet übergebene Scheine, solange die Wallet offen und sichtbar ist (einloesen.ts).
// Kein eigenes Bild: meldet die Ausgabestelle einen Schein als verbraucht, verschwindet er aus der
// Wallet (der Verlauf behält „gesendet“), und das Zählwerk zählt herunter.
import type {Component} from 'solid-js'
import {onCleanup, onMount} from 'solid-js'

import {useWallet} from '../WalletContext'
import {pruefeRunde, unterwegsIds} from './einloesen'

// Abstand der Nachfragen: oft genug, dass der Absender es während der Übergabe sieht,
// selten genug, dass die Ausgabestelle nicht belästigt wird (ein GET je Schein und Runde)
const ABSTAND_MS = 8000

const EinloeseWache: Component = () => {
  const {bearers, removeBearer, logActivity} = useWallet()
  let laeuft = false
  let uhr: ReturnType<typeof setInterval> | undefined

  const runde = async () => {
    if (laeuft || document.hidden || unterwegsIds().length === 0) return
    laeuft = true
    try {
      await pruefeRunde(bearers(), async id => {
        // eingelöst heißt wertlos: der Schein verschwindet, die Geschichte steht im Verlauf
        // (Steve, 2026-10-12) — das Original kannte nur „als ausgegeben markieren“
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
        removeBearer(id)
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
