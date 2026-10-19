// Die zwölf Wörter hinter dem Code (Gerhard/Steve, 2026-10-19): bisher einmal gezeigt und nie gespeichert —
// ein verlegter Zettel war dann nicht mehr zu ersetzen. Jetzt liegen sie wie die Schlüssel verschlüsselt
// auf dem Gerät (PBKDF2 210.000 Runden + AES-GCM, keys.ts encryptSecretParts) unter dem Code; ohne Code
// offen, wie dort auch die Schlüssel. Wer den Code hat, hätte über die Schlüssel ohnehin das Geld.
import {decryptSecretParts, encryptSecretParts} from '../keys'
import type {EncryptedSecretParts} from '../keys'

const SCHLUESSEL = 'fork_woerter'

type Abgelegt =
  ({enc: true} & EncryptedSecretParts) | {enc: false; value: string}

const lies = (): Abgelegt | null => {
  try {
    const a = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? 'null')
    return a && (a.enc === true || a.enc === false) ? (a as Abgelegt) : null
  } catch {
    return null
  }
}

export const hatWoerter = (): boolean => lies() !== null

export const speichereWoerter = async (
  woerter: string,
  code: string | undefined
): Promise<void> => {
  const a: Abgelegt = code
    ? {enc: true, ...(await encryptSecretParts(woerter, code))}
    : {enc: false, value: woerter}
  localStorage.setItem(SCHLUESSEL, JSON.stringify(a))
}

// wirft bei falschem Code; null, wenn keine Wörter abgelegt sind
export const leseWoerter = async (
  code: string | undefined
): Promise<string | null> => {
  const a = lies()
  if (!a) return null
  if (a.enc === false) return a.value
  return decryptSecretParts(a, code ?? '')
}

// Code geändert: mit dem neuen Code neu verschlüsseln (alt: bisheriger Code, oder keiner)
export const woerterUmschluesseln = async (
  alt: string | undefined,
  neu: string | undefined
): Promise<void> => {
  const w = await leseWoerter(alt).catch(() => null)
  if (w) await speichereWoerter(w, neu)
}

export const vergissWoerter = () => {
  try {
    localStorage.removeItem(SCHLUESSEL)
  } catch {
    // nichts
  }
}

// 4 zufällige, verschiedene Stellen 0…11 zum Prüfen (Gerhard: 4 genügen, keine Wallet für große Summen)
export const vierStellen = (zufall = Math.random): number[] => {
  const alle = Array.from({length: 12}, (_, i) => i)
  for (let i = alle.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1))
    ;[alle[i], alle[j]] = [alle[j], alle[i]]
  }
  return alle.slice(0, 4).sort((a, b) => a - b)
}
