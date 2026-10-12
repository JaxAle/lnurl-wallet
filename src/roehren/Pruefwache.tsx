// Klärt ungeprüfte Scheine selbst (Steve, 2026-10-12). Nach einer unklaren Antwort beim Teilen legt das
// Original beide möglichen Teile ungeprüft ab und bittet, sie zu „erneuern“ — am Pixel blieben so
// Geister-Scheine liegen, die zählten, aber nichts wert waren.
//
// Nur lesend: die Info-Abfrage des Originals (fetchNoteInfo, per Hash, verändert nichts — kein Erneuern).
// - Stelle kennt den Schein → bestätigt (verified, Betrag aus der Antwort).
// - Stelle meldet ihn eingelöst/unbekannt → ausgegeben mit Grund 'unbekannt' → „Zu prüfen“.
// - keine Antwort → später wieder.
// Nur Scheine, die seit mindestens einer Minute ungeprüft unverändert sind: ein Teilen, das gerade
// läuft, legt seine Teile kurz ungeprüft ab und bestätigt sie selbst — da darf niemand dazwischen.
import type {Component} from 'solid-js'
import {onCleanup, onMount} from 'solid-js'

import {notify} from '../helpers'
import {fetchNoteInfo, NoteSpentError, NoteUnknownError, serverOf} from '../lnurlcash'
import {useWallet} from '../WalletContext'

const ABSTAND_MS = 15_000
const RUHEZEIT_MS = 60_000

export const offenZurPruefung = (b: {verified: boolean; spent?: boolean; deviceId?: string}) =>
  !b.verified && !b.spent && !b.deviceId

const Pruefwache: Component = () => {
  const {state, bearers, updateBearer, logActivity} = useWallet()
  let laeuft = false
  let uhr: ReturnType<typeof setInterval> | undefined

  const runde = async () => {
    if (laeuft || document.hidden || state() !== 'unlocked') return
    const jetzt = Date.now()
    const offen = bearers().filter(b => offenZurPruefung(b) && jetzt - b.updatedAt > RUHEZEIT_MS)
    if (offen.length === 0) return
    laeuft = true
    let bestaetigt = 0
    let bestaetigtSats = 0
    let fremd = 0
    try {
      for (const b of offen) {
        try {
          const info = await fetchNoteInfo(b.url)
          await updateBearer(b.id, {
            verified: true,
            amount: info.maxWithdrawable,
            callback: info.callback,
            mintPubkey: info.mintPubkey ?? b.mintPubkey
          })
          bestaetigt++
          bestaetigtSats += Math.floor(info.maxWithdrawable / 1000)
          logActivity('refresh', `Ungeprüften Schein über ${Math.floor(info.maxWithdrawable / 1000)} Sats bestätigt (${serverOf(b.url)}).`, b.label)
        } catch (err) {
          if (err instanceof NoteSpentError || err instanceof NoteUnknownError) {
            await updateBearer(b.id, {spent: true, spentGrund: 'unbekannt'})
            fremd++
            logActivity('refresh', `${serverOf(b.url)} kennt einen ungeprüften Schein über ${Math.floor(b.amount / 1000)} Sats nicht — unter „Zu prüfen“.`, b.label)
          }
          // sonst: keine Antwort — nächste Runde
        }
      }
    } finally {
      laeuft = false
    }
    // ein ruhiger Satz mit dem Ergebnis, statt eines roten Hinweises
    const teile = [
      bestaetigt ? `${bestaetigt} ${bestaetigt === 1 ? 'Schein' : 'Scheine'} bestätigt (${bestaetigtSats.toLocaleString('de-DE')} Sats)` : '',
      fremd ? `${fremd} unbekannt — unter „Zu prüfen“` : ''
    ].filter(Boolean)
    if (teile.length) notify(`Geprüft: ${teile.join(', ')}.`)
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

export default Pruefwache
