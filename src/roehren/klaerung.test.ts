import {beforeEach, describe, expect, it} from 'vitest'

// node hat kein localStorage — ein schlichter Ersatz genügt
const speicher = new Map<string, string>()
;(globalThis as {localStorage?: unknown}).localStorage = {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k)
}

const {aendere, beobachte, gebunden, vorgaenge} = await import('./klaerung')
import type {Bearer} from '../storage'

const schein = (id: string, sats: number, verified = true): Bearer =>
  ({id, url: `https://lnurl.21linz.at/w?k1=${id}`, callback: 'x', amount: sats * 1000, verified, createdAt: 0, updatedAt: 0}) as Bearer

describe('Vorgänge in Klärung', () => {
  beforeEach(() => {
    for (const v of vorgaenge()) aendere(v.id, () => null)
  })

  it('hält unklares Zusammenlegen fest und bindet Eingänge und Ergebnis', async () => {
    let alle = [schein('a', 52), schein('b', 52)]
    await beobachte('zusammenlegen', alle, () => alle, async () => {
      alle = [...alle, schein('c', 104, false)] // Original: möglicher Schein ungeprüft daneben
    })
    expect(vorgaenge()).toHaveLength(1)
    expect(vorgaenge()[0]).toMatchObject({art: 'zusammenlegen', host: 'lnurl.21linz.at', eingangSats: [52, 52], ergebnisSats: [104]})
    expect([...gebunden()].sort()).toEqual(['a', 'b', 'c'])
  })

  it('hält nichts fest, wenn der Vorgang klar endet', async () => {
    let alle = [schein('a', 52), schein('b', 52)]
    await beobachte('zusammenlegen', alle, () => alle, async () => {
      alle = [schein('c', 104)] // bestätigt, Eingänge weg
    })
    expect(vorgaenge()).toHaveLength(0)
  })

  it('hält auch fest, wenn der Vorgang mit Fehler endet (Senden)', async () => {
    let alle = [schein('a', 105)]
    await expect(
      beobachte('teilen', alle, () => alle, async () => {
        alle = [...alle, schein('p', 52, false), schein('q', 53, false)]
        throw new Error('unklar')
      })
    ).rejects.toThrow('unklar')
    expect(vorgaenge()[0]).toMatchObject({art: 'teilen', eingangSats: [105], ergebnisSats: [52, 53]})
  })
})
