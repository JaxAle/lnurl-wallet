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

// Nur der reine Link geht in die Nachricht (Gerhard, 2026-10-14): die Original-Wallet und die meisten
// anderen lesen beim Einfügen genau einen Schein, keinen Satz davor. Form nach LUD-01 (bech32, groß —
// so lesen ihn alle, BETRIEB/0017) mit dem Schema „lightning:“, damit Antippen eine Wallet öffnet.
export const nurLink = (b: Bearer): string =>
  `lightning:${toBech32Lnurl(b.url)}`

// der erklärende Satz nur als Betreff — E-Mail zeigt ihn, Messenger lassen ihn meist weg
export const betreff = (b: Bearer): string =>
  `${Math.floor(b.amount / 1000).toLocaleString('de-DE')} Sats für dich (LNURLcash-Schein von ${serverOf(b.url)})`

// 'geteilt' | 'kopiert' | 'abgebrochen'
export const schickeLink = async (
  b: Bearer
): Promise<'geteilt' | 'kopiert' | 'abgebrochen'> => {
  const text = nurLink(b)
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({title: betreff(b), text})
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
// meist die ganze Nachricht ein, nicht nur den Link. Messenger fügen in lange Wörter gern unsichtbare
// Trennzeichen (Null-Breite, weiches Trennzeichen) ein; die fallen hier weg
// (Gerhard am Pixel, 2026-10-14: eingefügter Link wurde nicht erkannt).
const UNSICHTBAR = /[\u00ad\u180e\u200b-\u200f\u2060\ufeff]/g
const BECH32 = '02-9ac-hj-np-z'

export const ausText = (text: string): string => {
  const t = text.replace(UNSICHTBAR, '').trim()
  const lnurl = t.match(new RegExp(`lnurl1[${BECH32}]{20,}`, 'i'))
  if (lnurl) return lnurl[0]
  const w = t.match(/lnurlw:\/\/\S+/i)
  if (w) return w[0]
  return t.replace(/^lightning:/i, '')
}
