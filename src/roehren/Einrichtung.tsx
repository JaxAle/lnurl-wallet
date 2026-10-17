// Einrichtung wie im Prototyp (onb-words → onb-check → onb-lock), statt der Karten des Originals (Steve,
// 2026-10-15): zwölf Wörter als nummeriertes Raster, kurze Prüfung zweier Wörter, Passwort. Wiederherstellen
// mit den zwölf Wörtern, danach sucht die Wallet von selbst nach Scheinen (Wiederfinden).
//
// Über eine bestehende Wallet wird nicht mehr blind wiederhergestellt: das hinterließ am iPad zwei Schlüssel
// und eine Sackgasse (Gerhard, 2026-10-15). Gibt es schon eine Wallet, führt der Weg zu „Passwort vergessen“
// oder zuerst zum Entfernen der bestehenden. Die Arbeit tut setup() des Originals (WalletContext).
import type {Component} from 'solid-js'
import {createSignal, For, Match, Show, Switch} from 'solid-js'
import {A, useNavigate, useSearchParams} from '@solidjs/router'
import {wordlist} from '@scure/bip39/wordlists/english.js'

import {generateSeedPhrase} from '../keys'
import {useWallet} from '../WalletContext'
import Wiederfinden from './Wiederfinden'
import CodeFestlegen from './CodeFestlegen'
import {merkeLaenge, vergissLaenge} from './roehrencode'
import {satzAus, woerterAus, woerterProblem} from './woerter'
import './roehren.css'

type Schritt = 'woerter' | 'pruefung' | 'eingabe' | 'passwort' | 'suchen'

const zufall = (n: number) => Math.floor(Math.random() * n)
const mische = <T,>(a: T[]) =>
  a
    .map(x => [Math.random(), x] as const)
    .sort((x, y) => x[0] - y[0])
    .map(x => x[1])

const Schritte: Component<{n: number}> = props => (
  <div class="rz-schritte" aria-label={`Schritt ${props.n} von 3`}>
    <For each={[1, 2, 3]}>{i => <i classList={{an: i <= props.n}} />}</For>
  </div>
)

