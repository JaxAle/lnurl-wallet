// Bezahlen als eigene Seite (Steve, 2026-10-24; Prototyp screens.pay → pay-confirm → done): statt des
// Dialogs mit zwei Symbolknöpfen. Wer bezahlt, will vorher sicher wissen: wem, wie viel, was es kostet.
//   1. Eingeben: Rechnung oder Lightning-Adresse einfügen oder scannen; eine Zeile sagt, was erkannt wurde.
//      Bei einer Adresse ohne Betrag folgt die Röhren-Tastatur wie beim Senden.
//      LNURL-pay („lnurl1…“, „lnurlp://“) geht denselben Weg wie eine Adresse; lässt der Empfänger nur einen
//      Betrag zu, ohne Tastatur gleich zum Bestätigen (Gerhard, 2026-10-29).
//      Kommt man über „Rechnung scannen“ (Senden), ist Schritt 1 nur die Kamera: kein Feld, kein Weiter —
//      ein gültiger Code führt von selbst zu Schritt 2 (Betrag oder Bestätigen), bezahlt wird nie ohne
//      Tippen auf „N Sats bezahlen“ (Gerhard, 2026-10-29).
//   2. Bestätigen: Betrag im Zählwerk, darunter An, Zweck, Gebühr, Bezahlt aus; dann „N Sats bezahlen“.
//   3. Fertig: das Zählwerk zählt herunter, „Bezahlt“.
// Bezahlen heißt hier: ein Schein über genau den Betrag wird bei seiner Ausgabestelle eingeschmolzen
// (meltNote des Originals). Hat kein Schein genau den Betrag, wird er wie beim Senden abgespalten
// (abspalten.ts); eine Gebühr der Stelle geht dabei vom Rest ab. Sonderwege des Originals (interne
// Überweisung, Tresor, mehrere Scheine) bleiben über „Mehr Möglichkeiten“ im alten Dialog.
import type {Component} from 'solid-js'
import {
  createMemo,
  createSignal,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch
} from 'solid-js'
import {A, useNavigate} from '@solidjs/router'

import RequireWallet from '../components/RequireWallet'
import Scanner, {canScan} from '../components/Scanner'
import {useDevice} from '../DeviceContext'
import {requireDeviceClient} from '../deviceOrchestration'
import {notify, NotifyKind} from '../helpers'
import type {PayRequestInfo} from '../lnurlcash'
import {
  decodeBolt11AmountMsat,
  fetchPayRequest,
  isBolt11Invoice,
  isLightningAddress,
  meltNote,
  NoteSpentError,
  requestInvoice,
  requireNoteK1,
  resolveMintInput,
  serverOf
} from '../lnurlcash'
import type {Bearer} from '../storage'
import {useWallet} from '../WalletContext'
import {scheinUeber, waehleSchein} from './abspalten'
import {createBetrag, Tastatur} from './Betrag'
import {teilGebuehr} from './gebuehren'
import {pruefeZahlung} from './bezahlwache'
import {gebunden} from './klaerung'
import {
  adressText,
  bezahlenScannen,
  lnurlZahlziel,
  rechnungsZweck,
  saeubere,
  setBezahlenScannen,
  setZuBezahlen,
  zuBezahlen
} from './rechnung'
import Zaehlwerk from './Zaehlwerk'
import './roehren.css'

type Schritt = 'eingabe' | 'betrag' | 'bestaetigen' | 'unterwegs' | 'fertig'

const zahl = (n: number) => n.toLocaleString('de-DE')

