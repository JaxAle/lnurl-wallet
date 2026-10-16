// Entsperren auf dem Röhrenfeld, nach dem Prototyp (screens.lock, Gerhard, 2026-10-16): 40 Röhren zünden,
// gehen aus, man tippt den Code; richtig → die Röhren ordnen sich zum Bild der Vorlage, LN · URL · CASH
// glüht auf, unten „by DNI“, dann öffnet die Wallet. Anders als im Prototyp kennt die Wallet die Länge des
// Codes nicht (er schützt die Verschlüsselung, nichts liegt zum Vergleichen da) — darum zeigt eine Zeile
// unter dem Feld, wie viele Zeichen getippt sind, mit ⌫ und „Öffnen“.
import type {Component} from 'solid-js'
import {createSignal, For, onCleanup, onMount, Show} from 'solid-js'
import {A} from '@solidjs/router'

import {useWallet} from '../WalletContext'
import {pruefePasswort} from './passwort'
import {
  fehlversuch,
  geschafft,
  kandidaten,
  wartenBis,
  ZEICHEN
} from './roehrencode'
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
const ZEIGEN_MS = 2400

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

const Roehrenschloss: Component = () => {
  const {unlock} = useWallet()
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

  const sperre = () => Math.max(0, wartenBis() - jetzt())

  onMount(() => {
    document.body.classList.add('rz-gesperrt')
    spaeter(() => setPhase('bereit'), 1900)
    const takt = setInterval(() => setJetzt(Date.now()), 1000)
    onCleanup(() => clearInterval(takt))
  })
  onCleanup(() => {
    uhren.forEach(clearTimeout)
    document.body.classList.remove('rz-gesperrt')
  })

  const tippe = (i: number) => {
    if (phase() !== 'bereit' || sperre() > 0) return
    setCode(c => (c.length < 64 ? c + ZEICHEN[i] : c))
    setTreffer(t => ({...t, [i]: (t[i] ?? 0) + 1}))
    try {
      navigator.vibrate?.(8)
    } catch {
      // kein Vibrieren
    }
  }
  const loesche = () => phase() === 'bereit' && setCode(c => c.slice(0, -1))

  const oeffne = async () => {
    if (phase() !== 'bereit' || !code() || sperre() > 0) return
    setPhase('prueft')
    let richtig: string | null = null
    for (const k of kandidaten(code())) {
      if (await pruefePasswort(k)) {
        richtig = k
        break
      }
    }
    if (!richtig) {
      fehlversuch()
      setJetzt(Date.now())
      setPhase('falsch')
      spaeter(() => {
        setCode('')
        setTreffer({})
        setPhase('bereit')
      }, 600)
      return
    }
    geschafft()
    setTreffer({})
    setCode('')
    setBild(true)
    setPhase('offen')
    const pw = richtig
    spaeter(() => {
      void unlock(pw).catch(() => {
        // zwischen Prüfen und Öffnen geändert? dann noch einmal von vorn
        setBild(false)
        setCode('')
        setPhase('bereit')
      })
    }, ZEIGEN_MS)
  }

  // Tastatur am Rechner: tippen, ⌫, Enter
  const taste = (e: KeyboardEvent) => {
    if (e.key === 'Enter') return void oeffne()
    if (e.key === 'Backspace') return void loesche()
    const i = ZEICHEN.indexOf(e.key.toUpperCase())
    if (i >= 0 && e.key.length === 1) tippe(i)
  }
  onMount(() => document.addEventListener('keydown', taste))
  onCleanup(() => document.removeEventListener('keydown', taste))

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
              {/* key: nach jedem Tippen neu, damit das Nachglimmen von vorn beginnt */}
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

      <div class="rz-schloss-fuss">
        <Show
          when={sperre() === 0}
          fallback={<p class="rz-schloss-warte">{warteText()}</p>}
        >
          <button
            type="button"
            class="rz-schloss-taste"
            aria-label="Letztes Zeichen löschen"
            disabled={!code() || phase() !== 'bereit'}
            onClick={loesche}
          >
            ⌫
          </button>
          <span class="rz-schloss-punkte" aria-live="polite">
            <Show
              when={code().length > 0}
              fallback={<span class="leer">Code antippen</span>}
            >
              <For each={code().split('')}>{() => <span class="punkt" />}</For>
            </Show>
          </span>
          <button
            type="button"
            class="rz-schloss-taste an"
            disabled={!code() || phase() !== 'bereit'}
            onClick={() => void oeffne()}
          >
            {phase() === 'prueft' ? '…' : 'Öffnen'}
          </button>
        </Show>
      </div>
      <A href="/passwort-vergessen" class="rz-schloss-vergessen">
        Code vergessen?
      </A>
    </div>
  )
}

export default Roehrenschloss