const Einrichtung: Component = () => {
  const {setup, state} = useWallet()
  const navigate = useNavigate()
  const [suche] = useSearchParams()
  // Modus als Signal: „Du hast schon zwölf Wörter? Wiederherstellen“ wechselt ohne Umweg
  const [wiederherstellen, setWiederherstellen] = createSignal(
    suche.tab === 'restore'
  )
  const vorhanden = state() !== 'none'

  const [schritt, setSchritt] = createSignal<Schritt>(
    wiederherstellen() ? 'eingabe' : 'woerter'
  )
  const [seed] = createSignal(wiederherstellen() ? '' : generateSeedPhrase())
  const woerterNeu = () => seed().split(' ')
  const [eingabe, setEingabe] = createSignal('')
  const [ohne, setOhne] = createSignal(false)
  const [arbeitet, setArbeitet] = createSignal(false)
  const [fehler, setFehler] = createSignal<string | null>(null)

  // Prüfung: zwei Wörter, je vier Möglichkeiten (Prototyp: Nummer 4 und 10, hier zufällig)
  const quiz = (() => {
    if (wiederherstellen()) return []
    const a = zufall(6)
    const b = 6 + zufall(6)
    return [a, b].map(i => ({
      i,
      wahl: mische([
        woerterNeu()[i],
        ...mische(wordlist.filter(w => !woerterNeu().includes(w))).slice(0, 3)
      ])
    }))
  })()
  const [richtig, setRichtig] = createSignal<boolean[]>(quiz.map(() => false))
  const [falsch, setFalsch] = createSignal<(string | null)[]>(
    quiz.map(() => null)
  )

  // code: auf den Röhren festgelegt (oder aus dem Passwortmanager); undefined = ohne Code
  const fertig = async (code?: string, ausManager = false) => {
    setArbeitet(true)
    setFehler(null)
    try {
      const s = wiederherstellen() ? satzAus(eingabe()) : seed()
      await setup(s, code, !wiederherstellen())
      if (code && !ausManager) merkeLaenge(code.length)
      else vergissLaenge()
      if (wiederherstellen()) setSchritt('suchen')
      else navigate('/wallet')
    } catch (err) {
      setFehler((err as Error).message)
    } finally {
      setArbeitet(false)
    }
  }

  const titel = () =>
    ({
      woerter: 'Deine zwölf Wörter',
      pruefung: 'Kurz prüfen',
      eingabe: 'Mit zwölf Wörtern wiederherstellen',
      passwort: 'Passwort',
      suchen: 'Scheine wiederfinden'
    })[schritt()]

  const zurueck = () => {
    const s = schritt()
    if (s === 'pruefung') setSchritt('woerter')
    else if (s === 'passwort')
      setSchritt(wiederherstellen() ? 'eingabe' : 'pruefung')
    else navigate('/')
  }

  return (
    <div class="page rz-einstellungen rz-einrichtung">
      <div class="rz-seitenkopf">
        <Show when={schritt() !== 'suchen'}>
          <button
            type="button"
            class="rz-zurueck"
            aria-label="Zurück"
            onClick={zurueck}
          >
            ‹
          </button>
        </Show>
        <h2>{titel()}</h2>
      </div>

      <Show
        when={!vorhanden || schritt() === 'suchen'}
        fallback={
          <div class="rz-frage">
            <h3>Auf diesem Gerät gibt es schon eine Wallet.</h3>
            <p>
              {wiederherstellen()
                ? 'Hast du nur das Passwort vergessen? Dann setz mit deinen zwölf Wörtern ein neues — es bleibt dieselbe Wallet mit allen Scheinen.'
                : 'Eine zweite Wallet auf demselben Gerät geht nicht.'}
            </p>
            <Show when={wiederherstellen()}>
              <A
                href="/passwort-vergessen"
                class="rz-knopf an rz-weiter rz-link-knopf"
              >
                <span class="lbl">Passwort vergessen</span>
              </A>
            </Show>
            <p class="rz-hinweis">
              Willst du wirklich eine andere Wallet hier haben: zuerst unter
              Einstellungen › Gerät die bestehende entfernen — vorher eine
              Sicherung herunterladen.
            </p>
            <A href="/wallet" class="rz-leise rz-block rz-mitte">
              Zur bestehenden Wallet
            </A>
          </div>
        }
      >
        <Switch>
          <Match when={schritt() === 'woerter'}>
            <Schritte n={1} />
            <p class="rz-text">
              Diese Wörter sind der einzige Weg zurück zu deinem Geld, wenn das
              Handy verloren geht. <b>Schreib sie auf Papier</b>, in dieser
              Reihenfolge.
            </p>
            <div class="rz-woerter">
              <For each={woerterNeu()}>
                {(w, i) => (
                  <div class="rz-wort">
                    <b>{i() + 1}</b>
                    <span>{w}</span>
                  </div>
                )}
              </For>
            </div>
            <p class="rz-hinweis">
              Niemand wird dich je nach diesen Wörtern fragen. Auch wir nicht.
            </p>
            <button
              type="button"
              class="rz-aendern rz-block"
              onClick={() => {
                setWiederherstellen(true)
                setSchritt('eingabe')
              }}
            >
              Du hast schon zwölf Wörter? Wiederherstellen ›
            </button>
            <button
              type="button"
              class="rz-knopf an rz-weiter"
              onClick={() => setSchritt('pruefung')}
            >
              <span class="lbl">Aufgeschrieben</span>
            </button>
          </Match>

          <Match when={schritt() === 'pruefung'}>
            <Schritte n={2} />
            <p class="rz-text">
              Damit sicher nichts fehlt: Tipp die richtigen Wörter an.
            </p>
            <For each={quiz}>
              {(q, qi) => (
                <div class="rz-gruppe">
                  <span class="rz-eyebrow">Wort Nummer {q.i + 1}</span>
                  <div class="rz-quiz">
                    <For each={q.wahl}>
                      {w => (
                        <button
                          type="button"
                          classList={{
                            richtig: richtig()[qi()] && w === woerterNeu()[q.i],
                            falsch: falsch()[qi()] === w
                          }}
                          onClick={() => {
                            const ok = w === woerterNeu()[q.i]
                            setRichtig(r =>
                              r.map((x, j) => (j === qi() ? x || ok : x))
                            )
                            setFalsch(f =>
                              f.map((x, j) =>
                                j === qi() ? (ok ? null : w) : x
                              )
                            )
                          }}
                        >
                          {w}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
            <button
              type="button"
              class="rz-knopf an rz-weiter"
              disabled={!richtig().every(Boolean)}
              onClick={() => setSchritt('passwort')}
            >
              <span class="lbl">Weiter</span>
            </button>
          </Match>

          <Match when={schritt() === 'eingabe'}>
            <p class="rz-text">
              Gib deine zwölf Wörter ein, in der aufgeschriebenen Reihenfolge.
            </p>
            <textarea
              class="rz-feld"
              rows="4"
              placeholder="zwölf Wörter, mit Leerzeichen getrennt"
              autocomplete="off"
              autocapitalize="off"
              spellcheck={false}
              data-1p-ignore
              data-lpignore="true"
              value={eingabe()}
              onInput={e => setEingabe(e.currentTarget.value)}
            />
            <Show
              when={
                woerterAus(eingabe()).length >= 12 &&
                !!woerterProblem(eingabe())
              }
            >
              <p class="rz-hinweis">{woerterProblem(eingabe())}</p>
            </Show>
            <button
              type="button"
              class="rz-knopf an rz-weiter"
              disabled={!!woerterProblem(eingabe())}
              onClick={() => setSchritt('passwort')}
            >
              <span class="lbl">Weiter</span>
            </button>
            <p class="rz-hinweis">
              Du hast eine Sicherungsdatei?{' '}
              <A href="/settings/sicherung-einspielen">
                Sicherung einspielen ›
              </A>
            </p>
          </Match>

          <Match when={schritt() === 'passwort'}>
            {/* Code festlegen auf den Röhren, mit Schlüssel für den Passwortmanager (Steve, 2026-10-17) —
            ein iPhone-Tester nahm hier den Vorschlag des Schlüsselbunds an und kam danach nicht weiter */}
            <Show
              when={ohne()}
              fallback={
                <CodeFestlegen
                  titel={
                    wiederherstellen() ? 'Code für dieses Gerät' : 'Dein Code'
                  }
                  zurueck={() =>
                    setSchritt(wiederherstellen() ? 'eingabe' : 'pruefung')
                  }
                  onCode={async (code, ausManager) => {
                    await fertig(code, ausManager)
                    return fehler()
                  }}
                  unten={
                    <button
                      type="button"
                      class="rz-schloss-vergessen rz-leise"
                      onClick={() => setOhne(true)}
                    >
                      Ohne Code weiter
                    </button>
                  }
                />
              }
            >
              <Show when={!wiederherstellen()}>
                <Schritte n={3} />
              </Show>
              <p class="rz-erkannt fremd">
                Ohne Code liegt der Schlüssel offen im Browser — wer dieses
                Gerät benutzt, kann deine Scheine ausgeben. Ein Code lässt sich
                später unter Einstellungen setzen.
              </p>
              <Show when={fehler()}>
                <p class="rz-erkannt fremd">{fehler()}</p>
              </Show>
              <button
                type="button"
                class="rz-knopf an rz-weiter"
                disabled={arbeitet()}
                onClick={() => void fertig()}
              >
                <span class="lbl">
                  {arbeitet()
                    ? 'Einen Moment …'
                    : wiederherstellen()
                      ? 'Wiederherstellen'
                      : 'Wallet anlegen'}
                </span>
              </button>
              <button
                type="button"
                class="rz-aendern rz-block rz-mitte"
                onClick={() => setOhne(false)}
              >
                Doch mit Code
              </button>
            </Show>
          </Match>

          <Match when={schritt() === 'suchen'}>
            <Wiederfinden onFertig={() => navigate('/wallet')} />
          </Match>
        </Switch>
      </Show>
    </div>
  )
}

export default Einrichtung
