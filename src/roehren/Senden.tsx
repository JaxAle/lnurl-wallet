// Senden wie im Prototyp (screens.send → send-qr): Betrag auf den Röhren eintippen, die Wallet
// spaltet einen passenden Schein selbst ab (splitBearerIntoAmounts des Originals — eine Gebühr der
// Ausgabestelle geht vom Rest ab, nicht vom übergebenen Betrag), dann der QR. Das Einlösen erkennt
// die Einlöse-Wache; das Zählwerk zählt danach auf der Startseite herunter.
//
// Euro-Eingabe: Zeile antippen = dort tippen (Prototyp 'cur-set'/'key'). Noch nicht hier: „Als Link
// teilen“, „Geschenkkarte“.
import type {Component} from 'solid-js'
import {createMemo, createSignal, Show} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import Qr from '../components/Qr'
import RequireWallet from '../components/RequireWallet'
import {useDevice} from '../DeviceContext'
import {requireDeviceClient} from '../deviceOrchestration'
import {notify, NotifyKind} from '../helpers'
import {
  isBolt11Invoice,
  isLightningAddress,
  serverOf,
  toBech32Lnurl
} from '../lnurlcash'
import {saeubere, setBezahlenScannen, setZuBezahlen} from './rechnung'
import type {Bearer} from '../storage'
import {useWallet} from '../WalletContext'
import {merkeUnterwegs, unterwegs} from './einloesen'
import {schickeLink, WARNUNG} from './weitergabe'
import {gebunden} from './klaerung'
import {scheinUeber, waehleSchein} from './abspalten'
import {zurueckholenAuftrag, zurueckzuholen} from './zurueckholen'
import {createBetrag, Tastatur} from './Betrag'
import Zaehlwerk from './Zaehlwerk'
import {PFADE, Werkzeug} from './Scheine'
import './roehren.css'

