import type {Component} from 'solid-js'
import {Show, createSignal, onCleanup, onMount} from 'solid-js'
import jsQR from 'jsqr'

export type ScannerProps = {
  // called once with the first QR payload that `accept` (if given) lets through
  onScan: (value: string) => void
  accept?: (value: string) => boolean
  // Fork: Fehler (keine Freigabe, keine Kamera) an die Seite melden statt selbst anzuzeigen — „Rechnung
  // scannen“ zeigt dann die ruhige Fläche und „Kamera ein“ zum erneuten Versuch (Gerhard, 2026-10-29)
  onFehler?: (art: 'verweigert' | 'keine') => void
}

// whether this browser even exposes the camera API at all - a cheap,
// synchronous prerequisite check (no permission prompt, no device probe)
// for hasCameraDevice below, and the one ScanToggle falls back to showing
// while that async probe is still pending, so a browser that DOES have a
// camera doesn't flash the scan button away and back.
export const canScan = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

// whether this device actually has a camera to scan with, not just the
// browser API for one - canScan() alone stays true on a desktop/laptop
// with zero webcams (the API exists, there's simply nothing to open), which
// used to mean tapping the scan button always "worked" right up until
// getUserMedia rejected and Scanner showed a wrong "Camera access was
// denied" error for what was actually "no camera exists". enumerateDevices
// lists every input device - including its `kind` - without requesting
// permission first (labels are blank until permission is granted, but
// `kind` itself is always populated), so this needs no user prompt to
// answer honestly. Never throws: an environment that can't enumerate at
// all (permissions-policy denial, an unusual embedded webview) is treated
// the same as "no camera" - the button stays hidden rather than risk
// showing one that can't work.
export const hasCameraDevice = async (): Promise<boolean> => {
  if (!canScan()) return false
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.some(d => d.kind === 'videoinput')
  } catch {
    return false
  }
}

