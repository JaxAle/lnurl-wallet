// Gebühren der Ausgabestellen dort zeigen, wo man entscheidet (Steve, 2026-10-12).
// - Aufladen: jede Stelle nennt ihre Gebühr im payRequest („Mint fees: <msat>,<ppm>“, LUD-25) — einmal
//   je Sitzung erfragt (ein GET), nichts wird eingetragen oder bezahlt.
// - Teilen: kündigt keine Stelle an (eine feste Gebühr je Teilung, vom Rest abgezogen) — die Wallet
//   merkt sich, was sie beim letzten Teilen gekostet hat, und sagt sonst ehrlich, dass es offen ist.
import {createSignal} from 'solid-js'

import {fetchPayRequest, resolveMintInput, serverOf} from '../lnurlcash'
import type {MintFee} from '../lnurlcash'

type Stand = MintFee | null | 'unbekannt'
const [aufladen, setAufladen] = createSignal<Record<string, Stand>>({})
const laeuft = new Set<string>()

// adresse: „mint@host“ oder „@host“ — wie beim Hinzufügen
export const frageAufladeGebuehr = (adresse: string): void => {
  const url = resolveMintInput(adresse)
  if (!url) return
  const host = serverOf(url)
  if (host in aufladen() || laeuft.has(host)) return
  laeuft.add(host)
  fetchPayRequest(url)
    .then(info => setAufladen(a => ({...a, [host]: info.mintFee ?? null})))
    .catch(() => setAufladen(a => ({...a, [host]: 'unbekannt'})))
    .finally(() => laeuft.delete(host))
}

const zahl = (n: number, stellen = 0) =>
  n.toLocaleString('de-DE', {maximumFractionDigits: stellen})

// „1 Sat + 0,2 %“, „keine“, oder undefined solange nicht bekannt
export const aufladeGebuehr = (host: string): string | undefined => {
  const f = aufladen()[host]
  if (f === undefined || f === 'unbekannt') return undefined
  if (f === null) return 'keine'
  const sats = f.baseFeeMsat / 1000
  const teile = [
    sats > 0 ? `${zahl(sats, 3)} Sat${sats === 1 ? '' : 's'}` : '',
    f.feePpm > 0 ? `${zahl(f.feePpm / 10_000, 2)} %` : ''
  ].filter(Boolean)
  return teile.length ? teile.join(' + ') : 'keine'
}

const SCHLUESSEL = 'fork_teilgebuehr'
const lies = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '{}') as Record<
      string,
      number
    >
  } catch {
    return {}
  }
}
const [teilen, setTeilen] = createSignal<Record<string, number>>(lies())

export const merkeTeilGebuehr = (host: string, msat: number): void => {
  const neu = {...teilen(), [host]: Math.max(0, msat)}
  setTeilen(neu)
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(neu))
  } catch {
    // ohne Speicher gilt es nur bis zum Neuladen
  }
}

// „zuletzt 1 Sat“ / „zuletzt keine“ / undefined = noch nie geteilt
export const teilGebuehr = (host: string): string | undefined => {
  const msat = teilen()[host]
  if (msat === undefined) return undefined
  const sats = msat / 1000
  return sats > 0
    ? `zuletzt ${zahl(sats, 3)} Sat${sats === 1 ? '' : 's'}`
    : 'zuletzt keine'
}
