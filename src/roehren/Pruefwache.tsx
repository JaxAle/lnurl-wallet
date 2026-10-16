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

import {notify, NotifyKind} from '../helpers'
import {
  fetchNoteInfo,
  NoteSpentError,
  NoteUnknownError,
  serverOf
} from '../lnurlcash'
import type {Bearer} from '../storage'
import {useWallet} from '../WalletContext'
import {
  abzusichern,
  aendere,
  beobachte,
  gebunden,
  merkeAbzusichern,
  vergissAbzusichern,
  vorgaenge
} from './klaerung'
import {merkeSicherung} from './sicherung'
import {aufDemSchirm, holeRechnungAb, offeneRechnungen} from './rechnungen'
import {
  holeZurueck,
  vergissZurueckholen,
  zurueckholenAuftrag,
  zurueckholenLaeuft,
  zurueckzuholen
} from './zurueckholen'
import type {Vorgang} from './klaerung'

const ABSTAND_MS = 15_000
const RUHEZEIT_MS = 60_000

// einen ungeprüften Schein jetzt nachsehen (Taste im Blatt) — nur lesend, wie die Runde der Wache
export const pruefeEinen = async (
  b: Bearer,
  ctx: {
    updateBearer: (id: string, c: Partial<Omit<Bearer, 'id'>>) => Promise<void>
  }
): Promise<'bestaetigt' | 'unbekannt' | 'keine-antwort'> => {
  try {
    const info = await fetchNoteInfo(b.url)
    await ctx.updateBearer(b.id, {
      verified: true,
      amount: info.maxWithdrawable,
      callback: info.callback,
      mintPubkey: info.mintPubkey ?? b.mintPubkey
    })
    return 'bestaetigt'
  } catch (err) {
    if (err instanceof NoteSpentError || err instanceof NoteUnknownError) {
      await ctx.updateBearer(b.id, {spent: true, spentGrund: 'unbekannt'})
      return 'unbekannt'
    }
    return 'keine-antwort'
  }
}

const ungeprueft = (b: {
  verified: boolean
  spent?: boolean
  deviceId?: string
}) => !b.verified && !b.spent && !b.deviceId

// „wird geprüft“: ungeprüft, oder empfangen und noch nicht abgesichert (der Absender hat dann noch
// eine gültige Kopie) — keine Werkzeuge, nicht in der großen Zahl
export const offenZurPruefung = (b: {
  id?: string
  verified: boolean
  spent?: boolean
  deviceId?: string
}) => ungeprueft(b) || (!!b.id && !b.spent && abzusichern().includes(b.id))

