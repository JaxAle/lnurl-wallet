// Verlauf wie im Prototyp (screens.history / histItem): Tagesgruppen, je Zeile ein Symbol (hinein,
// hinaus oder intern), ein kurzer Titel, darunter Ausgabestelle · Uhrzeit, rechts der Betrag als
// Glühdraht mit Vorzeichen. Antippen klappt den vollständigen Satz des Originals auf.
//
// Das Original speichert je Eintrag nur einen Satz (storage.ts ActivityEvent), keinen Betrag —
// Betrag und Ausgabestelle werden hier aus dem Satz gelesen. Fehlt beides, bleibt die Zeile ohne.
import type {Component} from 'solid-js'
import {createMemo, createSignal, For, Show} from 'solid-js'

import type {ActivityEvent} from '../storage'
import {betragAus, RICHTUNG, stelleAus, titel, trennePruefLink} from './verlauf'
import type {Richtung} from './verlauf'
import './roehren.css'

const tagesname = (ts: number): string => {
  const d = new Date(ts)
  const heute = new Date()
  const gestern = new Date()
  gestern.setDate(heute.getDate() - 1)
  const gleich = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (gleich(d, heute)) return 'Heute'
  if (gleich(d, gestern)) return 'Gestern'
  return d.toLocaleDateString('de-AT', {weekday: 'short', day: 'numeric', month: 'long'})
}
const uhrzeit = (ts: number) => new Date(ts).toLocaleTimeString('de-AT', {hour: '2-digit', minute: '2-digit'})

const Pfeil: Component<{richtung: Richtung}> = props => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <Show
      when={props.richtung !== 'neutral'}
      fallback={<path d="M4 9h13l-3-3M20 15H7l3 3" />}
    >
      <path d={props.richtung === 'in' ? 'M12 5v14M6 13l6 6 6-6' : 'M12 19V5M6 11l6-6 6 6'} />
    </Show>
  </svg>
)

const VerlaufListe: Component<{eintraege: ActivityEvent[]; onPruefen: (url: string) => void}> = props => {
  const [offen, setOffen] = createSignal<string | null>(null)
  const tage = createMemo(() => {
    const gruppen: {tag: string; eintraege: ActivityEvent[]}[] = []
    for (const e of props.eintraege) {
      const tag = tagesname(e.createdAt)
      const letzte = gruppen[gruppen.length - 1]
      if (letzte?.tag === tag) letzte.eintraege.push(e)
      else gruppen.push({tag, eintraege: [e]})
    }
    return gruppen
  })

  return (
    <For each={tage()}>
      {gruppe => (
        <>
          <div class="rz-tag">{gruppe.tag}</div>
          <div class="rz-liste">
            <For each={gruppe.eintraege}>
              {e => {
                const richtung = RICHTUNG[e.kind] ?? 'neutral'
                const betrag = betragAus(e.message)
                const stelle = stelleAus(e.message)
                const {text, url} = trennePruefLink(e.message)
                return (
                  <div class="rz-eintrag" classList={{auf: offen() === e.id}}>
                    <button
                      type="button"
                      class="rz-eintrag-kopf"
                      aria-expanded={offen() === e.id}
                      onClick={() => setOffen(o => (o === e.id ? null : e.id))}
                    >
                      <span class={`ic ${richtung}`}>
                        <Pfeil richtung={richtung} />
                      </span>
                      <span class="mitte">
                        <span class="t">{titel(e)}</span>
                        <span class="s">{[e.label, stelle, uhrzeit(e.createdAt)].filter(Boolean).join(' · ')}</span>
                      </span>
                      <Show when={betrag !== null}>
                        <span class={`amt ${richtung}`}>
                          {richtung === 'in' ? '+' : richtung === 'out' ? '−' : ''}
                          {betrag!.toLocaleString('de-DE')}
                        </span>
                      </Show>
                    </button>
                    <Show when={offen() === e.id}>
                      <div class="rz-eintrag-text">
                        <p>{text}</p>
                        <Show when={url}>
                          <button type="button" class="rz-leise" onClick={() => props.onPruefen(url!)}>
                            Zahlung prüfen ›
                          </button>
                        </Show>
                      </div>
                    </Show>
                  </div>
                )
              }}
            </For>
          </div>
        </>
      )}
    </For>
  )
}

export default VerlaufListe
