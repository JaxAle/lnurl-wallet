// Das Röhrenfeld zum Code-Tippen (Prototyp screens.lock), gemeinsam für Entsperren und Code festlegen
// (Steve, 2026-10-17). 40 Röhren zünden und gehen aus; getippt wird auf den Röhren, unten zeigen Punkte die
// Länge. Daneben ein leiser Schlüssel: er weckt ein unsichtbares Passwortfeld, damit Schlüsselbund oder
// Bitwarden den Code einsetzen (bzw. beim Festlegen ein starkes Passwort vorschlagen) — der iPhone-Tester
// nahm in der Einrichtung den Vorschlag des Schlüsselbunds an und kam danach auf den Röhren nicht weiter.
import type {Component, JSX} from 'solid-js'
import {createSignal, For, onCleanup, onMount, Show} from 'solid-js'

import {ZEICHEN} from './roehrencode'
import './roehren.css'

// das Bild der Vorlage: nach dem Entsperren stehen hier L N · U R L · C A S H und unten b y D N I
const BILD = 'BFG1&9QWEZ5LN7KMIJO8XURLPDCASH2V0T63.#Y4'
const MARKE = [11, 12, 21, 22, 23, 26, 27, 28, 29]
const DANK: [number, string][] = [
  [35, 'b'],
  [36, 'y'],
  [37, 'D'],
  [38, 'N'],
  [39, 'I']
]

// 'weiter': angenommen, Feld leeren · 'falsch': rot flackern, von vorn · 'offen': LN · URL · CASH
export type Antwort = 'weiter' | 'falsch' | 'offen'
type Phase = 'zuendet' | 'bereit' | 'prueft' | 'falsch' | 'offen'

// J gezeichnet (≠ I), die 0 mit Punkt (≠ O) — wie im Prototyp keyInner/keyClass
const Zeichen: Component<{z: string}> = props => (
  <span
    classList={{ch: true, 'ch-0': props.z === '0', 'ch-J': props.z === 'J'}}
  >
    <Show when={props.z === 'J'} fallback={props.z}>
      <svg viewBox="0 0 46 100" aria-hidden="true">
        <path d="M33 18V64a15 15 0 0 1-30 0" />
      </svg>
    </Show>
  </span>
)

const Schluessel = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h9M18 12v3M21 12v2" />
  </svg>
)