const Bezahlen: Component = () => {
  const {bearers, addBearer, updateBearer, removeBearer, logActivity} =
    useWallet()
  const {client: deviceClient} = useDevice()
  const navigate = useNavigate()
  const ein = createBetrag()

  const [schritt, setSchritt] = createSignal<Schritt>('eingabe')
  const [text, setText] = createSignal('')
  const [scannen, setScannen] = createSignal(false)
  // über „Rechnung scannen“ gekommen: Schritt 1 ist nur die Kamera
  const [nurScan, setNurScan] = createSignal(false)
  // der Empfänger lässt nur einen Betrag zu — zurück vom Bestätigen nicht zur Tastatur
  const [fest, setFest] = createSignal(false)
  const [scanFehler, setScanFehler] = createSignal<string | null>(null)
  const [arbeitet, setArbeitet] = createSignal(false)
  const [adresse, setAdresse] = createSignal<string | null>(null)
  const [info, setInfo] = createSignal<PayRequestInfo | null>(null)
  const [rechnung, setRechnung] = createSignal<string | null>(null)
  const [bezahlt, setBezahlt] = createSignal<Bearer | null>(null)
  let uhr: ReturnType<typeof setInterval> | undefined
  onCleanup(() => uhr && clearInterval(uhr))

  // was im Feld steht (oder die Kamera sieht), erkannt
  const erkenne = (roh: string) => {
    const t = saeubere(roh)
    if (!t) return null
    if (isBolt11Invoice(t)) {
      const msat = decodeBolt11AmountMsat(t)
      return {
        art: 'rechnung' as const,
        wert: t,
        satz:
          msat === null
            ? 'Rechnung ohne Betrag — bitte mit Betrag ausstellen lassen'
            : `Rechnung über ${zahl(Math.floor(msat / 1000))} Sats erkannt`,
        geht: msat !== null && msat > 0
      }
    }
    if (isLightningAddress(t))
      return {
        art: 'adresse' as const,
        wert: t,
        satz: `Lightning-Adresse ${t}`,
        geht: true
      }
    const l = lnurlZahlziel(t)
    if (l && 'url' in l)
      return {
        art: 'lnurl' as const,
        wert: t,
        url: l.url,
        stelle: l.stelle,
        satz: `LNURL-Zahlungscode von ${l.stelle}`,
        geht: true
      }
    return {
      art: 'nichts' as const,
      wert: t,
      satz:
        l && 'fehler' in l
          ? l.fehler
          : 'Keine Rechnung, keine Lightning-Adresse und kein LNURL-Zahlungscode',
      geht: false
    }
  }
  const erkannt = createMemo(() => erkenne(text()))

  // Kamera: nur ein gültiges Ziel geht durch; alles andere bleibt im Bild stehen, mit einer Zeile darunter
  const nimmt = (w: string) => {
    const e = erkenne(w)
    if (e?.geht) return true
    setScanFehler(
      e?.art === 'rechnung' || (e && lnurlZahlziel(e.wert))
        ? e!.satz
        : 'Dieser Code ist keine Lightning-Rechnung, keine Lightning-Adresse und kein LNURL-Zahlungscode.'
    )
    return false
  }
  const gescannt = (w: string) => {
    setScannen(false) // Scanner hat die Kamera schon freigegeben; ein zweiter Treffer kommt nicht mehr
    setScanFehler(null)
    setText(saeubere(w))
    void weiter()
  }
  const kameraFehler = (art: 'verweigert' | 'keine') => {
    setScannen(false)
    setScanFehler(
      art === 'keine'
        ? 'Keine Kamera gefunden.'
        : 'Die Kamera ist nicht freigegeben. Erlaube sie in den Website-Einstellungen des Browsers und tippe dann auf „Kamera ein“.'
    )
  }
  const kamera = () => {
    setScanFehler(null)
    setScannen(s => !s)
  }
  // zurück zu Schritt 1: beim Scannen wieder mit laufender Kamera und leerem Ziel
  const zurEingabe = () => {
    setSchritt('eingabe')
    if (!nurScan()) return
    setText('')
    setAdresse(null)
    setInfo(null)
    setRechnung(null)
    if (canScan()) setScannen(true)
  }

  // von der Startseite oder aus Empfangen übergeben
  onMount(() => {
    if (bezahlenScannen()) {
      setBezahlenScannen(false)
      setNurScan(true)
      if (canScan()) setScannen(true)
      else setScanFehler('Dieser Browser gibt die Kamera nicht frei.')
    }
    const t = zuBezahlen()
    if (t) {
      setZuBezahlen(null)
      setText(t)
      void weiter()
    }
  })

  const weiter = async () => {
    const e = erkannt()
    if (!e?.geht) return
    if (e.art === 'rechnung') {
      setRechnung(e.wert)
      setSchritt('bestaetigen')
      return
    }
    const url = e.art === 'lnurl' ? e.url : resolveMintInput(e.wert)
    if (!url) return
    setArbeitet(true)
    try {
      let i
      try {
        i = await fetchPayRequest(url)
      } catch (err) {
        // fetchPayRequest prüft tag „payRequest“ — ein Abhebe- oder Anmelde-LNURL kommt hier nicht weiter
        const m = (err as Error).message
        return melde(
          m.startsWith('Not a payRequest')
            ? 'Dieser Code ist kein Zahlungscode — der Empfänger nimmt hier keine Zahlung an.'
            : `${e.art === 'lnurl' ? 'Der Empfänger' : 'Diese Adresse'} antwortet gerade nicht: ${m}`
        )
      }
      if (
        !(i.minSendable > 0) ||
        !(i.maxSendable >= i.minSendable) ||
        Math.floor(i.maxSendable / 1000) < Math.ceil(i.minSendable / 1000)
      )
        return melde('Der Empfänger nennt keinen gültigen Betrag.')
      setInfo(i)
      setAdresse(e.art === 'lnurl' ? e.stelle : e.wert)
      // nur ein Betrag möglich: keine Tastatur, gleich die Rechnung über genau diesen Betrag
      if (i.minSendable === i.maxSendable) {
        setFest(true)
        await holeRechnung(i, i.minSendable)
        return
      }
      setFest(false)
      setSchritt('betrag')
    } finally {
      setArbeitet(false)
    }
  }
  // Fehler beim Abrufen: als Meldung, beim Scannen zusätzlich unter dem Kamerafeld
  const melde = (satz: string) => {
    notify(satz, NotifyKind.ERROR)
    if (nurScan()) setScanFehler(satz)
  }
  // Rechnung über genau diesen Betrag; eine ohne oder mit anderem Betrag wird nicht angenommen
  // (requestInvoice prüft Betrag und Metadaten-Hash, hier zusätzlich: ohne Betrag gibt es nichts zu bestätigen)
  const holeRechnung = async (i: PayRequestInfo, betragMsat: number) => {
    try {
      const r = await requestInvoice(i, betragMsat)
      if (decodeBolt11AmountMsat(r.pr) !== betragMsat)
        throw new Error('Rechnung ohne Betrag')
      setRechnung(r.pr)
      setSchritt('bestaetigen')
    } catch (err) {
      melde(`Die Rechnung kam nicht: ${(err as Error).message}`)
    }
  }

  // Adresse: Betrag → Rechnung holen
  const grenzen = () => {
    const i = info()
    return i
      ? {
          min: Math.ceil(i.minSendable / 1000),
          max: Math.floor(i.maxSendable / 1000)
        }
      : {min: 1, max: 0}
  }
  const betragGeht = () =>
    ein.betrag() >= grenzen().min && ein.betrag() <= grenzen().max
  const rechnungHolen = async () => {
    const i = info()
    if (!i || !betragGeht()) return
    setArbeitet(true)
    try {
      await holeRechnung(i, ein.betrag() * 1000)
    } finally {
      setArbeitet(false)
    }
  }

  // Bestätigen: wie viel, woraus, welche Gebühr
  const msat = () => {
    const r = rechnung()
    return r ? (decodeBolt11AmountMsat(r) ?? 0) : 0
  }
  const sats = () => Math.floor(msat() / 1000)
  const verfuegbar = createMemo(() => {
    const g = gebunden()
    return bearers().filter(
      b => !b.spent && !b.deviceId && b.verified && !g.has(b.id)
    )
  })
  const quelle = createMemo(() => waehleSchein(verfuegbar(), msat()))
  const zweck = () => {
    const r = rechnung()
    return (r && rechnungsZweck(r)) || (info() && adressText(info()!.metadata))
  }
  const gebuehrText = () => {
    const q = quelle()
    if (!q) return '—'
    if (q.amount === msat()) return 'keine'
    // beim Abspalten fällt die Teil-Gebühr der Stelle an, vom Rest (gebuehren.ts: „zuletzt 1 Sat“)
    const g = teilGebuehr(serverOf(q.url))
    return g ? `${g}, vom Rest` : 'beim Abspalten möglich, vom Rest'
  }

  const bezahlen = async () => {
    const r = rechnung()
    const q = quelle()
    if (!r || !q) return
    setArbeitet(true)
    try {
      const schein = await scheinUeber(q, msat(), {
        bearers,
        addBearer,
        updateBearer,
        removeBearer,
        logActivity,
        deviceClient,
        requireDeviceClient
      })
      if (!schein) return
      let ergebnis
      try {
        ergebnis = await meltNote(schein.callback, requireNoteK1(schein.url), r)
      } catch (err) {
        if (err instanceof NoteSpentError) {
          await updateBearer(schein.id, {spent: true})
          logActivity(
            'spent',
            `${serverOf(schein.url)} meldet ${zahl(sats())} Sats als schon ausgegeben – hier markiert.`,
            schein.label
          )
        }
        throw err
      }
      // angestoßen, nicht bezahlt: die Stelle stellt den Schein wieder her, wenn die Zahlung scheitert
      // (lib/request.ts meltNote). Darum nur als 'zahlung' sperren — entschieden wird in bezahlwache.ts,
      // hier auf der Seite und von der Bezahl-Wache, auch wenn man die Seite verlässt (Pixel, 2026-10-29)
      const an = adresse() ? ` an ${adresse()}` : ''
      const fuer = zweck() ? ` (${zweck()})` : ''
      const gesperrt: Bearer = {
        ...schein,
        spent: true,
        spentGrund: 'zahlung',
        zahlung: {
          seit: Date.now(),
          text: `${zahl(sats())} Sats bezahlt${an}${fuer}`,
          verify: ergebnis.verify,
          pr: r
        }
      }
      await updateBearer(schein.id, {
        spent: true,
        spentGrund: 'zahlung',
        zahlung: gesperrt.zahlung
      })
      setBezahlt(gesperrt)
      setSchritt('unterwegs')
      const ctx = {updateBearer, removeBearer, logActivity}
      const frage = async () => {
        const e = await pruefeZahlung(gesperrt, ctx)
        if (e === 'offen') return
        clearInterval(uhr)
        if (e === 'bezahlt') setSchritt('fertig')
        else {
          notify(
            'Die Zahlung ist nicht durchgegangen — der Schein ist wieder in der Wallet.',
            NotifyKind.ERROR
          )
          setSchritt('bestaetigen')
        }
      }
      uhr = setInterval(() => void frage(), 3000)
    } catch (err) {
      notify(`Bezahlen ging nicht: ${(err as Error).message}`, NotifyKind.ERROR)
    } finally {
      setArbeitet(false)
    }
  }

  const kopf = (zurueck: () => void, titel = 'Bezahlen') => (
    <div class="rz-seitenkopf">
      <button
        type="button"
        class="rz-zurueck"
        aria-label="Zurück"
        onClick={zurueck}
      >
        ‹
      </button>
      <h2>{titel}</h2>
    </div>
  )

  return (
    <RequireWallet>
      <div
        class="page rz-senden rz-bezahlen"
        classList={{'rz-scan': nurScan() && schritt() === 'eingabe'}}
      >
        <Switch>
          <Match when={nurScan() && schritt() === 'eingabe'}>
            {kopf(() => navigate(-1), 'Rechnung scannen')}
            {/* nur die Kamera: Bild ungefiltert, Rahmen und Ecken liegen darüber, nicht darauf */}
            <div class="rz-scanfeld">
              <Show
                when={scannen()}
                fallback={
                  <div class="rz-scan-aus">
                    {arbeitet() ? 'Einen Moment …' : 'Kamera ist aus'}
                  </div>
                }
              >
                <Scanner
                  accept={nimmt}
                  onScan={gescannt}
                  onFehler={kameraFehler}
                />
              </Show>
              <span class="rz-ecke lo" />
              <span class="rz-ecke ro" />
              <span class="rz-ecke lu" />
              <span class="rz-ecke ru" />
            </div>
            <p class="rz-erkannt fremd rz-scan-zeile" aria-live="polite">
              {scanFehler() ?? ''}
            </p>
            <button
              type="button"
              class="rz-knopf rz-weiter rz-kamera"
              disabled={!canScan() || arbeitet()}
              onClick={kamera}
            >
              <span class="lbl">{scannen() ? 'Kamera aus' : 'Kamera ein'}</span>
            </button>
          </Match>

          <Match when={schritt() === 'eingabe'}>
            {kopf(() => navigate(-1))}
            <label class="rz-feldname" for="bz-feld">
              Rechnung, Lightning-Adresse oder LNURL
            </label>
            <textarea
              id="bz-feld"
              class="rz-feld"
              rows="3"
              placeholder="lnbc…, name@stelle.at oder lnurl1…"
              autocomplete="off"
              autocapitalize="off"
              spellcheck={false}
              value={text()}
              onInput={e => setText(e.currentTarget.value)}
            />
            <Show when={erkannt()}>
              <p class="rz-erkannt" classList={{fremd: !erkannt()!.geht}}>
                {erkannt()!.satz}
              </p>
            </Show>
            <Show when={scannen()}>
              <div class="rz-scanner">
                <Scanner
                  onScan={w => {
                    setScannen(false)
                    setText(saeubere(w))
                  }}
                />
              </div>
            </Show>
            <div class="rz-duo">
              <button
                type="button"
                class="rz-knopf"
                disabled={!canScan()}
                onClick={() => setScannen(s => !s)}
              >
                <span class="lbl">{scannen() ? 'Kamera aus' : 'Scannen'}</span>
              </button>
              <button
                type="button"
                class="rz-knopf an"
                disabled={!erkannt()?.geht || arbeitet()}
                onClick={() => void weiter()}
              >
                <span class="lbl">
                  {arbeitet() ? 'Einen Moment …' : 'Weiter'}
                </span>
              </button>
            </div>
            <A href="/wallet?bezahlen=1" class="rz-aendern rz-block rz-mitte">
              Mehr Möglichkeiten (interne Überweisung, Tresor) ›
            </A>
          </Match>

          <Match when={schritt() === 'betrag'}>
            {kopf(zurEingabe)}
            <p class="rz-hinweis rz-mitte">
              An {adresse()}
              <Show when={info() && adressText(info()!.metadata)}>
                {' '}
                · {adressText(info()!.metadata)}
              </Show>
            </p>
            <Zaehlwerk
              sats={ein.betrag()}
              sofort
              kalt={!betragGeht()}
              wahl={ein.wahl()}
              onWahl={ein.kurs() ? ein.waehle : undefined}
              euroAnzeige={ein.euroAnzeige()}
            >
              <Show when={ein.betrag() > 0 && !betragGeht()}>
                <div class="rz-ueber">
                  <span>
                    Möglich sind {zahl(grenzen().min)} bis {zahl(grenzen().max)}{' '}
                    Sats
                  </span>
                </div>
              </Show>
            </Zaehlwerk>
            <Tastatur betrag={ein} />
            <button
              type="button"
              class="rz-knopf an rz-weiter"
              disabled={!betragGeht() || arbeitet()}
              onClick={() => void rechnungHolen()}
            >
              <span class="lbl">
                {arbeitet() ? 'Einen Moment …' : 'Weiter'}
              </span>
            </button>
          </Match>

          <Match when={schritt() === 'bestaetigen'}>
            {kopf(() =>
              adresse() && !fest() ? setSchritt('betrag') : zurEingabe()
            )}
            <Zaehlwerk sats={sats()} sofort kalt={!quelle()} />
            <div class="rz-gruppe">
              <Show when={adresse()}>
                <div class="rz-setting rz-still">
                  <span class="sl">An</span>
                  <span class="val">{adresse()}</span>
                </div>
              </Show>
              <Show when={zweck()}>
                <div class="rz-setting rz-still">
                  <span class="sl">Zweck</span>
                  <span class="val">{zweck()}</span>
                </div>
              </Show>
              <div class="rz-setting rz-still">
                <span class="sl">Gebühr</span>
                <span class="val">{gebuehrText()}</span>
              </div>
              <div class="rz-setting rz-still">
                <span class="sl">Bezahlt aus</span>
                <span class="val" classList={{'rz-fehlt': !quelle()}}>
                  {quelle()
                    ? serverOf(quelle()!.url)
                    : 'kein Schein reicht allein'}
                </span>
              </div>
            </div>
            <Show when={!quelle()}>
              <p class="rz-hinweis">
                Bezahlt wird aus einem Schein einer Ausgabestelle. Leg vorher
                Scheine derselben Stelle zusammen oder lade auf.
              </p>
            </Show>
            <button
              type="button"
              class="rz-knopf an rz-weiter"
              disabled={!quelle() || arbeitet()}
              onClick={() => void bezahlen()}
            >
              <span class="lbl">
                {arbeitet()
                  ? 'Einen Moment …'
                  : `${zahl(sats())} Sats bezahlen`}
              </span>
            </button>
          </Match>

          <Match when={schritt() === 'unterwegs'}>
            <div class="rz-fertig">
              <Zaehlwerk sats={sats()} sofort kalt>
                <p class="rz-status">
                  <span class="rz-lampe-klein" /> Zahlung unterwegs — die
                  Ausgabestelle bestätigt gleich
                </p>
              </Zaehlwerk>
              <p class="rz-hinweis">
                Du kannst die Seite schließen — die Wallet fragt weiter nach.
                Bestätigt, steht es im Verlauf; kommt die Zahlung nicht durch,
                ist der Schein nach spätestens fünf Minuten wieder da.
              </p>
              <button
                type="button"
                class="rz-knopf an rz-weiter"
                onClick={() => navigate('/wallet')}
              >
                <span class="lbl">Zur Wallet</span>
              </button>
            </div>
          </Match>

          <Match when={schritt() === 'fertig'}>
            <div class="rz-fertig">
              {/* wie beim Senden: eine Bewegung, kein Stand (Steve) */}
              <Zaehlwerk sats={sats()} sofort vorzeichen="−">
                <p class="rz-zeile-matt">Bezahlt</p>
                <Show when={zweck() || adresse()}>
                  <p class="rz-klein">{zweck() || adresse()}</p>
                </Show>
              </Zaehlwerk>
              <button
                type="button"
                class="rz-knopf an rz-weiter"
                onClick={() => navigate('/wallet')}
              >
                <span class="lbl">Zur Wallet</span>
              </button>
            </div>
          </Match>
        </Switch>
      </div>
    </RequireWallet>
  )
}

export default Bezahlen
