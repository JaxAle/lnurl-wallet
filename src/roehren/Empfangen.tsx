// Empfangen wie im Prototyp (screens.receive / scan / paste): eine Weiche aus drei Zeilen, jede
// führt auf einen eigenen Bildschirm mit ‹ zurück zur Weiche — Scannen (nur der Sucher),
// Einfügen (Feld, Erkennung, Einlösen), Aufladen (/aufladen). Was ankommt, verarbeitet die
// Startseite (uebergabe.ts) — dort zählt das Zählwerk hinauf. „Deine Adresse“ folgt später.
//
// Einfügen ist ein gewöhnliches Feld (lange drücken › Einfügen) statt der Zwischenablage-Berechtigung
// des Browsers: die lehnte Chrome am Pixel still ab, „Schein einfügen“ tat nichts (Gerhard, 2026-10-11).
import type {Component} from 'solid-js'
import {createSignal, Match, Show, Switch} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import RequireWallet from '../components/RequireWallet'
import Scanner, {canScan} from '../components/Scanner'
import {
  decodeBolt11AmountMsat,
  isBolt11Invoice,
  isLightningAddress,
  noteDeclaredAmount,
  resolveNoteInput
} from '../lnurlcash'
import {setEingang} from './uebergabe'
import {ausText} from './weitergabe'
import './roehren.css'

// Symbole wörtlich aus dem Prototyp (Konstante I: scan, paste, bolt, chev)
const SYMBOLE: Record<string, string> = {
  scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16"/>',
  paste:
    '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h4"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  chev: '<path d="M9 5l7 7-7 7"/>'
}
const Symbol: Component<{name: string}> = props => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    innerHTML={SYMBOLE[props.name]}
  />
)

type Erkannt =
  | {art: 'schein'; sats: number | null}
  | {art: 'rechnung'; sats: number | null}
  | {art: 'adresse'}
  | {art: 'unbekannt'}

// nur am Text, ohne Netz: was ist das? (Prototyp: „Sieht aus wie ein Schein über 1.500 Sats“)
const erkenne = (wert: string): Erkannt | null => {
  // eine ganze geteilte Nachricht („50 Sats für dich … lightning:LNURL1…“) → nur den Schein
  const w = ausText(wert)
  if (!w) return null
  const schein = resolveNoteInput(w)
  if (schein) {
    const msat = noteDeclaredAmount(schein)
    return {art: 'schein', sats: msat === null ? null : Math.floor(msat / 1000)}
  }
  const rechnung = w.replace(/^lightning:/i, '')
  if (isBolt11Invoice(rechnung)) {
    const msat = decodeBolt11AmountMsat(rechnung)
    return {
      art: 'rechnung',
      sats: msat === null ? null : Math.floor(msat / 1000)
    }
  }
  if (isLightningAddress(w)) return {art: 'adresse'}
  return {art: 'unbekannt'}
}
const ueber = (sats: number | null) =>
  sats === null ? '' : ` über ${sats.toLocaleString('de-DE')} Sats`

const Kopf: Component<{titel: string; zurueck: string}> = props => (
  <div class="rz-seitenkopf">
    <A href={props.zurueck} class="rz-zurueck" aria-label="Zurück">
      ‹
    </A>
    <h2>{props.titel}</h2>
  </div>
)

