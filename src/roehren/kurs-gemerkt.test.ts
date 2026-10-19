import {expect, it, vi} from 'vitest'

// beide Quellen gesperrt, ein Kurs von 18:56 ist gemerkt → er bleibt stehen, mit Hinweis
const speicher = new Map<string, string>([
  [
    'fork_kurs',
    JSON.stringify({
      usd: 80000,
      eur: 72000,
      gbp: 60000,
      zeit: new Date(2026, 9, 19, 18, 56).getTime()
    })
  ]
])
;(globalThis as {localStorage?: unknown}).localStorage = {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k)
}
globalThis.fetch = vi.fn(async () => {
  throw new TypeError('Failed to fetch')
}) as typeof fetch

it('zeigt ohne Verbindung den gemerkten Kurs mit Uhrzeit', async () => {
  const {rates, kursHinweis} = await import('../currency')
  expect(rates()?.eur).toBe(72000)
  await vi.waitFor(() =>
    expect(kursHinweis(new Date(2026, 9, 19, 20, 0))).toBe('Kurs von 18:56')
  )
  expect(kursHinweis(new Date(2026, 9, 20, 9, 0))).toBe(
    'Kurs vom 19.10., 18:56'
  )
})
