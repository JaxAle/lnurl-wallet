// Ausgabestellen wie im Prototyp (screens.mints): eine ruhige Liste — Stelle, Adresse, rechts das
// Guthaben dort oder „Standard“; antippen macht sie zum Standard fürs Aufladen. Darunter ein Knopf
// „Ausgabestelle hinzufügen“ (im Prototyp offen gelassen, Steve 2026-10-11): aus der Liste der
// bekannten Stellen wählen oder eine Adresse eingeben, dann eine Frage in Menschensprache statt
// „Diesem Schlüssel vertrauen“ — der Schlüssel steht zugeklappt unter „Technische Angaben“.
//
// Nur das Bild ist hier. Nachschlagen und Eintragen sind addByAddress/confirmAddressTrust des
// Originals in pages/Mint.tsx; dessen ganze Seite bleibt als Werkstatt unter /mint/werkstatt.
import type {Accessor, Component} from 'solid-js'
import {createEffect, createMemo, createSignal, For, Show} from 'solid-js'
import {A, useNavigate, useParams} from '@solidjs/router'

import {resolveMintInput, serverOf, serviceOriginOf} from '../lnurlcash'
import {registeredAddresses} from '../addressRegistry'
import Scanner, {canScan} from '../components/Scanner'
import {copyToClipboard, mempoolNodeUrl} from '../helpers'
import {offlineMode} from '../offlineMode'
import {getTrustedMintAddress, isMintTrusted, PUBLIC_MINTS, trustedMints} from '../trustedMints'
import type {TrustedMint} from '../trustedMints'
import {useWallet} from '../WalletContext'
import {aufladeGebuehr, frageAufladeGebuehr, teilGebuehr} from './gebuehren'
import Rueckfrage from './Rueckfrage'
import {setStandard, standardStelle} from './standard'
import './roehren.css'

export type HinzufuegeMotor = {
  nachschlagen: (adresse: string) => Promise<void>
  frage: Accessor<{server: string; pubkey: string} | null>
  sucht: Accessor<boolean>
  ja: () => void
  nein: () => void
  // von Hand mit Prüfschlüssel (früher Werkstatt); fehlt, wenn eingebettet nicht angeboten
  vonHand?: (server: string, schluessel: string) => void
}

const zahl = (n: number) => n.toLocaleString('de-DE')

// vorgeschlagen, nie still eingetragen (Gerhard, 2026-10-12): am Meetup verwenden alle die Stelle des Vereins
const VORSCHLAG: Record<string, string> = {'lnurl.21linz.at': 'Bitcoin Club Linz — am Meetup verwendet'}

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

const Kopf: Component<{titel: string; zurueck?: string; onZurueck?: () => void}> = props => {
  const navigate = useNavigate()
  return (
    <div class="rz-seitenkopf">
      <button
        type="button"
        class="rz-zurueck"
        aria-label="Zurück"
        onClick={() =>
          props.onZurueck
            ? props.onZurueck()
            : props.zurueck
              ? navigate(props.zurueck)
              : history.length > 1
                ? history.back()
                : navigate('/settings')
        }
      >
        ‹
      </button>
      <h2>{props.titel}</h2>
    </div>
  )
}

