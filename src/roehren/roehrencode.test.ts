import {describe, expect, it} from 'vitest'

const speicher = new Map<string, string>()
;(globalThis as {localStorage?: unknown}).localStorage = {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k)
}
const {codeFehler, kandidaten, fehlversuch, geschafft, wartenBis, tippbar} =
  await import('./roehrencode')

describe('Röhren-Code', () => {
  it('nur Röhrenzeichen, mindestens 8, Groß/klein egal', () => {
    expect(codeFehler('linz2026')).toBeNull()
    expect(codeFehler('LINZ.#&-')).toBeNull()
    expect(codeFehler('kurz')).toMatch(/Mindestens 8/)
    expect(codeFehler('Linz 2026')).toMatch(/Nur Zeichen/)
    expect(codeFehler('LINZ!2026')).toMatch(/Nur Zeichen/)
    expect(kandidaten('LINZ2026')).toEqual(['LINZ2026', 'linz2026'])
    expect(kandidaten('abC-1')).toEqual(['abC-1', 'ABC-1', 'abc-1'])
    expect(tippbar('kuvqyD-nynfe9-sywbor')).toBe(true)
    expect(tippbar('a!b')).toBe(false)
  })
  it('bremst ab dem 5. Fehlversuch, doppelt je weiterem, Erfolg setzt zurück', () => {
    const t = 1_000_000
    for (let i = 0; i < 4; i++) expect(fehlversuch(t)).toBe(0)
    expect(fehlversuch(t)).toBe(t + 30_000)
    expect(fehlversuch(t)).toBe(t + 60_000)
    geschafft()
    expect(wartenBis()).toBe(0)
  })
})
