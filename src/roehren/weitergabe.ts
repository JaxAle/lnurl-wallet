// Einen Schein weitergeben — gemeinsam für Senden und das Blatt eines Scheins (Steve, 2026-10-14).
// Zwei Wege wie im Prototyp (send-how): zeigen (QR) oder als Link schicken (Teilen-Dialog des Handys,
// sonst Zwischenablage). Beide legen den Schein unter „Unterwegs“ ab — die Einlöse-Wache fragt nach,
// Zurückholen bleibt möglich. Keine Datei, kein Speicherort (Gerhard am Pixel: „Als Text sichern“ war
// ein Umweg über den Dateimanager, und der Schein galt danach nicht als unterwegs).
import {copyToClipboard} from '../helpers'
import {serverOf, toBech32Lnurl} from '../lnurlcash'
import type {Bearer} from '../storage'
import {merkeUnterwegs} from './einloesen'

export const WARNUNG =
  'Wer den Link hat, hat das Geld. Schick ihn nur direkt an die Person, nie in eine Gruppe.'

export const linkText = (b: Bearer): string => {
  const sats = Math.floor(b.amount / 1000).toLocaleString('de-DE')
  return `${sats} Sats für dich (LNURLcash-Schein von ${serverOf(b.url)}). Antippen oder in einer Lightning-Wallet einfügen:\n\nlightning:${toBech32Lnurl(b.url)}`
}

// 'geteilt' | 'kopiert' | 'abgebrochen'
export const schickeLink = async (
  b: Bearer
): Promise<'geteilt' | 'kopiert' | 'abgebrochen'> => {
  const text = linkText(b)
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({text})
      merkeUnterwegs(b.id)
      return 'geteilt'
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'abgebrochen'
      // anderer Fehler (z. B. nicht erlaubt): auf die Zwischenablage ausweichen
    }
  }
  await copyToClipboard(text)
  merkeUnterwegs(b.id)
  return 'kopiert'
}

// aus einem geteilten Text den Schein (oder die Rechnung/Adresse) herauslösen — der Empfänger fügt
// meist die ganze Nachricht ein, nicht nur den Link
export const ausText = (text: string): string => {
  const t = text.trim()
  const lnurl = t.match(/(?:lightning:)?(lnurl1[02-9ac-hj-np-z]+)/i)
  if (lnurl && t.length > lnurl[0].length) return lnurl[1]
  const w = t.match(/lnurlw:\/\/\S+/i)
  if (w && t.length > w[0].length) return w[0]
  return t
}