export const AusgabestellenListe: Component<{alleAktualisieren: () => Promise<void>; sucht: Accessor<boolean>}> = props => {
  const navigate = useNavigate()
  const {state, bearers} = useWallet()
  const std = () => standardStelle(trustedMints())
  // Gebühren fürs Aufladen, einmal je Sitzung erfragt (gebuehren.ts)
  createEffect(() => {
    for (const t of trustedMints()) frageAufladeGebuehr(getTrustedMintAddress(t.server) || `mint@${serverOf(t.server)}`)
  })
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
                <button type="button" class="rz-eintrag-kopf rz-stelle-zeile" onClick={() => navigate(`/mint/stelle/${host}`)}>
                  <span class="ic in">
                    <Bank />
                  </span>
                  <span class="mitte">
                    <span class="t">{m.nodeAlias || host}</span>
                    <span class="s" classList={{warn: !!m.pendingMintPubkey || !!m.sunsetDate}}>
                      {m.pendingMintPubkey
                        ? 'Neuer Prüfschlüssel — bitte ansehen'
                        : m.sunsetDate
                          ? `Schließt am ${new Date(m.sunsetDate).toLocaleDateString('de-DE')}`
                          : aufladeGebuehr(host)
                            ? `${host} · Aufladen ${aufladeGebuehr(host)}`
                            : host}
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
        <button type="button" class="rz-aendern rz-block" disabled={props.sucht()} onClick={() => void props.alleAktualisieren()}>
          {props.sucht() ? 'Frage nach …' : 'Angaben aller Stellen aktualisieren'}
        </button>
      </Show>
      <A href="/mint/hinzufuegen" class="rz-knopf an rz-weiter rz-link-knopf">
        <span class="lbl">Ausgabestelle hinzufügen</span>
      </A>
    </div>
  )
}

