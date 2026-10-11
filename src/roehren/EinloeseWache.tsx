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
  const {bearers, updateBearer} = useWallet()
  let laeuft = false
  let uhr: ReturnType<typeof setInterval> | undefined

  const runde = async () => {
    if (laeuft || document.hidden || unterwegsIds().length === 0) return
    laeuft = true
    try {
      await pruefeRunde(bearers(), id => updateBearer(id, {spent: true}))
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