const Empfangen: Component<{weg?: 'scannen' | 'einfuegen'}> = props => {
  const navigate = useNavigate()
  const [text, setText] = createSignal('')
  const erkannt = () => erkenne(text())

  const uebernimm = (wert: string) => {
    const w = ausText(wert)
    if (!w) return
    setEingang(w)
    navigate('/wallet')
  }

  return (
    <RequireWallet>
      <div class="page rz-empfangen">
        <Switch>
          <Match when={props.weg === 'scannen'}>
            <Kopf titel="Scannen" zurueck="/empfangen" />
            <Show
              when={canScan()}
              fallback={
                <p class="rz-hinweis">
                  Dieses Gerät kann hier nicht scannen — füge den Schein
                  stattdessen ein.
                </p>
              }
            >
              <div class="rz-scanner">
                <Scanner onScan={uebernimm} />
              </div>
              <p class="rz-hinweis rz-mitte">
                Schein oder Rechnung in den Rahmen halten — erkannt wird von
                selbst.
              </p>
            </Show>
          </Match>

          <Match when={props.weg === 'einfuegen'}>
            <Kopf titel="Schein einfügen" zurueck="/empfangen" />
            <label class="rz-feldname" for="rz-einfuegen">
              Link oder Text vom Absender
            </label>
            <textarea
              id="rz-einfuegen"
              class="rz-feld"
              rows="4"
              spellcheck={false}
              autocapitalize="off"
              autocomplete="off"
              placeholder="Lange drücken › Einfügen"
              value={text()}
              onInput={e => setText(e.currentTarget.value)}
            />
            <Show when={erkannt()}>
              {e => (
                <p
                  class="rz-erkannt"
                  classList={{fremd: e().art === 'unbekannt'}}
                >
                  <Switch>
                    <Match when={e().art === 'schein'}>
                      Sieht aus wie ein Schein
                      {ueber((e() as {sats: number | null}).sats)}
                    </Match>
                    <Match when={e().art === 'rechnung'}>
                      Sieht aus wie eine Rechnung
                      {ueber((e() as {sats: number | null}).sats)} — die würdest
                      du bezahlen
                    </Match>
                    <Match when={e().art === 'adresse'}>
                      Sieht aus wie eine Lightning-Adresse — dorthin würdest du
                      zahlen
                    </Match>
                    <Match when={e().art === 'unbekannt'}>
                      Das ist kein Schein, keine Rechnung und keine Adresse.
                      {/* zur Fehlersuche: was ist tatsächlich angekommen? (Gerhard am Pixel, 2026-10-14) */}
                      <span class="rz-klein rz-block">
                        Erkannt wurden {ausText(text()).length} Zeichen, Anfang
                        „{ausText(text()).slice(0, 12)}“, Ende „
                        {ausText(text()).slice(-6)}“.
                      </span>
                    </Match>
                  </Switch>
                </p>
              )}
            </Show>
            <button
              type="button"
              class="rz-knopf an rz-weiter"
              disabled={!erkannt() || erkannt()!.art === 'unbekannt'}
              onClick={() => uebernimm(text())}
            >
              <span class="lbl">
                {erkannt()?.art === 'rechnung' || erkannt()?.art === 'adresse'
                  ? 'Weiter zum Bezahlen'
                  : 'Einlösen'}
              </span>
            </button>
          </Match>

          <Match when={!props.weg}>
            <Kopf titel="Empfangen" zurueck="/wallet" />
            <Show when={canScan()}>
              <A href="/empfangen/scannen" class="rz-option">
                <span class="ic">
                  <Symbol name="scan" />
                </span>
                <span>
                  <span class="t">Schein scannen</span>
                  <span class="s">Jemand zeigt dir einen QR-Code</span>
                </span>
                <Symbol name="chev" />
              </A>
            </Show>
            <A href="/empfangen/einfuegen" class="rz-option">
              <span class="ic">
                <Symbol name="paste" />
              </span>
              <span>
                <span class="t">Schein einfügen</span>
                <span class="s">Du hast einen Link oder Text bekommen</span>
              </span>
              <Symbol name="chev" />
            </A>
            <A href="/aufladen" class="rz-option">
              <span class="ic">
                <Symbol name="bolt" />
              </span>
              <span>
                <span class="t">Aufladen per Lightning</span>
                <span class="s">
                  Aus einer anderen Wallet Sats hierher holen
                </span>
              </span>
              <Symbol name="chev" />
            </A>
          </Match>
        </Switch>
      </div>
    </RequireWallet>
  )
}

export default Empfangen
