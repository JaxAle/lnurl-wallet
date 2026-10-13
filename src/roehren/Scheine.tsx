// Reiter Scheine wie im Prototyp (screens.notes / noteCard / noteSheet): die Scheine als Papierkarten,
// nach Ausgabestelle gruppiert,
// Antippen öffnet ein Blatt mit Werkzeugen („Teilen“ statt Prototyp-„Wechseln“ — Gerhard fand es nicht), lange antippen wählt zum Zusammenlegen aus. Leer: kalte
// Null wie auf der Startseite und der Weg zu Empfangen.
//
// Nur das Bild ist hier. Teilen, Zusammenlegen, Beschriften und Erneuern sind die Funktionen des
// Originals in pages/Wallet.tsx (dort kommt der „Motor“ her). Was früher nur die Werkzeugleiste des
// Originals konnte, steht zugeklappt im Blatt („Weitere Werkzeuge“) und am Ende des Reiters
// („Für alle Scheine“, „Ausgegeben“) — eine Werkstatt gibt es nicht mehr (Gerhard, 2026-10-12).
import type {Accessor, Component} from 'solid-js'
import {createMemo, createSignal, For, Show} from 'solid-js'
import {A} from '@solidjs/router'

import Dialog from '../components/Dialog'
import Qr from '../components/Qr'
import {notify, NotifyKind} from '../helpers'
import {serverOf, toBech32Lnurl} from '../lnurlcash'
import type {Bearer} from '../storage'
import {trustedMints} from '../trustedMints'
import {useWallet} from '../WalletContext'
import {teilGebuehr} from './gebuehren'
import {unterwegs} from './einloesen'
import Rueckfrage from './Rueckfrage'
import {offenZurPruefung} from './Pruefwache'
import {gebunden} from './klaerung'
import type {Vorgang} from './klaerung'
import {holeZurueck} from './zurueckholen'
import Zaehlwerk from './Zaehlwerk'
import './roehren.css'

export type ScheineMotor = {
  scheine: Accessor<Bearer[]>
  // ungeklärte Vorgänge (klaerung.ts): ihre Scheine stehen gebunden in einer eigenen Karte
  vorgaenge: Accessor<Vorgang[]>
  ausgewaehlt: Accessor<Set<string>>
  waehle: (id: string, an: boolean) => void
  leereAuswahl: () => void
  kannZusammenlegen: Accessor<boolean>
  arbeitet: Accessor<boolean>
  teilen: (schein: Bearer, sats: number, mal?: number) => Promise<void>
  zusammenlegen: () => Promise<void>
  beschriften: (schein: Bearer, text: string) => void
  erneuern: (schein: Bearer) => Promise<void>
  // seltene Werkzeuge, früher nur in der Werkstatt des Originals — im Blatt unter „Weitere Werkzeuge“
  qrBild: (schein: Bearer) => void
  alsText: (schein: Bearer) => void
  umziehen: (schein: Bearer) => void
  anSchluessel: (schein: Bearer) => void
  absicherbar: (schein: Bearer) => boolean
  absichern: (schein: Bearer) => Promise<void>
  markieren: (schein: Bearer) => Promise<void>
  // ausgegebene Scheine: zugeklappt am Ende des Reiters
  ausgegebene: Accessor<Bearer[]>
  aufheben: (schein: Bearer) => void
  ausgegebeneEntfernen: () => void
  alleErneuern: () => Promise<void>
  erneuertAlle: Accessor<boolean>
}

const sats = (b: Bearer) => Math.floor(b.amount / 1000)
const zahl = (n: number) => n.toLocaleString('de-DE')

// Druckfarbe nach der Reihenfolge in der Liste der Ausgabestellen — sechs gut unterscheidbare,
// keine zwei Stellen gleich bis zur sechsten (Gerhard, 2026-10-12: aus dem Namen gerechnet kamen bei
// nur drei Farben zwei Stellen gleich heraus). Unbekannte Stellen: aus dem Namen.
const FARBEN = 'abcdef'
const farbe = (host: string) => {
  const i = trustedMints().findIndex(t => serverOf(t.server) === host)
  return FARBEN[(i >= 0 ? i : [...host].reduce((a, c) => a + c.charCodeAt(0), 0)) % FARBEN.length]
}