const Pruefwache: Component = () => {
  const {state, bearers, addBearer, updateBearer, removeBearer, logActivity} =
    useWallet()

  type Antwort = {
    b: Bearer
    info?: Awaited<ReturnType<typeof fetchNoteInfo>>
    fremd?: boolean
  }
  const frage = async (b: Bearer): Promise<Antwort> => {
    try {
      return {b, info: await fetchNoteInfo(b.url)}
    } catch (err) {
      if (err instanceof NoteSpentError || err instanceof NoteUnknownError)
        return {b, fremd: true}
      return {b} // keine Antwort
    }
  }
  const summe = (xs: number[]) =>
    xs.map(x => x.toLocaleString('de-DE')).join(' + ')

  // einen Vorgang „in Klärung“ als Ganzes auflösen (klaerung.ts)
  const klaere = async (v: Vorgang) => {
    const ergebnis = v.ergebnis
      .map(id => bearers().find(b => b.id === id))
      .filter((b): b is Bearer => !!b)
    if (ergebnis.length === 0) return aendere(v.id, () => null)
    const antworten = await Promise.all(ergebnis.map(frage))
    if (antworten.some(a => !a.info && !a.fremd)) {
      aendere(v.id, x => ({...x, ohneAntwort: x.ohneAntwort + 1}))
      return
    }
    const echt = antworten.filter(a => a.info)
    const name =
      v.art === 'teilen'
        ? 'Teilen'
        : v.art === 'empfangen'
          ? 'Erneuern beim Empfang'
          : 'Zusammenlegen'
    if (echt.length === 0) {
      // nie stattgefunden: die möglichen Ergebnisse sind nichts wert, die Eingänge wieder frei
      for (const a of antworten) removeBearer(a.b.id)
      // Empfang: der empfangene Schein ist dann noch nicht abgesichert — gleich noch einmal
      if (v.art === 'empfangen')
        for (const id of v.eingang) merkeAbzusichern(id)
      const text =
        v.art === 'empfangen'
          ? `Erneuern beim Empfang hat nicht stattgefunden — die Wallet versucht es gleich noch einmal.`
          : `${name} hat nicht stattgefunden — deine Scheine (${summe(v.eingangSats)} Sats) sind wieder frei.`
      logActivity('refresh', `${text} (${v.host})`)
      notify(text)
    } else {
      // stattgefunden: Ergebnisse bestätigen, Eingänge sind bei der Stelle verbraucht
      for (const a of echt) {
        await updateBearer(a.b.id, {
          verified: true,
          amount: a.info!.maxWithdrawable,
          callback: a.info!.callback,
          mintPubkey: a.info!.mintPubkey ?? a.b.mintPubkey
        })
      }
      for (const a of antworten.filter(x => x.fremd)) removeBearer(a.b.id)
      for (const id of v.eingang) removeBearer(id)
      const neu = echt.map(a => Math.floor(a.info!.maxWithdrawable / 1000))
      const text =
        v.art === 'teilen'
          ? `Geteilt: ${summe(neu)} Sats.`
          : v.art === 'empfangen'
            ? `Empfang von ${summe(neu)} Sats abgesichert.`
            : `Zusammengelegt: ${summe(neu)} Sats.`
      logActivity(
        'refresh',
        `${text} Nach unklarer Antwort bestätigt (${v.host}).`
      )
      notify(text)
    }
    aendere(v.id, () => null)
  }
  let laeuft = false
  let uhr: ReturnType<typeof setInterval> | undefined
  // Absichern höchstens alle zwei Minuten je Schein — eine Stelle, die ablehnt, nicht im Takt bedrängen
  const letzterVersuch = new Map<string, number>()

  const runde = async () => {
    if (laeuft || document.hidden || state() !== 'unlocked') return
    const jetzt = Date.now()
    const faellig = vorgaenge().filter(v => jetzt - v.seit > 5000)
    const bindung = gebunden()
    const offen = bearers().filter(
      b =>
        ungeprueft(b) && !bindung.has(b.id) && jetzt - b.updatedAt > RUHEZEIT_MS
    )
    // empfangene, noch nicht erneuerte Scheine: geprüft und nicht gebunden → jetzt absichern
    const sichern = abzusichern()
      .map(id => bearers().find(b => b.id === id))
      .filter(
        (b): b is Bearer =>
          !!b &&
          !b.spent &&
          b.verified &&
          !bindung.has(b.id) &&
          jetzt - (letzterVersuch.get(b.id) ?? 0) > 120_000
      )
    for (const id of abzusichern()) {
      const b = bearers().find(x => x.id === id)
      if (!b || b.spent) vergissAbzusichern(id)
    }
    // liegengebliebene Zurückholen-Aufträge (offline getippt): sobald die Stelle antwortet
    for (const id of zurueckzuholen()) {
      const b = bearers().find(x => x.id === id)
      if (!b || b.spent) vergissZurueckholen(id)
    }
    const holen = zurueckzuholen()
      .map(id => bearers().find(b => b.id === id))
      .filter(
        (b): b is Bearer =>
          !!b &&
          !zurueckholenLaeuft(b.id) &&
          jetzt - (letzterVersuch.get(`z:${b.id}`) ?? 0) > 30_000
      )
    // offene Rechnungen, deren Bildschirm zu ist: höchstens alle 20 s je Rechnung nachfragen
    const rechnungen = offeneRechnungen().filter(
      r =>
        r.pr !== aufDemSchirm() &&
        jetzt - (letzterVersuch.get(`r:${r.pr}`) ?? 0) > 20_000
    )
    if (
      offen.length === 0 &&
      faellig.length === 0 &&
      sichern.length === 0 &&
      holen.length === 0 &&
      rechnungen.length === 0
    )
      return
    laeuft = true
    try {
      for (const v of faellig) await klaere(v)
    } catch {
      // nächste Runde
    }
    for (const b of sichern) {
      letzterVersuch.set(b.id, Date.now())
      try {
        await beobachte('empfangen', [b], bearers, () =>
          holeZurueck(
            b,
            {addBearer, updateBearer, removeBearer, logActivity},
            'absichern'
          )
        )
        vergissAbzusichern(b.id)
      } catch {
        // keine Antwort, abgelehnt oder unklar (dann als Vorgang festgehalten) — nächste Runde
        if (gebunden().has(b.id)) vergissAbzusichern(b.id)
      }
    }
    for (const b of holen) {
      letzterVersuch.set(`z:${b.id}`, Date.now())
      try {
        const e = await zurueckholenAuftrag(b, {
          addBearer,
          updateBearer,
          removeBearer,
          logActivity
        })
        // zurückgeholt: das Zählwerk zählt hinauf, kein Satz dazu (Steve)
        if (e === 'schon-eingeloest')
          notify(
            `Der Schein über ${Math.floor(b.amount / 1000).toLocaleString('de-DE')} Sats war schon eingelöst — der Empfänger war schneller.`
          )
      } catch (err) {
        notify((err as Error).message, NotifyKind.ERROR)
      }
    }
    for (const r of rechnungen) {
      letzterVersuch.set(`r:${r.pr}`, Date.now())
      try {
        const e = await holeRechnungAb(r, bearers, {addBearer, logActivity})
        if (e === 'abgeholt')
          notify(
            `Aufladen bei ${r.host} ist angekommen — der Schein ist in der Wallet.`
          )
      } catch {
        // nächste Runde
      }
    }
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
          logActivity(
            'refresh',
            `Ungeprüften Schein über ${Math.floor(info.maxWithdrawable / 1000)} Sats bestätigt (${serverOf(b.url)}).`,
            b.label
          )
        } catch (err) {
          if (
            err instanceof NoteSpentError ||
            err instanceof NoteUnknownError
          ) {
            await updateBearer(b.id, {spent: true, spentGrund: 'unbekannt'})
            fremd++
            logActivity(
              'refresh',
              `${serverOf(b.url)} kennt einen ungeprüften Schein über ${Math.floor(b.amount / 1000)} Sats nicht — unter „Zu prüfen“.`,
              b.label
            )
          }
          // sonst: keine Antwort — nächste Runde
        }
      }
    } finally {
      laeuft = false
    }
    // ein ruhiger Satz mit dem Ergebnis, statt eines roten Hinweises
    const teile = [
      bestaetigt
        ? `${bestaetigt} ${bestaetigt === 1 ? 'Schein' : 'Scheine'} bestätigt (${bestaetigtSats.toLocaleString('de-DE')} Sats)`
        : '',
      fremd ? `${fremd} unbekannt — unter „Zu prüfen“` : ''
    ].filter(Boolean)
    if (teile.length) notify(`Geprüft: ${teile.join(', ')}.`)
  }

  // eben wurde eine Sicherung heruntergeladen: das ist jetzt der gesicherte Stand
  const gesichert = () => merkeSicherung(bearers())

  onMount(() => {
    void runde()
    uhr = setInterval(() => void runde(), ABSTAND_MS)
    document.addEventListener('visibilitychange', runde)
    // Netz wieder da: gleich eine Runde, nicht erst in 15 s
    window.addEventListener('online', runde)
    window.addEventListener('fork:sicherung', gesichert)
  })
  onCleanup(() => {
    if (uhr) clearInterval(uhr)
    document.removeEventListener('visibilitychange', runde)
    window.removeEventListener('online', runde)
    window.removeEventListener('fork:sicherung', gesichert)
  })
  return null
}

export default Pruefwache
