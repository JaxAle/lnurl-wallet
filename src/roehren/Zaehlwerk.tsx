// Röhren-Zählwerk für das Guthaben — aus dem abgenommenen Prototyp (tubeRow/balTubes).
// Immer sieben Röhren, rechtsbündig; links der Zahl bleiben sie dunkel (keine führenden
// Nullen), ihre Tausenderpunkte auch. Steigt das Guthaben, glühen die geänderten Ziffern auf.
import type {Component} from 'solid-js'
import {createMemo, For, Show} from 'solid-js'

import {currency, satsToFiat} from '../currency'
// Jost, die Schrift der Röhren — im Paket, nicht von Google Fonts (die App lädt nichts nach)
import '@fontsource/jost/300.css'
import './roehren.css'

const ROEHREN = 7

type Zelle =
  | {art: 'roehre'; ziffer: string | null; neu: boolean}
  | {art: 'punkt'; an: boolean}

const zellen = (sats: number, vorher: number | null): Zelle[] => {
  const ziffern = String(Math.max(0, Math.floor(sats))).slice(-ROEHREN)
  const erste = ROEHREN - ziffern.length
  const alt =
    vorher === null
      ? null
      : String(Math.max(0, Math.floor(vorher))).slice(-ROEHREN).padStart(ROEHREN, ' ')
  const steigt = vorher !== null && sats > vorher
  const ergebnis: Zelle[] = []
  for (let i = 0; i < ROEHREN; i++) {
    const ziffer = i >= erste ? ziffern[i - erste] : null
    ergebnis.push({
      art: 'roehre',
      ziffer,
      neu: steigt && ziffer !== null && alt !== null && alt[i] !== ziffer
    })
    if ((ROEHREN - 1 - i) % 3 === 0 && i < ROEHREN - 1) {
      ergebnis.push({art: 'punkt', an: i + 1 > erste})
    }
  }
  return ergebnis
}

// "≈ 0,06 €" wie im Prototyp; andere Währungen in ihrer gewohnten Form
const fiatText = (sats: number): string | null => {
  const wert = satsToFiat(sats)
  const c = currency()
  if (wert === null || c === 'none') return null
  const zahl = wert.toLocaleString('de-AT', {minimumFractionDigits: 2, maximumFractionDigits: 2})
  return c === 'eur' ? `≈ ${zahl} €` : `≈ ${zahl} ${c.toUpperCase()}`
}

const Zaehlwerk: Component<{sats: number}> = props => {
  // vorheriger Stand, damit nur bei einer Änderung aufgeglüht wird
  const stand = createMemo<{sats: number; vorher: number | null}>(
    prev => ({sats: props.sats, vorher: prev ? prev.sats : null}),
    undefined
  )
  const fiat = () => fiatText(props.sats)
  const anzeige = () => props.sats.toLocaleString('de-AT')

  return (
    <div class="roehren-zaehlwerk">
      {/* keyed: bei jedem neuen Stand neu aufbauen, damit das Aufglühen erneut abläuft */}
      <Show when={stand()} keyed>
        {s => (
          <div class="bal-tubes" role="img" aria-label={`Guthaben ${anzeige()} Sats`}>
            <For each={zellen(s.sats, s.vorher)}>
              {zelle =>
                zelle.art === 'punkt' ? (
                  <span class="dot" classList={{unlit: !zelle.an}} />
                ) : zelle.ziffer === null ? (
                  <span class="tube unlit">
                    <span class="glow" />
                  </span>
                ) : (
                  <span class="tube" classList={{up: zelle.neu}}>
                    <span class="glow" />
                    <span class={`ch ch-${zelle.ziffer}`}>{zelle.ziffer}</span>
                  </span>
                )
              }
            </For>
            <span class="satsym" aria-hidden="true">
              <svg viewBox="0 0 12 24">
                <path d="M6 1.5v21M1.5 7.5h9M1.5 12h9M1.5 16.5h9" />
              </svg>
            </span>
          </div>
        )}
      </Show>
      <Show when={fiat()}>
        <div>
          <span class="rz-euro">{fiat()}</span>
        </div>
      </Show>
    </div>
  )
}

export default Zaehlwerk
