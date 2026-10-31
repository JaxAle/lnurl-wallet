// Was die Wallet beim Bezahlen je Ausgabestelle zuletzt erlebt hat (Gerhard, 2026-10-31: minty und mint.600.wtf
// zahlten nicht hinaus, 21linz schon). Bewusst kein festes Etikett — Kanäle und Gebühren der Stelle ändern
// sich; hier steht nur der letzte Ausgang, den die Bezahl-Wache entschieden hat (bezahlwache.ts). Nur auf
// diesem Gerät, keine Geheimnisse: Name der Stelle, Ausgang, Zeitpunkt.
import {createSignal} from 'solid-js'

const SCHLUESSEL = 'fork_auszahlung'

export type Erfahrung = {ok: boolean; am: number}
type Alle = Record<string, Erfahrung>

const lies = (): Alle => {
  try {
    const w = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '{}')
    return w && typeof w === 'object' ? w : {}
  } catch {
    return {}
  }
}

const [alle, setAlle] = createSignal<Alle>(lies())

export const merkeAuszahlung = (
  stelle: string,
  ok: boolean,
  am = Date.now()
) => {
  const neu = {...alle(), [stelle]: {ok, am}}
  setAlle(neu)
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(neu))
  } catch {
    // ohne Speicher eben ohne Erinnerung
  }
}

export const erfahrung = (stelle: string): Erfahrung | null =>
  alle()[stelle] ?? null

// „zuletzt bezahlt (31.10.)“ · „zahlte zuletzt nicht (31.10.)“ · null ohne Erfahrung
export const erfahrungText = (stelle: string): string | null => {
  const e = erfahrung(stelle)
  if (!e) return null
  const tag = new Date(e.am).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit'
  })
  return e.ok ? `zuletzt bezahlt (${tag})` : `zahlte zuletzt nicht (${tag})`
}