const Roehrenfeld: Component<{
  onCode: (code: string, ausManager: boolean) => Promise<Antwort>
  aktion: string // Text des Knopfs, solange die Länge unbekannt ist: „Öffnen“, „Weiter“
  autocomplete: 'current-password' | 'new-password'
  laenge?: number | null // bekannt: Punkte füllen sich, nach dem letzten Zeichen von selbst
  mindestens?: number // Knopf erst ab so vielen Zeichen
  sperreBis?: number // Wartezeit nach Fehlversuchen (ms seit 1970), 0 = keine
  kopf?: JSX.Element
  unten?: JSX.Element
  fehlerZeile?: string | null
}> = props => {
  const [phase, setPhase] = createSignal<Phase>('zuendet')
  const [code, setCode] = createSignal('')
  const [bild, setBild] = createSignal(false)
  const [jetzt, setJetzt] = createSignal(Date.now())
  const [gedrueckt, setGedrueckt] = createSignal<number | null>(null)
  const [treffer, setTreffer] = createSignal<Record<number, number>>({})
  const verzug = ZEICHEN.split('').map(() => (Math.random() * 0.9).toFixed(2))
  const aus = ZEICHEN.split('').map(() => (Math.random() * 0.6).toFixed(2))
  const uhren: ReturnType<typeof setTimeout>[] = []
  const spaeter = (f: () => void, ms: number) => uhren.push(setTimeout(f, ms))
  let verborgen: HTMLInputElement | undefined
  // Schlüssel angetippt: die Zeile für den Passwortmanager ist sichtbar — mit Feld (Autofill, langes
  // Drücken › Einfügen) und Knopf „Einfügen“; unsichtbar ließ sich am Handy nichts einfügen
  // (Gerhard am Pixel, 2026-10-18)
  const [manager, setManager] = createSignal(false)
  const [managerHinweis, setManagerHinweis] = createSignal<string | null>(null)

  const sperre = () => Math.max(0, (props.sperreBis ?? 0) - jetzt())
  const laenge = () => props.laenge ?? null

  onMount(() => {
    document.body.classList.add('rz-gesperrt')
    spaeter(() => phase() === 'zuendet' && setPhase('bereit'), 1900)
    const takt = setInterval(() => setJetzt(Date.now()), 1000)
    onCleanup(() => clearInterval(takt))
  })
  onCleanup(() => {
    uhren.forEach(clearTimeout)
    document.body.classList.remove('rz-gesperrt')
  })

  // Tippen zählt vom ersten Moment an, auch während die Röhren noch zünden (Steve)
  const nimmtAn = () => phase() === 'bereit' || phase() === 'zuendet'

  const reiche = async (wert: string, ausManager: boolean) => {
    if (!wert || sperre() > 0) return
    if (!ausManager && !nimmtAn()) return
    setPhase('prueft')
    const a = await props.onCode(wert, ausManager)
    setJetzt(Date.now())
    setTreffer({})
    setCode('')
    if (a === 'falsch') {
      setPhase('falsch')
      spaeter(() => setPhase('bereit'), 600)
    } else if (a === 'offen') {
      setBild(true)
      setPhase('offen')
    } else setPhase('bereit')
  }

  const tippe = (i: number) => {
    if (!nimmtAn() || sperre() > 0) return
    setCode(c => (c.length < 64 ? c + ZEICHEN[i] : c))
    setTreffer(t => ({...t, [i]: (t[i] ?? 0) + 1}))
    try {
      navigator.vibrate?.(8)
    } catch {
      // kein Vibrieren
    }
    if (laenge() !== null && code().length === laenge())
      void reiche(code(), false)
  }
  const loesche = () => nimmtAn() && setCode(c => c.slice(0, -1))
  const knopfBereit = () =>
    nimmtAn() && code().length >= Math.max(1, props.mindestens ?? 1)

  // Tastatur am Rechner: tippen, ⌫, Enter — nicht, solange das verborgene Feld den Fokus hat
  const taste = (e: KeyboardEvent) => {
    if (document.activeElement === verborgen) return
    if (e.key === 'Enter') return void (knopfBereit() && reiche(code(), false))
    if (e.key === 'Backspace') return void loesche()
    const i = ZEICHEN.indexOf(e.key.toUpperCase())
    if (i >= 0 && e.key.length === 1) tippe(i)
  }
  onMount(() => document.addEventListener('keydown', taste))
  onCleanup(() => document.removeEventListener('keydown', taste))

  // Passwortmanager: setzt den ganzen Wert auf einmal ein → gleich weiter; von Hand Getipptes mit Enter
  let vorher = 0
  const verborgenEingabe = (
    e: InputEvent & {currentTarget: HTMLInputElement}
  ) => {
    const v = e.currentTarget.value
    const sprung = v.length - vorher
    vorher = v.length
    if (sprung >= 4 || e.inputType === 'insertReplacementText')
      verborgenFertig()
  }
  const verborgenFertig = () => {
    const v = verborgen?.value ?? ''
    if (!v) return
    if (verborgen) verborgen.value = ''
    vorher = 0
    verborgen?.blur()
    setManager(false)
    void reiche(v, true)
  }
  const oeffneManager = () => {
    setManagerHinweis(null)
    setManager(true)
    // im selben Tipp fokussieren, sonst öffnet iOS die Tastatur nicht
    verborgen?.focus()
  }
  const einfuegen = async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim()
      if (!t) {
        setManagerHinweis(
          'Die Zwischenablage ist leer — erst im Passwortmanager kopieren.'
        )
        return
      }
      if (verborgen) verborgen.value = t
      verborgenFertig()
    } catch {
      setManagerHinweis(
        'Einfügen ging nicht — lang ins Feld drücken und „Einfügen“ wählen.'
      )
      verborgen?.focus()
    }
  }

  const zeichenAn = (i: number): string => {
    if (!bild()) return ZEICHEN[i]
    const dank = DANK.find(([j]) => j === i)
    return dank ? dank[1] : BILD[i]
  }
  const leuchtet = (i: number) =>
    bild() && (MARKE.includes(i) || DANK.some(([j]) => j === i))

  const warteText = () => {
    const s = Math.ceil(sperre() / 1000)
    return s >= 60
      ? `Zu viele Versuche — noch ${Math.ceil(s / 60)} min warten`
      : `Zu viele Versuche — noch ${s} s warten`
  }

  return (
    <div class="rz-schloss" classList={{weg: phase() === 'offen'}}>
      <Show when={props.kopf}>
        <div class="rz-schloss-kopf">{props.kopf}</div>
      </Show>
      <div
        class="rz-schloss-feld"
        classList={{
          zuendet: phase() === 'zuendet',
          dunkel: phase() !== 'zuendet',
          falsch: phase() === 'falsch',
          offen: phase() === 'offen'
        }}
        role="group"
        aria-label="Röhrenfeld: Code antippen"
      >
        <For each={ZEICHEN.split('')}>
          {(_, i) => (
            <button
              type="button"
              class="tube"
              classList={{
                marke: leuchtet(i()),
                druck: gedrueckt() === i()
              }}
              style={{
                '--d': `${leuchtet(i()) ? (Math.random() * 0.35).toFixed(2) : verzug[i()]}s`,
                '--od': `${aus[i()]}s`
              }}
              aria-label={ZEICHEN[i()]}
              onPointerDown={() => setGedrueckt(i())}
              onPointerUp={() => setGedrueckt(null)}
              onPointerLeave={() => setGedrueckt(null)}
              onPointerCancel={() => setGedrueckt(null)}
              onClick={() => tippe(i())}
            >
              <span class="glow" />
              {/* neu nach jedem Tippen, damit das Nachglimmen von vorn beginnt */}
              <Show
                when={treffer()[i()] ?? 0}
                keyed
                fallback={<Zeichen z={zeichenAn(i())} />}
              >
                {n => (
                  <span class="treffer" data-n={n}>
                    <Zeichen z={zeichenAn(i())} />
                  </span>
                )}
              </Show>
            </button>
          )}
        </For>
      </div>

      <Show when={props.fehlerZeile}>
        <p class="rz-schloss-warte rz-schloss-zeile">{props.fehlerZeile}</p>
      </Show>
      <div class="rz-schloss-fuss">
        <Show
          when={sperre() === 0}
          fallback={<p class="rz-schloss-warte">{warteText()}</p>}
        >
          <button
            type="button"
            class="rz-schloss-taste"
            aria-label="Letztes Zeichen löschen"
            disabled={!code() || !nimmtAn()}
            onClick={loesche}
          >
            ⌫
          </button>
          <span class="rz-schloss-punkte" aria-live="polite">
            <Show
              when={code().length > 0 || laenge() !== null}
              fallback={<span class="leer">Code antippen</span>}
            >
              {/* bekannte Länge: leere Punkte füllen sich — man sieht, wie viele noch fehlen */}
              <For
                each={Array.from(
                  {length: Math.max(laenge() ?? 0, code().length)},
                  (_, k) => k
                )}
              >
                {k => (
                  <span class="punkt" classList={{hohl: k >= code().length}} />
                )}
              </For>
            </Show>
          </span>
          <Show
            when={code().length > 0 && laenge() === null}
            fallback={
              <button
                type="button"
                class="rz-schloss-taste rz-schloss-schluessel"
                aria-label="Mit dem Passwortmanager"
                title="Mit dem Passwortmanager"
                disabled={phase() === 'prueft' || phase() === 'offen'}
                onClick={oeffneManager}
              >
                {phase() === 'prueft' ? '…' : <Schluessel />}
              </button>
            }
          >
            <button
              type="button"
              class="rz-schloss-taste an"
              disabled={!knopfBereit()}
              onClick={() => void reiche(code(), false)}
            >
              {phase() === 'prueft' ? '…' : props.aktion}
            </button>
          </Show>
        </Show>
      </div>
      {/* Feld für den Passwortmanager: unsichtbar, bis der Schlüssel es öffnet — dann eine Zeile mit
      Feld, „Einfügen“ und ✕; hier setzen Schlüsselbund und Bitwarden ein */}
      <Show when={manager() && managerHinweis()}>
        <p class="rz-schloss-warte rz-schloss-zeile">{managerHinweis()}</p>
      </Show>
      <form
        class="rz-verborgen"
        classList={{offen: manager()}}
        onSubmit={e => {
          e.preventDefault()
          verborgenFertig()
        }}
      >
        <input
          type="text"
          name="username"
          autocomplete="username"
          value="LNURLcash"
          readOnly
          tabIndex={-1}
          aria-hidden="true"
        />
        <input
          ref={verborgen}
          type="password"
          name="password"
          autocomplete={props.autocomplete}
          autocapitalize="off"
          spellcheck={false}
          aria-label="Code aus dem Passwortmanager"
          placeholder="Code aus dem Passwortmanager"
          onInput={verborgenEingabe}
        />
        <Show when={manager()}>
          <button
            type="button"
            class="rz-schloss-taste an"
            onClick={() => void einfuegen()}
          >
            Einfügen
          </button>
          <button
            type="button"
            class="rz-schloss-taste"
            aria-label="Schließen"
            onClick={() => {
              setManager(false)
              verborgen?.blur()
            }}
          >
            ✕
          </button>
        </Show>
      </form>
      {props.unten}
    </div>
  )
}

export default Roehrenfeld
