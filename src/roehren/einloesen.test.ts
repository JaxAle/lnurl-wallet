import {beforeEach, describe, expect, it} from 'vitest'

import {merkeUnterwegs, pruefeRunde, unterwegsIds} from './einloesen'

// node hat kein localStorage — ein schlichter Ersatz genügt
const speicher = new Map<string, string>()
;(globalThis as {localStorage?: unknown}).localStorage = {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k)
}

describe('Einlösen erkennen', () => {
  beforeEach(() => speicher.clear())

  it('markiert einen aufgedeckten Schein, sobald die Ausgabestelle ihn als verbraucht meldet', async () => {
    merkeUnterwegs('a', 1000)
    const markiert: string[] = []
    const eingeloest = await pruefeRunde(
      [{id: 'a', url: 'lnurl-a'}],
      async id => void markiert.push(id),
      async () => 'gone',
      2000
    )
    expect(eingeloest).toEqual(['a'])
    expect(markiert).toEqual(['a'])
    expect(unterwegsIds()).toEqual([])
  })

  it('beobachtet weiter, solange der Schein lebt oder keine Auskunft kommt', async () => {
    merkeUnterwegs('a', 1000)
    merkeUnterwegs('b', 1000)
    const antworten: Record<string, 'live' | 'unknown'> = {'lnurl-a': 'live', 'lnurl-b': 'unknown'}
    const eingeloest = await pruefeRunde(
      [
        {id: 'a', url: 'lnurl-a'},
        {id: 'b', url: 'lnurl-b'}
      ],
      async () => {},
      async url => antworten[url],
      2000
    )
    expect(eingeloest).toEqual([])
    expect(unterwegsIds().sort()).toEqual(['a', 'b'])
  })

  it('fragt nicht nach bei ausgegebenen, verschwundenen, zu alten oder Geräte-Scheinen', async () => {
    const woche = 7 * 24 * 60 * 60 * 1000
    merkeUnterwegs('ausgegeben', 1000)
    merkeUnterwegs('weg', 1000)
    merkeUnterwegs('alt', 1000)
    merkeUnterwegs('geraet', 1000)
    const gefragt: string[] = []
    await pruefeRunde(
      [
        {id: 'ausgegeben', url: 'u1', spent: true},
        {id: 'alt', url: 'u2'},
        {id: 'geraet', url: 'u3', deviceId: 'd'}
      ],
      async () => {},
      async url => {
        gefragt.push(url)
        return 'live'
      },
      1000 + woche + 1
    )
    expect(gefragt).toEqual([])
    expect(unterwegsIds()).toEqual([])
  })

  it('merkt sich den ersten Zeitpunkt, nicht den letzten', async () => {
    merkeUnterwegs('a', 1000)
    merkeUnterwegs('a', 5000)
    expect(JSON.parse(speicher.get('fork_unterwegs')!)).toEqual({a: 1000})
  })
})
