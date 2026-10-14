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
