// Zwölf Wörter (Gerhard/Steve, 2026-10-19): hinter dem Code abrufbar. Die Tür ist jedes Mal das Röhrenfeld,
// auch bei offener Wallet. Danach: anzeigen (verschwindet nach einer Minute oder beim Verlassen), 4 Wörter
// prüfen (Gerhard: 4 genügen — „stimmt mein Zettel?“), oder — bei einer Wallet von früher, für die nie
// etwas abgelegt wurde — hinterlegen: einmal eintippen, die Wallet prüft gegen ihre Schlüssel.
import type {Component} from 'solid-js'
import {createSignal, For, Match, onCleanup, Show, Switch} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import RequireWallet from '../components/RequireWallet'
import {useWallet} from '../WalletContext'
import {pruefePasswort, woerterPassen} from './passwort'
import Roehrenfeld from './Roehrenfeld'
import {codeLaenge, kandidaten} from './roehrencode'
import {satzAus, woerterAus, woerterProblem} from './woerter'
import {
  hatWoerter,
  leseWoerter,
  speichereWoerter,
  vierStellen
} from './woerterTresor'
import './roehren.css'

const ANZEIGE_MS = 60_000

const WoerterSeite: Component = () => {
  const {encrypted} = useWallet()
  const navigate = useNavigate()
  const mitCode = encrypted()
  // undefined = noch nicht geöffnet; '' = Wallet ohne Code
  const [code, setCode] = createSignal<string | undefined>(
    mitCode ? undefined : ''
  )
  const [ansicht, setAnsicht] = createSignal<
    'wahl' | 'zeigen' | 'pruefen' | 'hinterlegen'
  >(hatWoerter() ? 'wahl' : 'hinterlegen')
  const [woerter, setWoerter] = createSignal<string[]>([])
  const [rest, setRest] = createSignal(ANZEIGE_MS / 1000)
  const [stellen, setStellen] = createSignal<number[]>([])
  const [eingaben, setEingaben] = createSignal<string[]>(['', '', '', ''])
  const [ergebnis, setErgebnis] = createSignal<string | null>(null)
  const [eingabe, setEingabe] = createSignal('')
  const [fehler, setFehler] = createSignal<string | null>(null)
  let uhr: ReturnType<typeof setInterval> | undefined

  const verbergen = () => {
    if (uhr) clearInterval(uhr)
    uhr = undefined
    setWoerter([])
  }
  onCleanup(verbergen)

  const oeffne = async (c: string) => {
    for (const k of kandidaten(c)) {
      if (await pruefePasswort(k)) {
        setCode(k)
        return 'weiter' as const
      }
    }
    return 'falsch' as const
  }

  const lade = async (): Promise<string[] | null> => {
    const w = await leseWoerter(code() || undefined).catch(() => null)
    // passt nicht (mehr) zu dieser Wallet, z. B. nach Einspielen einer Sicherung: neu hinterlegen
    if (!w || !(await woerterPassen(w, code() || undefined))) {
      setAnsicht('hinterlegen')
      return null
    }
    return w.split(' ')
  }

  const zeige = async () => {
    const w = await lade()
    if (!w) return
    setWoerter(w)
    setAnsicht('zeigen')
    setRest(ANZEIGE_MS / 1000)
    uhr = setInterval(() => {
      setRest(r => r - 1)
      if (rest() <= 0) {
        verbergen()
        setAnsicht('wahl')
      }
    }, 1000)
  }

  const pruefeStart = () => {
    setStellen(vierStellen())
    setEingaben(['', '', '', ''])
    setErgebnis(null)
    setAnsicht('pruefen')
  }
  const pruefe = async () => {
    const w = await lade()
    if (!w) return
    const falsch = stellen().find(
      (s, i) => (woerterAus(eingaben()[i])[0] ?? '') !== w[s]
    )
    setErgebnis(
      falsch === undefined
        ? 'Stimmt — dein Zettel ist richtig.'
        : `Wort ${falsch + 1} stimmt nicht — sieh auf deinem Zettel nach.`
    )
  }

  const hinterlege = async () => {
    setFehler(null)
    const p = woerterProblem(eingabe())
    if (p) return setFehler(p)
    if (!(await woerterPassen(eingabe(), code() || undefined)))
      return setFehler('Diese Wörter gehören nicht zu dieser Wallet.')
    await speichereWoerter(satzAus(eingabe()), code() || undefined)
    setEingabe('')
    setAnsicht('wahl')
  }

  return (
    <RequireWallet>
      <div class="page rz-einstellungen">
        <Show
          when={code() !== undefined}
          fallback={
            <Roehrenfeld
              onCode={oeffne}
              aktion="Weiter"
              autocomplete="current-password"
              laenge={codeLaenge()}
              kopf={
                <>
                  <div class="rz-seitenkopf">
                    <button
                      type="button"
                      class="rz-zurueck"
                      aria-label="Zurück"
                      onClick={() => navigate('/settings')}
                    >
                      ‹
                    </button>
                    <h2>Zwölf Wörter</h2>
                  </div>
                  <p>Erst dein Code — die Wörter sind das Geld.</p>
                </>
              }
            />
          }
        >
          <div class="rz-seitenkopf">
            <A href="/settings" class="rz-zurueck" aria-label="Zurück">
              ‹
            </A>
            <h2>Zwölf Wörter</h2>
          </div>
          <Switch>
            <Match when={ansicht() === 'wahl'}>
              <p class="rz-hinweis">
                Mit den zwölf Wörtern stellst du die Wallet auf einem neuen
                Gerät wieder her.
              </p>
              <div class="rz-gruppe">
                <button
                  type="button"
                  class="rz-setting"
                  onClick={() => void zeige()}
                >
                  <span>
                    <span class="sl">Anzeigen</span>
                    <span class="s">Eine Minute lang, zum Abschreiben</span>
                  </span>
                  <span class="val">›</span>
                </button>
                <button type="button" class="rz-setting" onClick={pruefeStart}>
                  <span>
                    <span class="sl">Prüfen</span>
                    <span class="s">4 Wörter von deinem Zettel eintippen</span>
                  </span>
                  <span class="val">›</span>
                </button>
              </div>
            </Match>

            <Match when={ansicht() === 'zeigen'}>
              <p class="rz-erkannt fremd">
                Nur auf Papier abschreiben, nicht fotografieren.
              </p>
              <div class="rz-woerter">
                <For each={woerter()}>
                  {(w, i) => (
                    <div class="rz-wort">
                      <b>{i() + 1}</b>
                      <span>{w}</span>
                    </div>
                  )}
                </For>
              </div>
              <p class="rz-hinweis rz-mitte">Verschwindet in {rest()} s</p>
              <button
                type="button"
                class="rz-knopf an rz-weiter"
                onClick={() => {
                  verbergen()
                  setAnsicht('wahl')
                }}
              >
                <span class="lbl">Fertig</span>
              </button>
            </Match>

            <Match when={ansicht() === 'pruefen'}>
              <p class="rz-hinweis">
                Tipp diese vier Wörter von deinem Zettel ein.
              </p>
              <For each={stellen()}>
                {(s, i) => (
                  <>
                    <label class="rz-feldname" for={`wp-${s}`}>
                      Wort {s + 1}
                    </label>
                    <input
                      id={`wp-${s}`}
                      class="rz-feld rz-feld-text"
                      autocomplete="off"
                      autocapitalize="off"
                      spellcheck={false}
                      data-1p-ignore
                      data-lpignore="true"
                      value={eingaben()[i()]}
                      onInput={e => {
                        const v = e.currentTarget.value
                        setEingaben(x => x.map((y, k) => (k === i() ? v : y)))
                        setErgebnis(null)
                      }}
                    />
                  </>
                )}
              </For>
              <Show when={ergebnis()}>
                <p
                  class="rz-erkannt"
                  classList={{fremd: !ergebnis()!.startsWith('Stimmt')}}
                >
                  {ergebnis()}
                </p>
              </Show>
              <button
                type="button"
                class="rz-knopf an rz-weiter"
                disabled={eingaben().some(x => !x.trim())}
                onClick={() => void pruefe()}
              >
                <span class="lbl">Prüfen</span>
              </button>
              <button
                type="button"
                class="rz-leise"
                onClick={() => setAnsicht('wahl')}
              >
                Zurück
              </button>
            </Match>

            <Match when={ansicht() === 'hinterlegen'}>
              <p class="rz-hinweis">
                Für diese Wallet sind die Wörter noch nicht hinterlegt — sie
                stammt aus der Zeit, als die Wallet sie nur einmal zeigte. Tipp
                sie einmal ein; die Wallet prüft, dass sie zu ihr gehören, und
                legt sie hinter deinem Code ab.
              </p>
              <textarea
                class="rz-feld"
                rows="3"
                placeholder="zwölf Wörter, mit Leerzeichen getrennt"
                autocomplete="off"
                autocapitalize="off"
                spellcheck={false}
                data-1p-ignore
                data-lpignore="true"
                value={eingabe()}
                onInput={e => setEingabe(e.currentTarget.value)}
              />
              <Show when={fehler()}>
                <p class="rz-erkannt fremd">{fehler()}</p>
              </Show>
              <button
                type="button"
                class="rz-knopf an rz-weiter"
                disabled={!eingabe().trim()}
                onClick={() => void hinterlege()}
              >
                <span class="lbl">Hinterlegen</span>
              </button>
            </Match>
          </Switch>
        </Show>
      </div>
    </RequireWallet>
  )
}

export default WoerterSeite