const Symbol: Component<{d: string}> = props => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={props.d} />
  </svg>
)
const PFADE = {
  teilen: 'M12 3v7M12 10l-6 6v5M12 10l6 6v5',
  zusammen: 'M6 3v5l6 6v7M18 3v5l-6 6',
  etikett: 'M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01',
  erneuern: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  chev: 'M9 5l7 7-7 7',
  empfangen: 'M12 4v12M6 10l6 6 6-6M5 20h14'
}

// klein: Kachel im Reiter (zwei je Reihe) — nur Stelle und Betrag; groß erst im Blatt (Steve)
export const Schein: Component<{schein: Bearer; gewaehlt?: boolean; klein?: boolean}> = props => {
  const host = () => serverOf(props.schein.url)
  return (
    <div
      class={`rz-note hue-${farbe(host())}`}
      classList={{sel: props.gewaehlt, klein: props.klein, ungeprueft: offenZurPruefung(props.schein)}}
    >
      <div class="n-top">
        <span class="n-mint">{host()}</span>
        <span class="n-serial">Nr. {props.schein.id.slice(0, 6).toUpperCase()}</span>
      </div>
      <div class="n-amt">
        {zahl(sats(props.schein))}
        <small>SATS</small>
      </div>
      <div class="n-micro">
        INHABERSCHEIN · LUD·25 · {host().toUpperCase()} · INHABERSCHEIN · LUD·25 · {host().toUpperCase()}
      </div>
      <span class="n-stamp">
        LUD
        <br />
        25
      </span>
    </div>
  )
}

