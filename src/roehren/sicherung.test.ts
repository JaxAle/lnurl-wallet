import {describe, expect, it} from 'vitest'

const speicher = new Map<string, string>()
;(globalThis as {localStorage?: unknown}).localStorage = {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k)
}

const {merkeSicherung, ungesichert, erinnern, alterText} =
  await import('./sicherung')

const TAG = 24 * 60 * 60 * 1000
const alt = (id: string, k1: string, updatedAt = 0) => ({
  id,
  url: `https://lnurl.21linz.at/w?k1=${k1}`,
  amount: 1000,
  verified: true,
  updatedAt
})

describe('Erinnerung an die Sicherung', () => {
  it('zählt nur Scheine, die die Wörter nicht finden und die Sicherung nicht so kennt', () => {
    const a = alt('a', 'ab'.repeat(32))
    const b = alt('b', 'cd'.repeat(32))
    expect(ungesichert([a, b]).map(x => x.id)).toEqual(['a', 'b'])
    merkeSicherung([a, b])
    expect(ungesichert([a, b])).toEqual([])
    // erneuert: neues Geheimnis, die Sicherung hält nur das alte
    const a2 = {...a, url: `https://lnurl.21linz.at/w?k1=${'ef'.repeat(32)}`}
    expect(ungesichert([a2, b]).map(x => x.id)).toEqual(['a'])
    // ausgegebene zählen nicht
    expect(ungesichert([{...a2, spent: true}, b])).toEqual([])
  })

  it('erinnert nicht sofort nach einem Empfang, aber nach einem Tag oder ab drei', () => {
    const jetzt = 10 * TAG
    expect(erinnern([alt('x', '1', jetzt - 1000)], jetzt)).toBe(false)
    expect(erinnern([alt('x', '1', jetzt - 2 * TAG)], jetzt)).toBe(true)
    expect(
      erinnern(
        [alt('x', '1', jetzt), alt('y', '2', jetzt), alt('z', '3', jetzt)],
        jetzt
      )
    ).toBe(true)
    expect(alterText(null)).toBe('Noch keine Sicherung')
    expect(alterText(jetzt - 5 * TAG, jetzt)).toBe('Sicherung ist 5 Tage alt')
  })
})
