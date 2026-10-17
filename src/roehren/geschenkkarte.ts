// Texte und Zeichen-Säuberung der deutschen Geschenkkarte (Geschenkkarte.tsx, addons/giftcard/pdf.ts)

export const TEXTE = {
  title: 'GESCHENKKARTE',
  amount: (sat: number) => `${sat.toLocaleString('de-DE')} Sats`,
  scan: 'Scannen und einlösen',
  footer:
    'Bitcoin-Bargeld (LNURLcash): mit einer Lightning-Wallet scannen und einlösen. Wer diesen Code hat, hat das Geld.'
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
