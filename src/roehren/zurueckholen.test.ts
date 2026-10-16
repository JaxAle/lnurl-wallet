import {describe, expect, it, vi} from 'vitest'

// node hat kein localStorage — ein schlichter Ersatz genügt
const speicher = new Map<string, string>()
;(globalThis as {localStorage?: unknown}).localStorage = {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k)
}

const {zurueckholenAuftrag, zurueckzuholen, vergissZurueckholen} =
  await import('./zurueckholen')
import type {Bearer} from '../storage'

const schein = {
  id: 'a',
  url: 'https://lnurl.21linz.at/w?k1=' + 'ab'.repeat(32),
  callback: 'x',
  amount: 50_000,
  verified: true,
  createdAt: 0,
  updatedAt: 0
} as Bearer

const ctx = {
  addBearer: vi.fn(),
  updateBearer: vi.fn(),
  removeBearer: vi.fn(),
  logActivity: vi.fn()
}

describe('Zurückholen als Auftrag', () => {
  it('ohne Netz: kein Fehler, der Auftrag bleibt liegen und übersteht ein Neuladen', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'))
    const e = await zurueckholenAuftrag(schein, ctx as never)
    expect(e).toBe('gemerkt')
    expect(zurueckzuholen()).toEqual(['a'])
    expect(JSON.parse(speicher.get('fork_zurueckholen')!)).toEqual(['a'])
    expect(ctx.removeBearer).not.toHaveBeenCalled()
    expect(ctx.updateBearer).not.toHaveBeenCalled()
    vergissZurueckholen('a')
    expect(zurueckzuholen()).toEqual([])
  })
})