const Senden: Component = () => {
  const {bearers, addBearer, updateBearer, removeBearer, logActivity} =
    useWallet()
  const {client: deviceClient} = useDevice()
  const navigate = useNavigate()

  const ein = createBetrag()
  const betrag = ein.betrag
  const [arbeitet, setArbeitet] = createSignal(false)
  const [schein, setSchein] = createSignal<Bearer | null>(null)
  // wie weitergeben (Prototyp send-how): erst wählen, dann zeigen oder als Link schicken
  const [weg, setWeg] = createSignal<'zeigen' | 'link' | null>(null)
  const linkSchicken = async (b: Bearer) => {
    const e = await schickeLink(b)
    if (e === 'abgebrochen') return
    if (e === 'kopiert')
      notify('Link kopiert — füg ihn in deine Nachricht ein.')
    setWeg('link')
  }

  // Einfügen: Rechnung/Adresse aus der Zwischenablage → gleich zur Bestätigung beim Bezahlen
  const einfuegen = async () => {
    let t = ''
    try {
      t = saeubere(await navigator.clipboard.readText())
    } catch {
      // Zugriff verweigert: Bezahlen-Seite, dort von Hand einfügen
      navigate('/bezahlen')
      return
    }
    if (isBolt11Invoice(t) || isLightningAddress(t)) {
      setZuBezahlen(t)
      navigate('/bezahlen')
    } else
      notify(
        'In der Zwischenablage ist keine Rechnung und keine Lightning-Adresse.',
        NotifyKind.ERROR
      )
  }

  // nur Scheine, deren Geheimnis in diesem Browser liegt (kein Vault) — die lassen sich spalten
  // gebunden: Teil eines ungeklärten Vorgangs (klaerung.ts) — nicht ein zweites Mal verwenden
  const verfuegbar = createMemo(() => {
    const g = gebunden()
    return bearers().filter(
      b => !b.spent && !b.deviceId && b.verified && !g.has(b.id)
    )
  })
  const guthaben = () =>
    Math.floor(verfuegbar().reduce((a, b) => a + b.amount, 0) / 1000)
  const groesster = () =>
    Math.floor(Math.max(0, ...verfuegbar().map(b => b.amount)) / 1000)

  const zuViel = () => betrag() > groesster()
  const grund = () =>
    betrag() > guthaben()
      ? `Mehr als dein Guthaben (${guthaben().toLocaleString('de-DE')})`
      : `Kein einzelner Schein hat so viel — höchstens ${groesster().toLocaleString('de-DE')}`

  const weiter = async () => {
    const msat = betrag() * 1000
    const quelle = waehleSchein(verfuegbar(), msat)
    if (!quelle) return
    setArbeitet(true)
    try {
      const ziel = await scheinUeber(quelle, msat, {
        bearers,
        addBearer,
        updateBearer,
        removeBearer,
        logActivity,
        deviceClient,
        requireDeviceClient
      })
      if (ziel) setSchein(ziel)
    } catch (err) {
      notify(
        `Senden geht gerade nicht: ${(err as Error).message}`,
        NotifyKind.ERROR
      )
    } finally {
      setArbeitet(false)
    }
  }

  // der übergebene Schein, aktuell aus der Wallet — wird er eingelöst, setzt die Wache "spent"
  const aktuell = () => {
    const s = schein()
    return s ? (bearers().find(b => b.id === s.id) ?? s) : null
  }
  // eingelöst: die Wache entfernt den Schein (oder er steht noch als ausgegeben da)
  const eingeloest = () => {
    const s = schein()
    return !!s && (!bearers().some(b => b.id === s.id) || !!aktuell()?.spent)
  }

  // „Doch nicht senden“: Schein erneuern, der gezeigte QR wird wertlos (Gerhard am Pixel, 2026-10-11)
  const [holt, setHolt] = createSignal(false)
  const [zurueck, setZurueck] = createSignal(false)
  const [warAuftrag, setWarAuftrag] = createSignal(false)
  const zurueckholen = async () => {
    const s = aktuell()
    if (!s) return
    setHolt(true)
    try {
      const ergebnis = await zurueckholenAuftrag(s, {
        addBearer,
        updateBearer,
        removeBearer,
        logActivity
      })
      if (ergebnis === 'zurueck') setZurueck(true)
      if (ergebnis === 'gemerkt' || ergebnis === 'laeuft') setWarAuftrag(true)
      // 'schon-eingeloest': der Schein ist nun weg, die Seite zeigt „eingelöst“
      // 'gemerkt': ohne Netz liegt der Auftrag, die Seite zeigt „wird zurückgeholt“
    } catch (err) {
      notify(
        `Zurückholen geht gerade nicht: ${(err as Error).message}`,
        NotifyKind.ERROR
      )
    } finally {
      setHolt(false)
    }
  }
  // Auftrag liegt (offline getippt): kein QR mehr (Steve, 2026-10-16)
  const wirdGeholt = () => {
    const s = schein()
    return !!s && zurueckzuholen().includes(s.id)
  }
  // Hat die Prüfwache den Auftrag später ausgeführt, trägt der Schein ein neues Geheimnis — sein QR
  // darf hier nie erscheinen. Zurück heißt: nicht mehr unterwegs, aber noch in der Wallet.
  const spaeterZurueck = () => {
    const s = schein()
    return (
      !!s &&
      warAuftrag() &&
      !wirdGeholt() &&
      !unterwegs().includes(s.id) &&
      bearers().some(b => b.id === s.id && !b.spent)
    )
  }

  return (
    <RequireWallet>
      <div
        class="page rz-senden"
        classList={{'rz-senden-eingabe': !aktuell() && guthaben() > 0}}
      >
        <Show
          when={aktuell()}
          fallback={
            <>
              <div class="rz-seitenkopf">
                <A
                  href="/wallet"
                  class="rz-zurueck"
                  aria-label="Zurück zur Wallet"
                >
                  ‹
                </A>
                <h2>Senden</h2>
              </div>
              {/* ohne Guthaben ein Weg statt einer Meldung (Steve, 2026-10-12) */}
              <Show
                when={guthaben() > 0}
                fallback={
                  <>
                    <Zaehlwerk sats={0} sofort kalt>
                      <p class="rz-zeile-matt">Noch keine Sats</p>
                    </Zaehlwerk>
                    <A
                      href="/aufladen"
                      class="rz-knopf an rz-weiter rz-link-knopf"
                    >
                      <span class="lbl">Aufladen</span>
                    </A>
                    <A href="/empfangen" class="rz-leise rz-mitte rz-block">
                      oder einen Schein empfangen ›
                    </A>
                  </>
                }
              >
                <Zaehlwerk
                  sats={betrag()}
                  sofort
                  kalt={!betrag() || zuViel()}
                  wahl={ein.wahl()}
                  onWahl={ein.kurs() ? ein.waehle : undefined}
                  euroAnzeige={ein.euroAnzeige()}
                >
                  <Show when={betrag() > 0 && zuViel()}>
                    <div class="rz-ueber">
                      <span>{grund()}</span>
                    </div>
                    <Show when={groesster() > 0 && betrag() <= guthaben()}>
                      <button
                        type="button"
                        class="rz-leise"
                        onClick={() => ein.setzeSats(groesster())}
                      >
                        {groesster().toLocaleString('de-DE')} senden
                      </button>
                    </Show>
                  </Show>
                </Zaehlwerk>
                <Tastatur betrag={ein} />
                <button
                  type="button"
                  class="rz-knopf an rz-weiter"
                  disabled={!betrag() || zuViel() || arbeitet()}
                  onClick={() => void weiter()}
                >
                  <span class="lbl">
                    {arbeitet() ? 'Einen Moment …' : 'Weiter'}
                  </span>
                </button>
                {/* Rechnung einfügen/scannen unter Weiter, wie Aufladen aufgebaut (Gerhard, 2026-10-27); beide
                gehen unabhängig vom Betrag */}
                <div class="rz-oder-linie">
                  <span>oder Rechnung bezahlen</span>
                </div>
                <div class="rz-duo rz-duo-flach">
                  <button
                    type="button"
                    class="rz-knopf flach"
                    onClick={() => void einfuegen()}
                  >
                    <span class="lbl">Rechnung einfügen</span>
                  </button>
                  <button
                    type="button"
                    class="rz-knopf flach"
                    onClick={() => {
                      setBezahlenScannen(true)
                      navigate('/bezahlen')
                    }}
                  >
                    <span class="lbl">Rechnung scannen</span>
                  </button>
                </div>
              </Show>
            </>
          }
        >
          {s => (
            <Show
              when={!zurueck() && !spaeterZurueck() && !wirdGeholt()}
              fallback={
                <div class="rz-fertig">
                  {/* nichts ist weggegangen, also glüht nichts und es gibt kein Vorzeichen (Steve) */}
                  <Zaehlwerk sats={Math.floor(s().amount / 1000)} sofort kalt>
                    <p class="rz-zeile-matt">
                      {wirdGeholt() ? 'Wird zurückgeholt' : 'Sats zurückgeholt'}
                    </p>
                    <p class="rz-klein">
                      {holt()
                        ? 'Einen Moment …'
                        : !wirdGeholt()
                          ? 'Der gezeigte QR ist wertlos, der Betrag bleibt bei dir.'
                          : 'Die Ausgabestelle antwortet gerade nicht. Sobald sie erreichbar ist, holt die Wallet den Schein zurück — zeig den QR nicht mehr.'}
                    </p>
                  </Zaehlwerk>
                  <button
                    type="button"
                    class="rz-knopf an rz-weiter"
                    onClick={() => navigate('/wallet')}
                  >
                    <span class="lbl">Zur Wallet</span>
                  </button>
                </div>
              }
            >
              <Show
                when={!eingeloest()}
                fallback={
                  <div class="rz-fertig">
                    {/* „−50“: eine Bewegung, kein Stand — sonst liest man es als Guthaben (Steve) */}
                    <Zaehlwerk
                      sats={Math.floor(s().amount / 1000)}
                      sofort
                      vorzeichen="−"
                    >
                      <p class="rz-zeile-matt">Sats gesendet</p>
                      <p class="rz-klein">
                        Der Empfänger hat den Schein eingelöst.
                      </p>
                    </Zaehlwerk>
                    <button
                      type="button"
                      class="rz-knopf an rz-weiter"
                      onClick={() => navigate('/wallet')}
                    >
                      <span class="lbl">Zur Wallet</span>
                    </button>
                  </div>
                }
              >
                <Show
                  when={weg() !== null}
                  fallback={
                    <>
                      <div class="rz-seitenkopf">
                        <h2>
                          {Math.floor(s().amount / 1000).toLocaleString(
                            'de-DE'
                          )}{' '}
                          Sats senden
                        </h2>
                      </div>
                      <p class="rz-hinweis">
                        Wie soll der Schein zur anderen Person?
                      </p>
                      {/* dieselben Karten wie im Scheinblatt — mit Symbol, sonst rutscht der Text in dessen Spalte */}
                      <Werkzeug
                        pfad={PFADE.zeigen}
                        titel="Zeigen"
                        unter="Die Person steht neben dir und scannt"
                        onClick={() => {
                          merkeUnterwegs(s().id)
                          setWeg('zeigen')
                        }}
                      />
                      <Werkzeug
                        pfad={PFADE.link}
                        titel="Als Link schicken"
                        unter="Per Signal, Telegram oder E-Mail"
                        onClick={() => void linkSchicken(s())}
                      />
                      <p class="rz-hinweis">{WARNUNG}</p>
                      <button
                        type="button"
                        class="rz-leise"
                        onClick={() => navigate('/wallet')}
                      >
                        Abbrechen — der Schein bleibt bei dir
                      </button>
                    </>
                  }
                >
                  <div class="rz-seitenkopf">
                    <h2>
                      {weg() === 'link' ? 'Link geschickt' : 'Schein zeigen'}
                    </h2>
                  </div>
                  <Show
                    when={weg() === 'zeigen'}
                    fallback={
                      <button
                        type="button"
                        class="rz-leise"
                        onClick={() => void linkSchicken(s())}
                      >
                        Link noch einmal schicken
                      </button>
                    }
                  >
                    <div class="rz-qr">
                      <Qr value={toBech32Lnurl(s().url)} />
                    </div>
                  </Show>
                  <Zaehlwerk sats={Math.floor(s().amount / 1000)} sofort />
                  <p class="rz-status">
                    <span class="rz-lampe-klein" /> Wartet, bis der Schein
                    eingelöst ist
                  </p>
                  <p class="rz-hinweis">
                    Die Wallet fragt nach, solange sie offen ist. Du kannst auch
                    schon zurück — dann steht der Schein im Verlauf unter
                    „Unterwegs“.
                  </p>
                  <button
                    type="button"
                    class="rz-leise"
                    onClick={() => navigate('/wallet')}
                  >
                    Zurück zur Wallet
                  </button>
                  <button
                    type="button"
                    class="rz-leise"
                    disabled={holt()}
                    onClick={() => void zurueckholen()}
                  >
                    {holt()
                      ? 'Einen Moment …'
                      : 'Doch nicht senden, Schein zurückholen'}
                  </button>
                </Show>
              </Show>
            </Show>
          )}
        </Show>
      </div>
    </RequireWallet>
  )
}

export default Senden
