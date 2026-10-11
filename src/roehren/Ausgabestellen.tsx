// Ausgabestellen wie im Prototyp (screens.mints): eine ruhige Liste — Stelle, Adresse, rechts das
// Guthaben dort oder „Standard“; antippen macht sie zum Standard fürs Aufladen. Darunter ein Knopf
// „Ausgabestelle hinzufügen“ (im Prototyp offen gelassen, Steve 2026-10-11): aus der Liste der
// bekannten Stellen wählen oder eine Adresse eingeben, dann eine Frage in Menschensprache statt
// „Diesem Schlüssel vertrauen“ — der Schlüssel steht zugeklappt unter „Technische Angaben“.
//
// Nur das Bild ist hier. Nachschlagen und Eintragen sind addByAddress/confirmAddressTrust des
// Originals in pages/Mint.tsx; dessen ganze Seite bleibt als Werkstatt unter /mint/werkstatt.
import type {Accessor, Component} from 'solid-js'
import {createMemo, createSignal, For, Show} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import {resolveMintInput, serverOf, serviceOriginOf} from '../lnurlcash'
import {offlineMode} from '../offlineMode'
import {isMintTrusted, PUBLIC_MINTS, trustedMints} from '../trustedMints'
import {useWallet} from '../WalletContext'
import {setStandard, standardStelle} from './standard'
import './roehren.css'

export type HinzufuegeMotor = {
  nachschlagen: (adresse: string) => Promise<void>
  frage: Accessor<{server: string; pubkey: string} | null>
  sucht: Accessor<boolean>
  ja: () => void
  nein: () => void
}

const zahl = (n: number) => n.toLocaleString('de-DE')

const Bank: Component = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
  </svg>
)
const Pfeil: Component = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 5l7 7-7 7" />
  </svg>
)

const Kopf: Component<{titel: string; zurueck?: string}> = props => {
  const navigate = useNavigate()
  return (
    <div class="rz-seitenkopf">
      <button
        type="button"
        class="rz-zurueck"
        aria-label="Zurück"
        onClick={() => (props.zurueck ? navigate(props.zurueck) : history.length > 1 ? history.back() : navigate('/settings'))}
      >
        ‹
      </button>
      <h2>{props.titel}</h2>
    </div>
  )
}

export const AusgabestellenListe: Component = () => {
  const {state, bearers} = useWallet()
  const std = () => standardStelle(trustedMints())
  const guthaben = createMemo(() => {
    const je = new Map<string, number>()
    if (state() !== 'unlocked') return je
    for (const b of bearers()) {
      if (b.spent) continue
      const h = serverOf(b.url)
      je.set(h, (je.get(h) ?? 0) + Math.floor(b.amount / 1000))
    }
    return je
  })

  return (
    <div class="page rz-stellen">
      <Kopf titel="Ausgabestellen" />
      <p class="rz-hinweis">
        Ausgabestellen verwahren die echten Sats hinter deinen Scheinen. Verteile größere Beträge ruhig auf
        mehrere.
      </p>
      <Show when={trustedMints().length > 0} fallback={<p class="rz-hinweis">Noch keine Ausgabestelle eingetragen.</p>}>
        <div class="rz-liste">
          <For each={trustedMints()}>
            {m => {
              const host = serverOf(m.server)
              const istStandard = () => std()?.server === m.server
              return (
                <button type="button" class="rz-eintrag-kopf rz-stelle-zeile" onClick={() => setStandard(m.server)}>
                  <span class="ic in">
                    <Bank />
                  </span>
                  <span class="mitte">
                    <span class="t">{m.nodeAlias || host}</span>
                    <span class="s">
                      {m.pendingMintPubkey ? 'Neuer Prüfschlüssel — in der Werkstatt ansehen' : host}
                    </span>
                  </span>
                  <Show
                    when={istStandard()}
                    fallback={
                      <span class="amt">
                        {zahl(guthaben().get(host) ?? 0)}
                        <span class="einheit">Sats</span>
                      </span>
                    }
                  >
                    <span class="rz-marke">Standard</span>
                  </Show>
                </button>
              )
            }}
          </For>
        </div>
        <Show when={trustedMints().length > 1}>
          <p class="rz-hinweis">Antippen macht eine Stelle zum Standard fürs Aufladen.</p>
        </Show>
      </Show>
      <A href="/mint/hinzufuegen" class="rz-knopf an rz-weiter rz-link-knopf">
        <span class="lbl">Ausgabestelle hinzufügen</span>
      </A>
    </div>
  )
}

