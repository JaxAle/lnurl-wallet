// Röhren-Zählwerk für das Guthaben — aus dem abgenommenen Prototyp (tubeRow/balTubes).
// Immer sieben Röhren, rechtsbündig; links der Zahl bleiben sie dunkel (keine führenden
// Nullen), ihre Tausenderpunkte auch. Steigt das Guthaben, glühen die geänderten Ziffern auf.
import type {Component, JSX} from 'solid-js'
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  Show
} from 'solid-js'

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
      : String(Math.max(0, Math.floor(vorher)))
          .slice(-ROEHREN)
          .padStart(ROEHREN, ' ')
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
  const zahl = wert.toLocaleString('de-AT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  return c === 'eur' ? `≈ ${zahl} €` : `≈ ${zahl} ${c.toUpperCase()}`
}

// Ändert sich das Guthaben, zählt das Werk hinauf oder hinunter statt zu springen — das ist
// die Bestätigung, dass Geld gekommen oder gegangen ist (Prototyp: countOnWallet/runCountdown).
// Dauer wächst mit dem Betrag.
const zaehlDauer = (differenz: number) =>
  Math.min(3200, 900 + 520 * Math.log10(Math.max(10, differenz)))

// zuletzt gezeigter Stand über Seitenwechsel hinweg: kommt man vom Aufladen zurück, zählt
// das Werk vom alten zum neuen Guthaben, statt es fertig hinzustellen (Gerhard am Pixel)
let zuletzt: number | null = null

// Gebühr der Ausgabestelle: das Einzige, was das Zählwerk beim Aufladen nicht selbst sagt.
// Steht ein paar Sekunden in der Drahtzeile statt des Euro-Betrags — kein Banner (Steve).
const [gebuehr, setGebuehr] = createSignal<number | null>(null)
let gebuehrUhr: ReturnType<typeof setTimeout> | undefined
export const zeigeGebuehr = (sats: number): void => {
  if (sats <= 0) return
  if (gebuehrUhr) clearTimeout(gebuehrUhr)
  setGebuehr(sats)
  gebuehrUhr = setTimeout(() => setGebuehr(null), 7000)
}

// sofort: ohne Hinab-/Hinaufzählen (Eingabe beim Senden) · kalt: Röhren glimmen nur (Prototyp .cold)
const Zaehlwerk: Component<{
  sats: number
  children?: JSX.Element
  sofort?: boolean
  kalt?: boolean
  // frei vor den Röhren, z. B. „−“ beim Abschluss des Sendens: eine Bewegung, kein Stand
  vorzeichen?: string
  // Eingabe beim Senden: Zeile antippen = dort tippen (Prototyp 'cur-set'); die gewählte Zeile ist
  // hervorgehoben, in Euro glimmen die Röhren nur und zeigen weiter die Sats
  wahl?: 'sats' | 'eur'
  onWahl?: (w: 'sats' | 'eur') => void
  euroAnzeige?: string
}> = props => {
  const [angezeigt, setAngezeigtRoh] = createSignal(
    props.sofort ? props.sats : (zuletzt ?? props.sats)
  )
  const setAngezeigt = (wert: number) => {
    if (!props.sofort) zuletzt = wert
    setAngezeigtRoh(wert)
  }
  let uhr: ReturnType<typeof setTimeout> | undefined
  const halt = () => {
    if (uhr) clearTimeout(uhr)
    uhr = undefined
  }
  createEffect(
    on(
      () => props.sats,
      ziel => {
        halt()
        const von = angezeigt()
        if (ziel === von || props.sofort) {
          setAngezeigt(ziel)
          return
        }
        const dauer = zaehlDauer(Math.abs(von - ziel))
        const start = Date.now() + 350 // kurz innehalten, dann zählt das Werk los
        const schritt = () => {
          const t = Math.min(1, Math.max(0, (Date.now() - start) / dauer))
          const e = 1 - Math.pow(1 - t, 3)
          setAngezeigt(Math.round(von - (von - ziel) * e))
          uhr = t < 1 ? setTimeout(schritt, 33) : undefined
        }
        uhr = setTimeout(schritt, 350)
      }
    )
  )
  onCleanup(halt)

  // vorheriger Stand, damit nur bei einer Änderung aufgeglüht wird
  const stand = createMemo<{sats: number; vorher: number | null}>(
    prev => ({sats: angezeigt(), vorher: prev ? prev.sats : null}),
    undefined
  )
  const fiat = () => fiatText(angezeigt())
  const anzeige = () => angezeigt().toLocaleString('de-DE')

  return (
    <div class="roehren-zaehlwerk">
      {/* keyed: bei jedem neuen Stand neu aufbauen, damit das Aufglühen erneut abläuft */}
      <div
        class="rz-inrow"
        classList={{waehlbar: !!props.onWahl, aktiv: props.wahl === 'sats'}}
        role={props.onWahl ? 'button' : undefined}
        aria-label={props.onWahl ? 'In Sats eingeben' : undefined}
        aria-pressed={props.onWahl ? props.wahl === 'sats' : undefined}
        onClick={() => props.onWahl?.('sats')}
      >
        <Show when={stand()} keyed>
          {s => (
            <div
              class="bal-tubes"
              classList={{
                cold: s.sats === 0 || !!props.kalt,
                signed: !!props.vorzeichen,
                idle: props.wahl === 'eur'
              }}
              role="img"
              aria-label={`Guthaben ${anzeige()} Sats`}
            >
              <Show when={props.vorzeichen}>
                <span class="sign">{props.vorzeichen}</span>
              </Show>
              {/* kalt: kein Aufglühen neuer Ziffern — was nicht geht, glüht nicht (Prototyp entryTubes) */}
              <For each={zellen(s.sats, props.kalt ? null : s.vorher)}>
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
                      <span class={`ch ch-${zelle.ziffer}`}>
                        {zelle.ziffer}
                      </span>
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
      </div>
      <div
        class="rz-eurrow"
        classList={{waehlbar: !!props.onWahl, aktiv: props.wahl === 'eur'}}
        role={props.onWahl ? 'button' : undefined}
        aria-label={props.onWahl ? 'In Euro eingeben' : undefined}
        aria-pressed={props.onWahl ? props.wahl === 'eur' : undefined}
        onClick={() => props.onWahl?.('eur')}
      >
        <Show
          when={gebuehr()}
          fallback={
            <Show when={props.euroAnzeige ?? fiat()}>
              <div>
                <span class="rz-euro">{props.euroAnzeige ?? fiat()}</span>
              </div>
            </Show>
          }
        >
          <div>
            <span class="rz-euro">
              {gebuehr()!.toLocaleString('de-DE')}{' '}
              {gebuehr() === 1 ? 'Sat' : 'Sats'} Gebühr
            </span>
          </div>
        </Show>
      </div>
      {/* fester Platz: hier steht die Hinweiszeile, wenn etwas offen ist — sonst bleibt er leer,
      damit die Schalter nicht springen */}
      <div class="rz-fuss">{props.children}</div>
    </div>
  )
}

export default Zaehlwerk
