// Zwölf Wörter aus beliebigem Text lesen (Gerhard am iPad, 2026-10-17): aus Bitwardens Notiz eingefügt hieß
// es „keine gültigen zwölf Wörter“, am Pixel ging derselbe Text — die Prüfung des Originals verlangt genau
// ein Leerzeichen dazwischen. Jetzt gilt alles, was kein Buchstabe ist, als Trennung: Zeilenumbrüche,
// Tabs, doppelte und geschützte Leerzeichen, unsichtbare Zeichen, Nummerierung („1. admit 2) aware“).
import {wordlist} from '@scure/bip39/wordlists/english.js'

import {isValidSeedPhrase} from '../keys'

const BEKANNT = new Set(wordlist)

export const woerterAus = (text: string): string[] =>
  text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

// die Wörter als ein Satz, wie die Ableitung sie braucht
export const satzAus = (text: string): string => woerterAus(text).join(' ')

// null = gültig; sonst ein Satz, der sagt, was nicht stimmt (ohne die Wörter selbst zu wiederholen)
export const woerterProblem = (text: string): string | null => {
  const w = woerterAus(text)
  if (w.length === 0) return 'Bitte die zwölf Wörter eingeben.'
  const unbekannt = w.findIndex(x => !BEKANNT.has(x))
  if (unbekannt >= 0)
    return `Wort ${unbekannt + 1} gibt es in der Liste nicht — ein Tippfehler?`
  if (w.length !== 12)
    return `Ich erkenne ${w.length} Wörter — es müssen genau zwölf sein.`
  if (!isValidSeedPhrase(w.join(' ')))
    return 'Alle Wörter sind gültig, passen aber nicht zusammen — stimmt die Reihenfolge?'
  return null
}