export const AusgabestelleHinzufuegen: Component<{motor: HinzufuegeMotor}> = props => {
  const m = props.motor
  const navigate = useNavigate()
  const [text, setText] = createSignal('')
  const [technik, setTechnik] = createSignal(false)

  const bekannte = () =>
    PUBLIC_MINTS.map(a => ({adresse: a, url: resolveMintInput(a)}))
      .filter(x => x.url && !isMintTrusted(serviceOriginOf(x.url)))
      .map(x => ({adresse: x.adresse, host: serverOf(x.url!)}))

  const ja = () => {
    const f = m.frage()
    m.ja()
    if (f && isMintTrusted(f.server)) navigate('/mint')
  }

  return (
    <div class="page rz-stellen">
      <Show
        when={m.frage()}
        fallback={
          <>
            <Kopf titel="Ausgabestelle hinzufügen" zurueck="/mint" />
            <Show when={bekannte().length > 0}>
              <span class="rz-eyebrow rz-abstand">Aus der Liste wählen</span>
              <div class="rz-liste">
                <For each={bekannte()}>
                  {b => (
                    <button
                      type="button"
                      class="rz-eintrag-kopf"
                      disabled={m.sucht() || offlineMode()}
                      onClick={() => void m.nachschlagen(b.adresse)}
                    >
                      <span class="ic">
                        <Bank />
                      </span>
                      <span class="mitte">
                        <span class="t">{b.host}</span>
                        <span class="s">Öffentliche Ausgabestelle</span>
                      </span>
                      <span class="amt">
                        <Pfeil />
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <label class="rz-eyebrow rz-abstand" for="rz-stelle-adresse">
              Adresse eingeben
            </label>
            <input
              id="rz-stelle-adresse"
              class="rz-feld"
              type="text"
              autocapitalize="off"
              autocomplete="off"
              spellcheck={false}
              placeholder="z. B. lnurl.21linz.at"
              value={text()}
              onInput={e => setText(e.currentTarget.value)}
              onKeyDown={e => e.key === 'Enter' && text().trim() && void m.nachschlagen(text().trim())}
            />
            <p class="rz-hinweis">Die Adresse steht auf der Webseite der Stelle oder am Aushang beim Meetup.</p>
            <button
              type="button"
              class="rz-knopf an rz-weiter"
              disabled={!text().trim() || m.sucht() || offlineMode()}
              onClick={() => void m.nachschlagen(text().trim())}
            >
              <span class="lbl">{m.sucht() ? 'Einen Moment …' : 'Weiter'}</span>
            </button>
          </>
        }
      >
        {f => (
          <>
            <Kopf titel="Ausgabestelle hinzufügen" zurueck="/mint/hinzufuegen" />
            <div class="rz-frage">
              <h3>{serverOf(f().server)} hinzufügen?</h3>
              <p>
                Hier kannst du künftig aufladen, und Scheine dieser Stelle erkennt deine Wallet als echt. Die Stelle
                verwahrt die Sats hinter diesen Scheinen.
              </p>
              <p class="rz-hinweis">
                Füge nur Stellen hinzu, deren Adresse du von ihnen selbst hast — von ihrer Webseite oder vom Aushang
                beim Meetup, nicht aus einer weitergeleiteten Nachricht.
              </p>
              <div class="rz-duo">
                <button type="button" class="rz-knopf an" onClick={ja}>
                  <span class="lbl">Hinzufügen</span>
                </button>
                <button type="button" class="rz-leise" onClick={() => m.nein()}>
                  Abbrechen
                </button>
              </div>
              <button type="button" class="rz-aendern rz-technik" onClick={() => setTechnik(v => !v)}>
                Technische Angaben {technik() ? '‹' : '›'}
              </button>
              <Show when={technik()}>
                <p class="rz-hinweis">
                  Prüfschlüssel der Stelle — damit erkennt die Wallet ihre Scheine:
                  <br />
                  <code class="rz-schluessel">{f().pubkey}</code>
                </p>
              </Show>
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