const Scheine: Component<{motor: ScheineMotor}> = props => {
  const m = props.motor
  const [blatt, setBlatt] = createSignal<string | null>(null)
  const [eingabe, setEingabe] = createSignal<'teilen' | 'etikett' | null>(null)
  const [text, setText] = createSignal('')
  const [mal, setMal] = createSignal('1')
  const [ausBlatt, setAusBlatt] = createSignal<string | null>(null)
  const [entfernenFrage, setEntfernenFrage] = createSignal(false)

  const offen = () => m.scheine().find(b => b.id === blatt()) ?? null
  // nach Ausgabestelle geordnet (Steve, 2026-10-11): was zusammengehört, steht beisammen — und
  // Zusammenlegen geht genau innerhalb einer Gruppe
  // gezeigt, noch nicht eingelöst: eigene Gruppe ganz oben, nicht zwischen den anderen — „der Zustand ist
  // der Ort“ (Steve, 2026-10-12); eingelöst verschwindet er, zurückgeholt wandert er in seine Gruppe
  const draussen = createMemo(() => {
    const ids = new Set(unterwegs())
    const g = gebunden()
    return m.scheine().filter(b => ids.has(b.id) && !g.has(b.id))
  })
  const gruppen = createMemo(() => {
    const je = new Map<string, Bearer[]>()
    const ids = new Set(unterwegs())
    const g = gebunden()
    for (const b of m.scheine()) {
      if (ids.has(b.id) || g.has(b.id)) continue
      const h = serverOf(b.url)
      je.set(h, [...(je.get(h) ?? []), b].sort((x, y) => y.amount - x.amount))
    }
    return [...je.entries()].map(([host, scheine]) => ({
      host,
      scheine,
      // nur Gesichertes zählt; Ungeprüftes steht als „wird geprüft …“ an der Kachel
      summe: scheine.filter(b => !offenZurPruefung(b)).reduce((a, b) => a + sats(b), 0)
    }))
  })
  const wahl = () => m.ausgewaehlt().size
  // beim Auswählen zählt nur die Stelle des ersten gewählten Scheins — die anderen klappen zu
  const gewaehlteStelle = createMemo(() => {
    const erster = m.scheine().find(b => m.ausgewaehlt().has(b.id))
    return erster ? serverOf(erster.url) : null
  })
  const gleicheStelle = createMemo(() => {
    const gew = m.scheine().filter(b => m.ausgewaehlt().has(b.id))
    return new Set(gew.map(b => serverOf(b.url))).size === 1
  })

  const schliessen = () => {
    setBlatt(null)
    setEingabe(null)
    setText('')
    setMal('1')
  }
  const teilBetrag = () => Math.trunc(Number(text()) || 0)
  const teilMal = () => Math.max(1, Math.trunc(Number(mal()) || 1))
  const teilGeht = (s: Bearer) => teilBetrag() >= 1 && teilBetrag() * teilMal() < sats(s)
  const ausOffen = () => m.ausgegebene().find(b => b.id === ausBlatt()) ?? null

  // Blatt eines gezeigten Scheins: derselbe QR noch einmal, sonst nur Zurückholen
  const {addBearer, updateBearer, removeBearer, logActivity} = useWallet()
  const [gezeigt, setGezeigt] = createSignal<string | null>(null)
  const [holt, setHolt] = createSignal(false)
  const gezeigterSchein = () => draussen().find(b => b.id === gezeigt()) ?? null
  const zurueckholen = async (b: Bearer) => {
    setHolt(true)
    try {
      const e = await holeZurueck(b, {addBearer, updateBearer, removeBearer, logActivity})
      notify(e === 'zurueck' ? 'Zurückgeholt — der gezeigte QR ist wertlos.' : 'Schon eingelöst.')
      setGezeigt(null)
    } catch (err) {
      notify(`Zurückholen geht gerade nicht: ${(err as Error).message}`, NotifyKind.ERROR)
    } finally {
      setHolt(false)
    }
  }

  // lange antippen = auswählen (Prototyp); kurz = Werkzeuge, oder bei laufender Auswahl umschalten
  // Wischen ist kein langes Antippen: am iPad wählte Scrollen über einer Kachel sie aus, weil der
  // Browser statt „loslassen“ nur „abgebrochen“ meldet (Gerhard, 2026-10-12)
  let uhr: ReturnType<typeof setTimeout> | undefined
  let lang = false
  let start: {x: number; y: number} | null = null
  const druck = (id: string, e: PointerEvent) => {
    lang = false
    start = {x: e.clientX, y: e.clientY}
    uhr = setTimeout(() => {
      lang = true
      m.waehle(id, !m.ausgewaehlt().has(id))
    }, 480)
  }
  const los = () => {
    clearTimeout(uhr)
    start = null
  }
  const bewegt = (e: PointerEvent) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) los()
  }
  const tipp = (id: string) => {
    if (lang) return
    if (wahl() > 0) m.waehle(id, !m.ausgewaehlt().has(id))
    else setBlatt(id)
  }

  const ausfuehren = async (f: () => Promise<void> | void) => {
    await f()
    schliessen()
  }

  return (
    <div class="rz-scheine">
      <div class="rz-titelzeile">
        <h2 class="rz-titel">Scheine</h2>
        <Show when={wahl() > 0}>
          <button type="button" class="rz-aendern" onClick={() => m.leereAuswahl()}>
            Auswahl aufheben
          </button>
        </Show>
      </div>

      <Show
        when={m.scheine().length > 0}
        fallback={
          <>
            <Zaehlwerk sats={0} sofort kalt>
              <p class="rz-zeile-matt">Noch keine Scheine</p>
            </Zaehlwerk>
            <A href="/empfangen" class="rz-option">
              <span class="ic">
                <Symbol d={PFADE.empfangen} />
              </span>
              <span>
                <span class="t">Empfangen</span>
                <span class="s">Scannen, einfügen oder per Lightning aufladen</span>
              </span>
              <Symbol d={PFADE.chev} />
            </A>
          </>
        }
      >
        <p class="rz-hinweis">Antippen für Werkzeuge, lange antippen zum Auswählen.</p>

        {/* ungeklärte Vorgänge: eine Karte je Vorgang, die Scheine darin gebunden (Steve, 2026-10-13) */}
        <For each={m.vorgaenge()}>
          {v => (
            <section class="rz-gruppe">
              <div class="rz-klaerung">
                <span class="rz-eyebrow">{v.host}</span>
                <p class="t">{v.art === 'teilen' ? 'Teilen wird geklärt' : 'Zusammenlegen wird geklärt'}</p>
                <p class="z">
                  {v.eingangSats.map(zahl).join(' + ')} → {v.ergebnisSats.map(zahl).join(' + ')} ?
                </p>
                <p class="rz-status">
                  <span class="rz-lampe-klein" />{' '}
                  {v.ohneAntwort >= 2
                    ? `${v.host} antwortet gerade nicht — wird geklärt, sobald das Netz es zulässt`
                    : 'Die Wallet fragt bei der Stelle nach …'}
                </p>
                <p class="rz-hinweis">
                  Bis dahin sind diese Scheine gebunden — nicht auswählen, teilen oder senden.
                </p>
              </div>
            </section>
          )}
        </For>

        <Show when={draussen().length > 0}>
          <section class="rz-gruppe rz-draussen">
            <span class="rz-eyebrow">
              Unterwegs · {draussen().length} {draussen().length === 1 ? 'Schein' : 'Scheine'} ·{' '}
              {zahl(draussen().reduce((a, b) => a + sats(b), 0))} Sats
            </span>
            <div class="rz-notes">
              <For each={draussen()}>
                {b => (
                  <div class="rz-note-platz">
                    <button
                      type="button"
                      class="rz-note-knopf"
                      aria-label={`Gezeigter Schein über ${zahl(sats(b))} Sats`}
                      onClick={() => setGezeigt(b.id)}
                    >
                      <Schein schein={b} klein />
                    </button>
                    <div class="rz-etikett rz-unterwegs-zeile">
                      <span class="rz-lampe-klein" /> unterwegs
                    </div>
                  </div>
                )}
              </For>
            </div>
          </section>
        </Show>

        <For each={gruppen()}>
          {g => (
            <section class="rz-gruppe" classList={{zu: !!gewaehlteStelle() && gewaehlteStelle() !== g.host}}>
              <Show
                when={!gewaehlteStelle() || gewaehlteStelle() === g.host}
                fallback={
                  <button type="button" class="rz-eyebrow rz-gruppe-zu" onClick={() => m.leereAuswahl()}>
                    {g.host} · {g.scheine.length} {g.scheine.length === 1 ? 'Schein' : 'Scheine'} · {zahl(g.summe)} Sats ›
                  </button>
                }
              >
              <span class="rz-eyebrow">
                {g.host} · {g.scheine.length} {g.scheine.length === 1 ? 'Schein' : 'Scheine'} · {zahl(g.summe)} Sats
              </span>
              <div class="rz-notes">
              <For each={g.scheine}>
                {b => (
                  <div class="rz-note-platz">
                    <button
                      type="button"
                      class="rz-note-knopf"
                      aria-label={`Schein über ${zahl(sats(b))} Sats`}
                      onPointerDown={e => druck(b.id, e)}
                      onPointerMove={bewegt}
                      onPointerCancel={los}
                      onPointerUp={los}
                      onPointerLeave={los}
                      onContextMenu={e => e.preventDefault()}
                      onClick={() => tipp(b.id)}
                    >
                      <Schein schein={b} gewaehlt={m.ausgewaehlt().has(b.id)} klein />
                    </button>
                    <Show when={offenZurPruefung(b)}>
                      <div class="rz-etikett rz-unterwegs-zeile">
                        <span class="rz-lampe-klein" /> wird geprüft …
                      </div>
                    </Show>
                    <Show when={b.label}>
                      <div class="rz-etikett">{b.label}</div>
                    </Show>
                  </div>
                )}
              </For>
              </div>
              </Show>
            </section>
          )}
        </For>
      </Show>

      {/* unten fest über den Reitern: bleibt unter dem Daumen, wie weit auch gescrollt (Steve) */}
      <Show when={wahl() > 0}>
        <div class="rz-auswahl">
          <span>
            {wahl()} ausgewählt
            <Show when={wahl() === 1}>
              <span class="rz-auswahl-leise"> — noch einen wählen</span>
            </Show>
          </span>
          <button
            type="button"
            class="rz-knopf an"
            disabled={wahl() < 2 || !gleicheStelle() || !m.kannZusammenlegen() || m.arbeitet()}
            onClick={() => void m.zusammenlegen()}
          >
            <span class="lbl">{m.arbeitet() ? 'Einen Moment …' : 'Zusammenlegen'}</span>
          </button>
        </div>
      </Show>


      <Show when={m.scheine().length > 0 || m.ausgegebene().length > 0}>
        <div class="rz-gruppe rz-alle">
          <span class="rz-eyebrow">Für alle Scheine</span>
          <Show when={m.scheine().length > 0}>
            <button type="button" class="rz-setting" disabled={m.erneuertAlle()} onClick={() => void m.alleErneuern()}>
              <span>
                <span class="sl">Alle erneuern</span>
                <span class="s">Nach dem Einspielen einer alten Sicherung — alte Kopien entwerten</span>
              </span>
              <span class="val">{m.erneuertAlle() ? '…' : <Symbol d={PFADE.chev} />}</span>
            </button>
          </Show>
          <Show when={m.ausgegebene().length > 0}>
            <details class="rz-erweitert">
              <summary>
                Zu prüfen ({m.ausgegebene().length}) <Symbol d={PFADE.chev} />
              </summary>
              <p class="rz-hinweis">
                Eingelöste Scheine verschwinden von selbst. Hier bleibt nur, worüber du entscheiden solltest.
              </p>
              <div class="rz-notes rz-ausgegeben">
                <For each={m.ausgegebene()}>
                  {b => (
                    <div class="rz-note-platz">
                      <button type="button" class="rz-note-knopf" onClick={() => setAusBlatt(b.id)}>
                        <Schein schein={b} klein />
                      </button>
                      <div class="rz-etikett">
                        {b.spentGrund === 'markiert'
                          ? 'Von dir markiert'
                          : b.spentGrund === 'unbekannt'
                            ? 'Der Stelle unbekannt'
                            : 'Als eingelöst gemeldet'}
                      </div>
                    </div>
                  )}
                </For>
              </div>
              <Show
                when={entfernenFrage()}
                fallback={
                  <button type="button" class="rz-aendern rz-block" onClick={() => setEntfernenFrage(true)}>
                    Alle endgültig entfernen
                  </button>
                }
              >
                <Rueckfrage
                  titel="Alle endgültig entfernen?"
                  ja="Entfernen"
                  onJa={() => {
                    m.ausgegebeneEntfernen()
                    setEntfernenFrage(false)
                  }}
                  onNein={() => setEntfernenFrage(false)}
                >
                  <p>Diese Scheine verschwinden aus der Wallet. Der Verlauf bleibt.</p>
                </Rueckfrage>
              </Show>
            </details>
          </Show>
        </div>
      </Show>

      <Show when={gezeigterSchein()}>
        {s => (
          <Dialog onClose={() => setGezeigt(null)}>
            <div class="rz-blatt rz-schein-blatt">
              <div class="rz-qr">
                <Qr value={toBech32Lnurl(s().url)} />
              </div>
              <p class="rz-status">
                <span class="rz-lampe-klein" /> Gezeigt, noch nicht eingelöst · {zahl(sats(s()))} Sats
              </p>
              <button type="button" class="rz-leise rz-block rz-mitte" disabled={holt()} onClick={() => void zurueckholen(s())}>
                {holt() ? 'Einen Moment …' : 'Zurückholen — der QR wird wertlos'}
              </button>
            </div>
          </Dialog>
        )}
      </Show>

      <Show when={ausOffen()}>
        {s => (
          <Dialog onClose={() => setAusBlatt(null)}>
            <div class="rz-blatt rz-schein-blatt">
              <Schein schein={s()} />
              <Show when={s().spentGrund === 'unbekannt'}>
                <p class="rz-hinweis">
                  Die Ausgabestelle kennt diesen Schein nicht (mehr). Meist ist es eine der zwei Möglichkeiten, die die
                  Wallet nach einer unklaren Antwort vorsorglich abgelegt hat — der echte Schein liegt bei deinen
                  anderen. Er ist nichts wert und kann weg.
                </p>
              </Show>
              <Show
                when={s().spentGrund === 'markiert'}
                fallback={
                  <p class="rz-hinweis" hidden={s().spentGrund === 'unbekannt'}>
                    Die Ausgabestelle meldet diesen Schein als eingelöst. Hast du ihn gesendet oder gezeigt, ist alles in
                    Ordnung — dann kannst du ihn entfernen. Wenn nicht, hatte jemand anderes eine Kopie, etwa aus einer
                    alten Sicherung oder einem geteilten Bild; das Geld bringt dann nichts mehr zurück.
                  </p>
                }
              >
                <p class="rz-hinweis">
                  Von dir als ausgegeben markiert. Hebst du die Markierung auf, prüft die Wallet den Schein beim nächsten
                  Erneuern wieder bei der Stelle.
                </p>
              </Show>
              <Show when={s().spentGrund === 'markiert'}>
                <button
                  type="button"
                  class="rz-knopf an rz-weiter"
                  onClick={() => {
                    m.aufheben(s())
                    setAusBlatt(null)
                  }}
                >
                  <span class="lbl">Markierung aufheben</span>
                </button>
              </Show>
              <button
                type="button"
                class="rz-leise rz-block rz-mitte"
                onClick={() => {
                  removeBearer(s().id)
                  setAusBlatt(null)
                }}
              >
                Aus der Wallet entfernen
              </button>
            </div>
          </Dialog>
        )}
      </Show>

      <Show when={offen()}>
        {s => (
          <Dialog onClose={schliessen}>
            <div class="rz-blatt rz-schein-blatt">
              <Schein schein={s()} />
              <Show when={eingabe() === null}>
                <button
                  type="button"
                  class="rz-option"
                  disabled={sats(s()) < 2 || m.arbeitet()}
                  onClick={() => {
                    setText(String(Math.floor(sats(s()) / 2)))
                    setEingabe('teilen')
                  }}
                >
                  <span class="ic">
                    <Symbol d={PFADE.teilen} />
                  </span>
                  <span>
                    <span class="t">Teilen</span>
                    <span class="s">In zwei Scheine aufteilen, z. B. 100 in 50 + 50</span>
                  </span>
                  <Symbol d={PFADE.chev} />
                </button>
                <button
                  type="button"
                  class="rz-option"
                  onClick={() => {
                    m.waehle(s().id, true)
                    schliessen()
                  }}
                >
                  <span class="ic">
                    <Symbol d={PFADE.zusammen} />
                  </span>
                  <span>
                    <span class="t">Zum Zusammenlegen auswählen</span>
                    <span class="s">Mit anderen Scheinen derselben Stelle</span>
                  </span>
                  <Symbol d={PFADE.chev} />
                </button>
                <button
                  type="button"
                  class="rz-option"
                  onClick={() => {
                    setText(s().label ?? '')
                    setEingabe('etikett')
                  }}
                >
                  <span class="ic">
                    <Symbol d={PFADE.etikett} />
                  </span>
                  <span>
                    <span class="t">Beschriften</span>
                    <span class="s">{s().label || 'Eine Notiz nur für dich'}</span>
                  </span>
                  <Symbol d={PFADE.chev} />
                </button>
                <button
                  type="button"
                  class="rz-option"
                  disabled={m.arbeitet()}
                  onClick={() => void ausfuehren(() => m.erneuern(s()))}
                >
                  <span class="ic">
                    <Symbol d={PFADE.erneuern} />
                  </span>
                  <span>
                    <span class="t">Erneuern</span>
                    <span class="s">Nach einer alten Sicherung: alte Kopien entwerten</span>
                  </span>
                  <Symbol d={PFADE.chev} />
                </button>
                <details class="rz-erweitert">
                  <summary>
                    Weitere Werkzeuge <Symbol d={PFADE.chev} />
                  </summary>
                  <button type="button" class="rz-setting" onClick={() => m.qrBild(s())}>
                    <span>
                      <span class="sl">Als QR-Bild sichern</span>
                      <span class="s">Zum Ausdrucken oder Weitergeben — wer es hat, kann einlösen</span>
                    </span>
                    <span class="val">
                      <Symbol d={PFADE.chev} />
                    </span>
                  </button>
                  <button type="button" class="rz-setting" onClick={() => m.alsText(s())}>
                    <span>
                      <span class="sl">Als Text sichern</span>
                      <span class="s">Eine Datei mit dem Schein (LNURL) — wie bares Geld behandeln</span>
                    </span>
                    <span class="val">
                      <Symbol d={PFADE.chev} />
                    </span>
                  </button>
                  <button type="button" class="rz-setting" onClick={() => { m.umziehen(s()); schliessen() }}>
                    <span>
                      <span class="sl">Zu anderer Ausgabestelle umziehen</span>
                      <span class="s">Kostet eine kleine Gebühr</span>
                    </span>
                    <span class="val">
                      <Symbol d={PFADE.chev} />
                    </span>
                  </button>
                  <button type="button" class="rz-setting" onClick={() => { m.anSchluessel(s()); schliessen() }}>
                    <span>
                      <span class="sl">An einen Schlüssel übertragen</span>
                      <span class="s">Nur der Inhaber dieses Schlüssels kann einlösen</span>
                    </span>
                    <span class="val">
                      <Symbol d={PFADE.chev} />
                    </span>
                  </button>
                  <Show when={m.absicherbar(s())}>
                    <button type="button" class="rz-setting" onClick={() => void ausfuehren(() => m.absichern(s()))}>
                      <span>
                        <span class="sl">Wiederherstellbar machen</span>
                        <span class="s">Älterer Schein — danach auch über die zwölf Wörter wiederzufinden</span>
                      </span>
                      <span class="val">
                        <Symbol d={PFADE.chev} />
                      </span>
                    </button>
                  </Show>
                  <button type="button" class="rz-setting" onClick={() => void ausfuehren(() => m.markieren(s()))}>
                    <span>
                      <span class="sl">Als ausgegeben markieren</span>
                      <span class="s">Wenn er woanders schon eingelöst wurde — lässt sich wieder aufheben</span>
                    </span>
                    <span class="val">
                      <Symbol d={PFADE.chev} />
                    </span>
                  </button>
                </details>
              </Show>

              <Show when={eingabe() === 'teilen'}>
                <label class="rz-feldname" for="rz-teil">
                  Wie viele Sats soll der neue Schein haben? (weniger als {zahl(sats(s()))})
                </label>
                <input
                  id="rz-teil"
                  class="rz-feld"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max={sats(s()) - 1}
                  value={text()}
                  onInput={e => setText(e.currentTarget.value)}
                />
                <label class="rz-feldname" for="rz-mal">
                  Wie viele solche Scheine?
                </label>
                <input
                  id="rz-mal"
                  class="rz-feld"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  value={mal()}
                  onInput={e => setMal(e.currentTarget.value)}
                />
                <p class="rz-hinweis">
                  Danach: {teilMal() > 1 ? `${teilMal()} × ` : ''}
                  {zahl(teilBetrag())} + {zahl(Math.max(0, sats(s()) - teilBetrag() * teilMal()))} Sats.{' '}
                  {teilGebuehr(serverOf(s().url))
                    ? `Gebühr bei ${serverOf(s().url)}: ${teilGebuehr(serverOf(s().url))} je Teilung, vom Rest.`
                    : `Ob ${serverOf(s().url)} fürs Teilen etwas verlangt, zeigt sich erst beim Teilen.`}
                </p>
                <button
                  type="button"
                  class="rz-knopf an rz-weiter"
                  disabled={!teilGeht(s()) || m.arbeitet()}
                  onClick={() => void ausfuehren(() => m.teilen(s(), teilBetrag(), teilMal()))}
                >
                  <span class="lbl">{m.arbeitet() ? 'Einen Moment …' : 'Teilen'}</span>
                </button>
              </Show>

              <Show when={eingabe() === 'etikett'}>
                <label class="rz-feldname" for="rz-etikett">
                  Notiz zu diesem Schein (nur auf diesem Gerät)
                </label>
                <input
                  id="rz-etikett"
                  class="rz-feld"
                  type="text"
                  maxLength={40}
                  value={text()}
                  onInput={e => setText(e.currentTarget.value)}
                />
                <button
                  type="button"
                  class="rz-knopf an rz-weiter"
                  onClick={() => void ausfuehren(() => m.beschriften(s(), text()))}
                >
                  <span class="lbl">Speichern</span>
                </button>
              </Show>
            </div>
          </Dialog>
        )}
      </Show>
    </div>
  )
}

export default Scheine