// Camera QR scanning: the native BarcodeDetector API when available (fast,
// no extra decode work on the main thread), falling back to jsQR (~30kB)
// decoding raw video frames via an off-screen canvas everywhere else -
// notably Firefox, which still ships no BarcodeDetector on desktop or
// mobile, and would otherwise be unable to scan at all.
const Scanner: Component<ScannerProps> = props => {
  let videoRef: HTMLVideoElement | undefined
  let stream: MediaStream | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  const [error, setError] = createSignal<string | null>(null)
  // Fork: Safari am iPhone startet das Bild manchmal erst nach einer Berührung (Gerhard, 2026-10-17)
  const [startKnopf, setStartKnopf] = createSignal(false)
  const hasBarcodeDetector = 'BarcodeDetector' in window
  const [messung, setMessung] = createSignal<string | null>(null)
  let messer: ReturnType<typeof setInterval> | null = null
  let abspielen = 'ok'
  // ausgelesene Bilder und ihre mittlere Helligkeit (0–255): schwarz geliefert oder nur schwarz gezeichnet?
  let bilder = 0
  let hell: number | null = null
  let dunkelSeit: number | null = null
  // in welchem Schritt der Start gerade steht — bleibt iOS in einem hängen, zeigt die Messzeile welchen
  let schritt = 'fragt nach der Kamera'
  const start = Date.now()

  const stop = () => {
    if (timer) clearInterval(timer)
    timer = null
    if (messer) clearInterval(messer)
    messer = null
    stream?.getTracks().forEach(track => track.stop())
    stream = null
  }

  // shared by both detection paths - returns true once a value has been
  // accepted and handed off, so the caller can stop its own scan loop
  const handleValue = (value: string): boolean => {
    if (!value) return false
    if (props.accept && !props.accept(value)) return false
    stop()
    props.onScan(value)
    return true
  }

  const scanWithBarcodeDetector = () => {
    const detector = new (window as any).BarcodeDetector({
      formats: ['qr_code']
    })
    timer = setInterval(async () => {
      if (!videoRef || videoRef.readyState < 2) return
      try {
        const codes = await detector.detect(videoRef)
        for (const code of codes) {
          if (handleValue(String(code.rawValue || ''))) return
        }
      } catch {
        // a single failed detection pass is not fatal - just try again
      }
    }, 250)
  }

  const scanWithJsQr = () => {
    // an off-screen canvas, never attached to the DOM - only used to pull
    // pixel data out of the video element for jsQR to decode
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', {willReadFrequently: true})
    if (!ctx) return
    timer = setInterval(() => {
      if (!videoRef || videoRef.readyState < 2) return
      // Fork: nur das mittlere Quadrat (3/4 der kürzeren Seite) — dorthin hält man den Code; weniger
      // Bildpunkte, die jsQR durchsuchen muss, und der Code füllt mehr davon (iPad/iPhone, 2026-10-25)
      const w = videoRef.videoWidth
      const h = videoRef.videoHeight
      const seite = Math.floor(Math.min(w, h) * 0.75)
      if (!seite) return
      canvas.width = seite
      canvas.height = seite
      ctx.drawImage(
        videoRef,
        Math.floor((w - seite) / 2),
        Math.floor((h - seite) / 2),
        seite,
        seite,
        0,
        0,
        seite,
        seite
      )
      const frame = ctx.getImageData(0, 0, seite, seite)
      bilder++
      let summe = 0
      let n = 0
      for (let i = 0; i < frame.data.length; i += 4 * 97) {
        summe += frame.data[i] + frame.data[i + 1] + frame.data[i + 2]
        n++
      }
      hell = n ? Math.round(summe / n / 3) : null
      const result = jsQR(frame.data, frame.width, frame.height, {
        inversionAttempts: 'dontInvert'
      })
      if (result) handleValue(result.data)
    }, 250)
  }

  onMount(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      if (props.onFehler) return props.onFehler('keine')
      setError('Dieser Browser gibt die Kamera nicht frei.')
      return
    }
    // Fork: Messzeile (Gerhard, iPhone schwarz in Safari und als App, 2026-10-25). Läuft ab dem ersten
    // Schritt — in der ersten Fassung erst nach dem Abspielen, und bei Gerhard kam sie nie: iOS hing also
    // davor. Kommt nach 3 s kein Bild, steht da, in welchem Schritt es hängt und was die Kamera liefert.
    messer = setInterval(() => {
      // Zeile nur, wenn etwas nicht stimmt (Gerhard am iPhone, 2026-10-25: Kamera liefert, erkennt): kein
      // Bild nach 3 s, oder 5 s lang nur schwarze Bilder (Helligkeit < 8 — Linse verdeckt, zu dunkel, oder
      // die Kamera liefert schwarz; am iPhone war es einmal die Tischplatte). Der eingebaute Erkenner
      // (Pixel) misst keine Helligkeit — dort genügt „Bild da“
      const bildDa =
        !!videoRef && videoRef.videoWidth > 0 && videoRef.readyState >= 2
      if (!bildDa || hell === null || hell >= 8) dunkelSeit = null
      else dunkelSeit ??= Date.now()
      const dunkel = dunkelSeit !== null && Date.now() - dunkelSeit > 5000
      if (bildDa && !dunkel) {
        setMessung(null)
        return
      }
      if (Date.now() - start < 3000) return
      const spur = stream?.getVideoTracks()[0]
      const e = spur?.getSettings?.()
      setMessung(
        [
          ...(dunkel
            ? [
                'Die Kamera sieht nur Schwarz — ist die Linse frei und genug Licht da?'
              ]
            : []),
          `Schritt: ${schritt} (seit ${Math.round((Date.now() - start) / 1000)} s)`,
          `Kamera: ${(spur?.label || '–').slice(0, 40)}`,
          spur
            ? `Spur ${spur.readyState === 'live' ? 'läuft' : 'beendet'}${spur.muted ? ', liefert keine Bilder' : ''}${spur.enabled ? '' : ', abgeschaltet'}`
            : 'keine Spur',
          `angefordert ${e?.width ?? '?'} × ${e?.height ?? '?'}`,
          `Bild ${videoRef?.videoWidth ?? '–'} × ${videoRef?.videoHeight ?? '–'}`,
          `Video-Stand ${videoRef?.readyState ?? '–'}`,
          `${bilder} Bilder gelesen, Helligkeit ${hell ?? '–'} von 255`,
          `Abspielen ${abspielen}${videoRef?.paused ? ', angehalten' : ''}`
        ].join(' · ')
      )
    }, 1000)
    try {
      // Fork: ohne Wunsch liefert Safari oft nur 640 × 480 — zu wenig für dichte Codes (Tombola-Lose).
      // Hohe Auflösung als Wunsch; lehnt ein Gerät das ab, wie bisher
      try {
        schritt = 'fragt nach der Kamera (hohe Auflösung)'
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {ideal: 'environment'},
            width: {ideal: 1920},
            height: {ideal: 1080}
          }
        })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'NotAllowedError')
          throw err
        schritt = 'fragt nach der Kamera (einfach)'
        stream = await navigator.mediaDevices.getUserMedia({
          video: {facingMode: 'environment'}
        })
      }
    } catch (err) {
      // NotFoundError: hasCameraDevice's own probe (ScanToggle) missed a
      // race - the camera was unplugged/reclaimed between probing and
      // opening. Distinct message from an actual permission denial, which
      // is the far more common real-world case.
      stop()
      const keine = err instanceof DOMException && err.name === 'NotFoundError'
      if (props.onFehler) return props.onFehler(keine ? 'keine' : 'verweigert')
      setError(
        keine
          ? 'Keine Kamera gefunden.'
          : 'Der Zugriff auf die Kamera wurde verweigert.'
      )
      return
    }
    schritt = 'Kamera erhalten, verbindet das Bild'
    if (!videoRef) {
      schritt = 'kein Videofeld'
      return
    }
    // Fork: iPhone (Safari, auch als App vom Home-Bildschirm) zeigt das Bild sonst schwarz, obwohl die
    // Kamera läuft — stumm, inline und automatisch ausdrücklich setzen, Abspielen absichern; verweigert
    // Safari es ohne Berührung, ein Knopf „Kamera starten“ (Gerhard am iPhone, 2026-10-17)
    videoRef.muted = true
    videoRef.playsInline = true
    videoRef.autoplay = true
    videoRef.setAttribute('playsinline', '')
    videoRef.setAttribute('webkit-playsinline', '')
    videoRef.srcObject = stream
    schritt = 'startet das Abspielen'
    // nicht ewig warten: antwortet iOS nach 3 s weder ja noch nein, kommt der Knopf — eine Berührung
    // löst das oft; gescannt wird trotzdem, sobald Bilder kommen
    abspielen = 'keine Antwort'
    const antwort = videoRef.play().then(
      () => {
        abspielen = 'ok'
        schritt = 'spielt ab'
      },
      () => {
        abspielen = 'verweigert'
        setStartKnopf(true)
      }
    )
    await Promise.race([antwort, new Promise(r => setTimeout(r, 3000))])
    if (abspielen === 'keine Antwort') setStartKnopf(true)

    if (hasBarcodeDetector) scanWithBarcodeDetector()
    else scanWithJsQr()
  })

  const starte = async () => {
    try {
      await videoRef?.play()
      abspielen = 'nach Berührung ok'
      setStartKnopf(false)
    } catch {
      // bleibt sichtbar
    }
  }

  onCleanup(stop)

  return (
    <Show
      when={error()}
      fallback={
        // playsinline/muted so iOS Safari renders the stream inline
        // instead of forcing fullscreen playback
        <>
          <Show when={messung()}>
            <p class="rz-klein rz-messzeile">{messung()}</p>
          </Show>
          <video ref={videoRef} class="scanner" playsinline muted autoplay />
          <Show when={startKnopf()}>
            <button
              type="button"
              class="rz-knopf an rz-weiter"
              onClick={() => void starte()}
            >
              <span class="lbl">Kamera starten</span>
            </button>
          </Show>
        </>
      }
    >
      <p class="warning">
        {error()} Füge den Schein stattdessen ein oder mach ein Foto.
      </p>
    </Show>
  )
}
export default Scanner
