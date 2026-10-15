// Meldungen des Originals auf Deutsch, an einer Stelle (helpers.notify ruft das auf). Unklare Antworten
// sind kein Alarm: die Prüfwache klärt sie gleich selbst — also ruhig statt rot (Steve, 2026-10-12).
type Art = 'fehler' | 'ruhig' | null

const REGELN: [RegExp, string, Art][] = [
  [/^Copied to clipboard!?$/, 'In die Zwischenablage kopiert.', null],
  [
    /^This note has already been spent/,
    'Dieser Schein wurde schon eingelöst.',
    null
  ],
  [
    /^The service doesn't recognize this note/,
    'Die Ausgabestelle kennt diesen Schein nicht (mehr).',
    null
  ],
  [
    /^The split may have gone through but could not be confirmed/,
    'Die Antwort der Ausgabestelle war unklar. Die Wallet prüft gleich selbst, ob geteilt wurde.',
    'ruhig'
  ],
  [
    /^Das Zusammenlegen ist vielleicht angekommen, aber nicht bestätigt/,
    'Die Antwort der Ausgabestelle war unklar. Die Wallet klärt gleich selbst, ob zusammengelegt wurde.',
    'ruhig'
  ],
  [
    /Sats empfangen, aber die Ausgabestelle verweigerte das Erneuern/,
    'Schein empfangen, aber noch nicht erneuert — der Absender hätte sonst noch eine Kopie. Die Wallet sichert ihn ab, sobald die Stelle es zulässt.',
    'ruhig'
  ],
  [
    /Sats empfangen, aber noch nicht erneuert/,
    'Schein empfangen, noch nicht erneuert — die Wallet holt das gleich nach.',
    'ruhig'
  ],
  [
    /Sats empfangen, aber ob das Erneuern ankam, ist unklar/,
    'Schein empfangen — ob das Erneuern ankam, ist unklar. Die Wallet klärt das gleich selbst.',
    'ruhig'
  ],
  [
    /^Schein gespeichert, aber die Ausgabestelle war nicht erreichbar/,
    'Schein gespeichert — die Ausgabestelle antwortet gerade nicht. Die Wallet prüft und sichert ihn ab, sobald sie erreichbar ist.',
    'ruhig'
  ],
  [
    /may (still )?have gone through/,
    'Die Antwort der Ausgabestelle war unklar. Die Wallet prüft das gleich selbst.',
    'ruhig'
  ]
]

export const meldung = (text: string): {text: string; art: Art} => {
  for (const [muster, deutsch, art] of REGELN)
    if (muster.test(text)) return {text: deutsch, art}
  return {text, art: null}
}
