// Texte und Zeichen-Säuberung der deutschen Geschenkkarte (Geschenkkarte.tsx, addons/giftcard/pdf.ts)

export const TEXTE = {
  title: 'GESCHENKKARTE',
  amount: (sat: number) => `${sat.toLocaleString('de-DE')} Sats`,
  scan: 'Scannen und einlösen',
  // der erste Schritt für den Beschenkten — womit man scannt (Steve, 2026-10-17)
  footer:
    'Mit einer Lightning-Wallet scannen, z. B. Phoenix oder Zeus. Wer diesen Code hat, hat das Geld.'
}

// die PDF-Schrift (Helvetica, WinAnsi) kennt nur westeuropäische Zeichen — ein Emoji oder „…“ ließe
// das Erstellen scheitern; typografische Zeichen werden ersetzt, der Rest entfällt
export const kartenText = (t: string): string =>
  t
    .replace(/[„“”«»]/g, '"')
    .replace(/[‚‘’‹›]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\n\x20-\x7e\u00a0-\u00ff€]/g, '')

// Euro-Wert für die Karte, mit Datum — der Kurs ändert sich, die Karte wird vielleicht später verschenkt
export const euroNotiz = (
  sats: number,
  eurJeBtc: number | null,
  heute = new Date()
): string | undefined => {
  if (!eurJeBtc) return undefined
  const eur = (sats / 100_000_000) * eurJeBtc
  return `ca. ${eur.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})} € am ${heute.toLocaleDateString('de-DE')}`
}

// Voreinstellung: im Dezember Weihnachten (Steve, 2026-10-17)
export const vorschlag = (heute = new Date()) =>
  heute.getMonth() === 11 ? ('weihnachten' as const) : ('klassisch' as const)