// eingebettet: im Aufladen, wenn noch keine Stelle da ist — gefragt wird dort, wo man sie braucht,
// und nach „Hinzufügen“ steht man gleich auf der Tastatur (Steve, 2026-10-12)
export const AusgabestelleHinzufuegen: Component<{motor: HinzufuegeMotor; eingebettet?: boolean}> = props => {
  const m = props.motor
  const navigate = useNavigate()
  const [text, setText] = createSignal('')
  const [technik, setTechnik] = createSignal(false)
  const [scannt, setScannt] = createSignal(false)
  const [hand, setHand] = createSignal(false)
  const [handStelle, setHandStelle] = createSignal('')
  const [handSchluessel, setHandSchluessel] = createSignal('')

  const bekannte = () =>
    PUBLIC_MINTS.map(a => ({adresse: a, url: resolveMintInput(a)}))
      .filter(x => x.url && !isMintTrusted(serviceOriginOf(x.url)))
      .map(x => ({adresse: x.adresse, host: serverOf(x.url!)}))
      .sort((a, b) => Number(!!VORSCHLAG[b.host]) - Number(!!VORSCHLAG[a.host]))

  createEffect(() => {
    for (const b of bekannte()) frageAufladeGebuehr(b.adresse)
  })

  const ja = () => {
    const f = m.frage()
    m.ja()
    if (f && isMintTrusted(f.server) && !props.eingebettet) navigate('/mint')
  }

  return (
    <div class="page rz-stellen">
      <Show
        when={m.frage()}
        fallback={
          <>
            <Show
              when={props.eingebettet}
              fallback={<Kopf titel="Ausgabestelle hinzufügen" zurueck="/mint" />}
            >
              <Kopf titel="Aufladen" zurueck="/empfangen" />
              <p class="rz-frage-kurz">Wo sollen deine Sats liegen?</p>
              <p class="rz-hinweis">
                Eine Ausgabestelle verwahrt die Sats hinter deinen Scheinen. Wähle eine — danach geht es gleich weiter.
              </p>
            </Show>
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
                        <span class="s">
                          {VORSCHLAG[b.host] ?? 'Öffentliche Ausgabestelle'}
                          {aufladeGebuehr(b.host) ? ` · Aufladen ${aufladeGebuehr(b.host)}` : ''}
                        </span>
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
            <Show when={canScan()}>
              <button type="button" class="rz-aendern rz-block" onClick={() => setScannt(v => !v)}>
                {scannt() ? 'Scannen beenden' : 'Stattdessen QR-Code scannen'}
              </button>
              <Show when={scannt()}>
                <div class="rz-scanner">
                  <Scanner
                    onScan={wert => {
                      setScannt(false)
                      setText(wert)
                      void m.nachschlagen(wert)
                    }}
                  />
                </div>
              </Show>
            </Show>
            <button
              type="button"
              class="rz-knopf an rz-weiter"
              disabled={!text().trim() || m.sucht() || offlineMode()}
              onClick={() => void m.nachschlagen(text().trim())}
            >
              <span class="lbl">{m.sucht() ? 'Einen Moment …' : 'Weiter'}</span>
            </button>
            <Show when={m.vonHand}>
              <button type="button" class="rz-aendern rz-block rz-technik" onClick={() => setHand(v => !v)}>
                Von Hand mit Prüfschlüssel {hand() ? '‹' : '›'}
              </button>
              <Show when={hand()}>
                <p class="rz-hinweis">
                  Nur wenn die Stelle keinen Schlüssel über ihre Adresse anbietet und du ihn von ihr selbst hast.
                </p>
                <input
                  class="rz-feld"
                  type="text"
                  autocapitalize="off"
                  spellcheck={false}
                  placeholder="https://stelle.beispiel.at"
                  value={handStelle()}
                  onInput={e => setHandStelle(e.currentTarget.value)}
                />
                <input
                  class="rz-feld rz-abstand-klein"
                  type="text"
                  autocapitalize="off"
                  spellcheck={false}
                  placeholder="Prüfschlüssel (66 Zeichen, beginnt mit 02 oder 03)"
                  value={handSchluessel()}
                  onInput={e => setHandSchluessel(e.currentTarget.value.trim())}
                />
                <button
                  type="button"
                  class="rz-leise rz-block"
                  disabled={!handStelle().trim() || !/^0[23][0-9a-f]{64}$/i.test(handSchluessel())}
                  onClick={() => {
                    m.vonHand!(handStelle().trim(), handSchluessel().toLowerCase())
                    if (trustedMints().some(t => serverOf(t.server) === serverOf(handStelle().trim()))) navigate('/mint')
                  }}
                >
                  Hinzufügen ›
                </button>
              </Show>
            </Show>
          </>
        }
      >
        {f => (
          <>
            <Kopf titel={props.eingebettet ? 'Aufladen' : 'Ausgabestelle hinzufügen'} onZurueck={() => m.nein()} />
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

export type StelleMotor = {
  annehmen: (server: string) => void // neuen Prüfschlüssel annehmen
  ablehnen: (server: string) => void
  aktualisieren: (m: TrustedMint) => Promise<void>
  aktualisiert: Accessor<string | null> // welche Stelle gerade nachgefragt wird
  entfernen: (server: string) => void
  adresse: (server: string) => void // „Deine Adresse“ (AddressDialog des Originals)
  suchen: (server: string) => void // fehlende Scheine suchen (RescanDialog des Originals)
}

const datum = (ts: number | string) => new Date(ts).toLocaleDateString('de-DE', {day: 'numeric', month: 'long', year: 'numeric'})
const groesse = (msat: number) => {
  const btc = msat / 1000 / 100_000_000
  return btc >= 0.01 ? `${btc.toLocaleString('de-DE', {maximumFractionDigits: 2})} BTC` : `${zahl(Math.floor(msat / 1000))} Sats`
}

const Zeile: Component<{label: string; wert?: string; unter?: string; href?: string; extern?: boolean; onClick?: () => void; gefahr?: boolean; still?: boolean}> = props => {
  const innen = (
    <>
      <span>
        <span class="sl">{props.label}</span>
        <Show when={props.unter}>
          <span class="s">{props.unter}</span>
        </Show>
      </span>
      <span class="val">
        {props.wert}
        <Show when={!props.still}>
          <Pfeil />
        </Show>
      </span>
    </>
  )
  return (
    <Show
      when={props.href}
      fallback={
        <Show
          when={props.onClick}
          fallback={<div class="rz-setting rz-still">{innen}</div>}
        >
          <button type="button" class="rz-setting" classList={{gefahr: props.gefahr}} onClick={() => props.onClick?.()}>
            {innen}
          </button>
        </Show>
      }
    >
      <Show when={props.extern} fallback={<A href={props.href!} class="rz-setting">{innen}</A>}>
        <a href={props.href} class="rz-setting" target="_blank" rel="noreferrer">
          {innen}
        </a>
      </Show>
    </Show>
  )
}

// Seite einer Ausgabestelle (Steve, 2026-10-12): alles, was früher in der Werkstatt lag, an dem Ort,
// wo man es sucht — Warnungen oben, Verwenden, Deine Adresse, Wiederfinden, Über die Stelle, Entfernen.
export const StelleSeite: Component<{motor: StelleMotor}> = props => {
  const m = props.motor
  const params = useParams()
  const navigate = useNavigate()
  const {state, bearers} = useWallet()
  const [fragt, setFragt] = createSignal(false)

  const stelle = () => trustedMints().find(t => serverOf(t.server) === params.host)
  const offen = () => state() === 'unlocked'
  const scheine = createMemo(() => bearers().filter(b => !b.spent && serverOf(b.url) === params.host))
  const summe = () => scheine().reduce((a, b) => a + Math.floor(b.amount / 1000), 0)
  const istStandard = () => standardStelle(trustedMints())?.server === stelle()?.server
  const adresse = () => registeredAddresses().find(r => serverOf(r.server) === params.host)
  createEffect(() => {
    const s = stelle()
    if (s) frageAufladeGebuehr(getTrustedMintAddress(s.server) || `mint@${params.host}`)
  })

  const weg = () => {
    const s = stelle()
    if (!s) return
    m.entfernen(s.server)
    if (!trustedMints().some(t => t.server === s.server)) navigate('/mint')
  }

  return (
    <div class="page rz-einstellungen rz-stellen">
      <Kopf titel="Ausgabestelle" zurueck="/mint" />
      <Show when={stelle()} fallback={<p class="rz-hinweis">Diese Ausgabestelle ist nicht (mehr) eingetragen.</p>}>
        {s => (
          <>
            <div class="rz-stelle-kopf">
              <Show when={s().nodeColor}>
                <span class="rz-farbpunkt" style={{'background-color': s().nodeColor!}} />
              </Show>
              <div>
                <h3>{s().nodeAlias || params.host}</h3>
                <span class="rz-hinweis">{params.host}</span>
              </div>
            </div>
            <Show when={offen()}>
              <p class="rz-stelle-summe">
                {zahl(summe())} Sats in {scheine().length} {scheine().length === 1 ? 'Schein' : 'Scheinen'}
              </p>
            </Show>

            {/* was Aufmerksamkeit braucht, steht vor allem anderen */}
            <Show when={s().pendingMintPubkey}>
              <div class="rz-warnung">
                <p>
                  <b>Neuer Prüfschlüssel.</b> Die Stelle meldet einen anderen Schlüssel als den, dem du zugestimmt
                  hast. Nimm ihn nur an, wenn die Stelle das selbst angekündigt hat — etwa auf ihrer Webseite. Bis
                  dahin gilt der alte.
                </p>
                <code class="rz-schluessel">{s().pendingMintPubkey}</code>
                <div class="rz-duo">
                  <button type="button" class="rz-knopf an" onClick={() => m.annehmen(s().server)}>
                    <span class="lbl">Annehmen</span>
                  </button>
                  <button type="button" class="rz-leise" onClick={() => m.ablehnen(s().server)}>
                    Alten behalten
                  </button>
                </div>
              </div>
            </Show>
            <Show when={s().sunsetDate}>
              <div class="rz-warnung">
                <p>
                  <b>Schließt am {datum(s().sunsetDate!)}.</b> Gib die Scheine dieser Stelle vorher aus oder bezahle
                  damit — danach kann sie sie nicht mehr einlösen.
                </p>
              </div>
            </Show>
            <Show when={s().unconfirmed}>
              <p class="rz-hinweis">
                Aus einer Sicherung übernommen und noch nicht bei der Stelle selbst bestätigt — das geschieht beim
                nächsten Aufladen oder mit „Angaben aktualisieren“.
              </p>
            </Show>

            <div class="rz-gruppe">
              <span class="rz-eyebrow">Verwenden</span>
              <Show
                when={!istStandard()}
                fallback={<Zeile label="Standard fürs Aufladen" wert="ja" still />}
              >
                <Zeile label="Als Standard fürs Aufladen" onClick={() => setStandard(s().server)} />
              </Show>
              <Show when={offen()}>
                <Zeile
                  label="Hier aufladen"
                  onClick={() => {
                    setStandard(s().server)
                    navigate('/aufladen')
                  }}
                />
              </Show>
            </div>

            <Show when={offen()}>
              <div class="rz-gruppe">
                <span class="rz-eyebrow">Deine Adresse</span>
                <Zeile
                  label={adresse() ? `${adresse()!.username}@${params.host}` : 'Adresse anlegen'}
                  unter={adresse() ? 'Zum Teilen — Zahlungen kommen hier an' : 'Eine Lightning-Adresse bei dieser Stelle'}
                  onClick={() => m.adresse(s().server)}
                />
              </div>
              <div class="rz-gruppe">
                <span class="rz-eyebrow">Wiederfinden</span>
                <Zeile
                  label="Fehlende Scheine suchen"
                  unter="Nach dem Wiederherstellen aus den zwölf Wörtern"
                  onClick={() => m.suchen(s().server)}
                />
              </div>
            </Show>

            <div class="rz-gruppe">
              <span class="rz-eyebrow">Über die Stelle</span>
              <Show when={s().nodeCapacityMsat !== undefined}>
                <Zeile
                  label="Größe"
                  wert={groesse(s().nodeCapacityMsat!)}
                  unter={[
                    s().nodeNumChannels !== undefined ? `${s().nodeNumChannels} Kanäle` : '',
                    s().nodeNumPeers !== undefined ? `${s().nodeNumPeers} Partner` : ''
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  still
                />
              </Show>
              <Show when={s().outstandingNotesMsat !== undefined}>
                <Zeile label="Ausgegebene Scheine insgesamt" wert={`${zahl(Math.floor(s().outstandingNotesMsat! / 1000))} Sats`} still />
              </Show>
              <Zeile
                label="Gebühren"
                wert={aufladeGebuehr(params.host) ? `Aufladen ${aufladeGebuehr(params.host)}` : undefined}
                unter={
                  teilGebuehr(params.host)
                    ? `Teilen: ${teilGebuehr(params.host)}`
                    : 'Teilen: kündigt die Stelle nicht an — zeigt sich beim ersten Teilen'
                }
                still
              />
              <Zeile label="Eingetragen seit" wert={datum(s().addedAt)} still />
              <Zeile label="Webseite" href={`https://${params.host}`} extern />
              <Show when={s().nodePubkey}>
                <Zeile label="Knoten auf mempool.space" href={mempoolNodeUrl(s().nodePubkey!)} extern />
              </Show>
              <Zeile
                label="Prüfschlüssel kopieren"
                unter={`${s().mintPubkey.slice(0, 8)}…${s().mintPubkey.slice(-8)}`}
                onClick={() => copyToClipboard(s().mintPubkey)}
              />
              <Zeile
                label="Angaben aktualisieren"
                wert={m.aktualisiert() === s().server ? '…' : undefined}
                onClick={() => void m.aktualisieren(s())}
              />
            </div>

            <div class="rz-gruppe">
              <span class="rz-eyebrow">Gerät</span>
              <Show
                when={!s().locked}
                fallback={
                  <p class="rz-hinweis">
                    Entfernen geht erst, wenn du hier keine Scheine mehr hast
                    <Show when={offen()}> (noch {zahl(summe())} Sats)</Show>. Deine Sats liegen bei der Stelle, nicht
                    in dieser Liste.
                  </p>
                }
              >
                <Zeile label="Ausgabestelle entfernen" gefahr onClick={() => setFragt(true)} />
                <Show when={fragt()}>
                  <Rueckfrage
                    titel={`${params.host} entfernen?`}
                    ja="Entfernen"
                    onJa={() => {
                      setFragt(false)
                      weg()
                    }}
                    onNein={() => setFragt(false)}
                  >
                    <p>Scheine dieser Stelle gelten danach nicht mehr als geprüft. Du kannst sie später wieder hinzufügen.</p>
                  </Rueckfrage>
                </Show>
              </Show>
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
