// Reiter Scheine wie im Prototyp (screens.notes / noteCard / noteSheet): die Scheine als Papierkarten,
// nach Ausgabestelle gruppiert,
// Antippen öffnet ein Blatt mit Werkzeugen, lange antippen wählt zum Zusammenlegen aus. Leer: kalte
// Null wie auf der Startseite und der Weg zu Empfangen.
//
// Nur das Bild ist hier. Teilen, Zusammenlegen, Beschriften und Erneuern sind die Funktionen des
// Originals in pages/Wallet.tsx (dort kommt der „Motor“ her); dessen volle Werkzeugleiste bleibt
// unten über „Alle Werkzeuge“ erreichbar. Umziehen zu einer anderen Ausgabestelle folgt später.
import type {Accessor, Component} from 'solid-js'
import {createMemo, createSignal, For, Show} from 'solid-js'
import {A} from '@solidjs/router'

import Dialog from '../components/Dialog'
import {serverOf} from '../lnurlcash'
import type {Bearer} from '../storage'
import Zaehlwerk from './Zaehlwerk'
import './roehren.css'

export type ScheineMotor = {
  scheine: Accessor<Bearer[]>
  ausgewaehlt: Accessor<Set<string>>
  waehle: (id: string, an: boolean) => void
  leereAuswahl: () => void
  kannZusammenlegen: Accessor<boolean>
  arbeitet: Accessor<boolean>
  teilen: (schein: Bearer, sats: number) => Promise<void>
  zusammenlegen: () => Promise<void>
  beschriften: (schein: Bearer, text: string) => void
  erneuern: (schein: Bearer) => Promise<void>
}

const sats = (b: Bearer) => Math.floor(b.amount / 1000)
const zahl = (n: number) => n.toLocaleString('de-DE')

// jede Ausgabestelle bekommt ihre Druckfarbe (Prototyp hue-a/b/c), fest aus dem Namen
const farbe = (host: string) => 'abc'[[...host].reduce((a, c) => a + c.charCodeAt(0), 0) % 3]

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
    <div class={`rz-note hue-${farbe(host())}`} classList={{sel: props.gewaehlt, klein: props.klein}}>
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

const Scheine: Component<{motor: ScheineMotor; onWerkstatt?: () => void}> = props => {
  const m = props.motor
  const [blatt, setBlatt] = createSignal<string | null>(null)
  const [eingabe, setEingabe] = createSignal<'teilen' | 'etikett' | null>(null)
  const [text, setText] = createSignal('')

  const offen = () => m.scheine().find(b => b.id === blatt()) ?? null
  // nach Ausgabestelle geordnet (Steve, 2026-10-11): was zusammengehört, steht beisammen — und
  // Zusammenlegen geht genau innerhalb einer Gruppe
  const gruppen = createMemo(() => {
    const je = new Map<string, Bearer[]>()
    for (const b of m.scheine()) {
      const h = serverOf(b.url)
      je.set(h, [...(je.get(h) ?? []), b])
    }
    return [...je.entries()].map(([host, scheine]) => ({
      host,
      scheine,
      summe: scheine.reduce((a, b) => a + sats(b), 0)
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
  }

  // lange antippen = auswählen (Prototyp); kurz = Werkzeuge, oder bei laufender Auswahl umschalten
  let uhr: ReturnType<typeof setTimeout> | undefined
  let lang = false
  const druck = (id: string) => {
    lang = false
    uhr = setTimeout(() => {
      lang = true
      m.waehle(id, !m.ausgewaehlt().has(id))
    }, 480)
  }
  const los = () => clearTimeout(uhr)
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
                      onPointerDown={() => druck(b.id)}
                      onPointerUp={los}
                      onPointerLeave={los}
                      onContextMenu={e => e.preventDefault()}
                      onClick={() => tipp(b.id)}
                    >
                      <Schein schein={b} gewaehlt={m.ausgewaehlt().has(b.id)} klein />
                    </button>
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

      <Show when={props.onWerkstatt}>
        <button type="button" class="rz-leise rz-werkstatt" onClick={() => props.onWerkstatt?.()}>
          Alle Werkzeuge des Originals ›
        </button>
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
                    <span class="t">Wechseln</span>
                    <span class="s">Einen Teil als eigenen Schein abtrennen</span>
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
              </Show>

              <Show when={eingabe() === 'teilen'}>
                <label class="rz-feldname" for="rz-teil">
                  Wie viele Sats sollen ein eigener Schein werden? (weniger als {zahl(sats(s()))})
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
                <p class="rz-hinweis">
                  Danach: {zahl(Number(text()) || 0)} + {zahl(Math.max(0, sats(s()) - (Number(text()) || 0)))} Sats — eine
                  Gebühr der Ausgabestelle geht vom Rest ab.
                </p>
                <button
                  type="button"
                  class="rz-knopf an rz-weiter"
                  disabled={!(Number(text()) >= 1 && Number(text()) < sats(s())) || m.arbeitet()}
                  onClick={() => void ausfuehren(() => m.teilen(s(), Math.trunc(Number(text()))))}
                >
                  <span class="lbl">{m.arbeitet() ? 'Einen Moment …' : 'Wechseln'}</span>
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
