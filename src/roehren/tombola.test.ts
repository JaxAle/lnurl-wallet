import {describe, expect, it} from 'vitest'

import {lospreis, verteile} from './tombola'

const summe = (s: {count: number; amountSat: number}[]) =>
  s.reduce((a, x) => a + x.count * x.amountSat, 0)
const lose = (s: {count: number}[]) => s.reduce((a, x) => a + x.count, 0)

describe('Tombola verteilt den Topf', () => {
  for (const [t, n] of [
    [10000, 20],
    [5000, 10],
    [2100, 21],
    [100000, 50],
    [777, 7]
  ]) {
    it(`${t} Sats auf ${n} Lose`, () => {
      for (const art of ['haupt', 'klassisch'] as const) {
        const s = verteile(art, t, n)
        if (!s) continue
        expect(summe(s)).toBe(t)
        expect(lose(s)).toBe(n)
        expect(Math.min(...s.map(x => x.amountSat))).toBeGreaterThanOrEqual(1)
        expect(s[0].amountSat).toBe(Math.max(...s.map(x => x.amountSat)))
      }
      const g = verteile('gleich', t, n)!
      expect(lose(g)).toBe(n)
      expect(summe(g)).toBeLessThanOrEqual(t)
      expect(t - summe(g)).toBeLessThan(n)
    })
  }

  it('lehnt ab, was nicht geht', () => {
    expect(verteile('klassisch', 10000, 4)).toBeNull()
    expect(verteile('haupt', 5, 10)).toBeNull()
  })

  it('Lospreis deckt den Topf und ist rund', () => {
    expect(lospreis(10000, 20)).toBe(500)
    expect(lospreis(2100, 21)).toBe(100)
    expect(lospreis(777, 7)).toBe(150)
    expect(lospreis(95, 10)).toBe(10)
  })
})
