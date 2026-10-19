import {describe, expect, it} from 'vitest'

const speicher = new Map<string, string>()
;(globalThis as {localStorage?: unknown}).localStorage = {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k)
}
const t = await import('./woerterTresor')

const W =
  'admit aware rally income whale affair indicate potato stove audit weekend tip'

describe('Zwölf Wörter hinter dem Code', () => {
  it('legt verschlüsselt ab, öffnet nur mit dem Code, schlüsselt um', async () => {
    await t.speichereWoerter(W, 'LINZ2026')
    expect(speicher.get('fork_woerter')).not.toContain('admit')
    expect(await t.leseWoerter('LINZ2026')).toBe(W)
    await expect(t.leseWoerter('FALSCH12')).rejects.toBeTruthy()
    await t.woerterUmschluesseln('LINZ2026', 'NEUER-CODE')
    expect(await t.leseWoerter('NEUER-CODE')).toBe(W)
    t.vergissWoerter()
    expect(t.hatWoerter()).toBe(false)
  })
  it('wählt vier verschiedene Stellen', () => {
    const s = t.vierStellen()
    expect(new Set(s).size).toBe(4)
    expect(s.every(x => x >= 0 && x < 12)).toBe(true)
  })
})
