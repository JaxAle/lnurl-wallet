// Röhren-Code (Gerhard, 2026-10-16): das Passwort wird auf dem Röhrenfeld getippt, wie im Prototyp —
// 40 Zeichen, A–Z, 0–9, . # & -. Die Wallet ist für kleine Beträge; ein zufälliger Code ab 8 Zeichen hält
// einem Durchprobieren am fremden Rechner (PBKDF2, 210.000 Runden) Jahre stand, darunter Tage bis Wochen.
// Am Gerät selbst bremst eine Wartezeit nach Fehlversuchen. Groß/klein spielt keine Rolle: neue Codes
// werden groß gespeichert, beim Entsperren wird zusätzlich die kleine Schreibung probiert (ältere Passwörter).

export const ZEICHEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.#&-'
export const MINDESTENS = 8

// Fehlertext, oder null, wenn der Code taugt
export const codeFehler = (code: string): string | null => {
  const c = code.toUpperCase()
  if ([...c].some(z => !ZEICHEN.includes(z)))
    return 'Nur Zeichen von den Röhren: A–Z, 0–9 und . # & -'
  if (c.length < MINDESTENS)
    return `Mindestens ${MINDESTENS} Zeichen — kürzere ließen sich durchprobieren.`
  return null
}
export const normalisiere = (code: string) => code.toUpperCase()
// nur Röhrenzeichen (Groß/klein egal)? Dann lässt er sich auch tippen — z. B. Apples Vorschläge (kuvqyD-…)
export const tippbar = (code: string) =>
  [...code.toUpperCase()].every(z => ZEICHEN.includes(z))

// beim Entsperren probiert: wie eingegeben (Röhren: groß; Passwortmanager: genau so), dann groß, dann klein
export const kandidaten = (code: string): string[] => [
  ...new Set([code, code.toUpperCase(), code.toLowerCase()])
]

// Bremse nach Fehlversuchen, übersteht Neuladen: ab dem 5. Fehler 30 s, dann je doppelt, höchstens 1 h
const SCHLUESSEL = 'fork_schloss'
type Stand = {fehl: number; bis: number}
const lies = (): Stand => {
  try {
    const s = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? 'null')
    return s && typeof s.fehl === 'number' ? s : {fehl: 0, bis: 0}
  } catch {
    return {fehl: 0, bis: 0}
  }
}
const schreibe = (s: Stand) => {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(s))
  } catch {
    // ohne Speicher keine Bremse über ein Neuladen hinaus
  }
}
export const wartenBis = (): number => lies().bis
export const fehlversuch = (jetzt = Date.now()): number => {
  const s = lies()
  const fehl = s.fehl + 1
  const warte =
    fehl >= 5 ? Math.min(30_000 * 2 ** (fehl - 5), 60 * 60 * 1000) : 0
  const bis = warte ? jetzt + warte : 0
  schreibe({fehl, bis})
  return bis
}
export const geschafft = () => schreibe({fehl: 0, bis: 0})

// Länge des Codes (Steve, 2026-10-16): damit das Schloss nach dem letzten Zeichen von selbst öffnet, wie
// im Prototyp. Gemerkt wird nur die Länge, nie der Code — sie verrät einem Angreifer wenig (weniger als
// Faktor 2 beim Durchprobieren). Unbekannt (erstes Mal, nach Einspielen einer Sicherung): Knopf „Öffnen“.
const LAENGE = 'fork_code_laenge'
export const codeLaenge = (): number | null => {
  try {
    const n = Number(localStorage.getItem(LAENGE))
    return Number.isInteger(n) && n > 0 ? n : null
  } catch {
    return null
  }
}
export const merkeLaenge = (n: number) => {
  try {
    localStorage.setItem(LAENGE, String(n))
  } catch {
    // dann eben mit Knopf
  }
}
export const vergissLaenge = () => {
  try {
    localStorage.removeItem(LAENGE)
  } catch {
    // nichts
  }
}
