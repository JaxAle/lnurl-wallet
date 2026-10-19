import {expect, it, vi} from 'vitest'

// price.lnurlcash.com gesperrt (Firmen-WLAN), mempool.space antwortet → Kurs kommt trotzdem
;(globalThis as {localStorage?: unknown}).localStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined
}
globalThis.fetch = vi.fn(async (url: string) => {
  if (String(url).includes('price.lnurlcash.com'))
    throw new TypeError('Failed to fetch')
  return new Response(JSON.stringify({USD: 81936, EUR: 73087, GBP: 61609}))
}) as typeof fetch

it('holt den Kurs von der zweiten Quelle, wenn die erste nicht antwortet', async () => {
  const {rates, ratesError} = await import('../currency')
  await vi.waitFor(() => expect(rates()?.eur).toBe(73087))
  expect(ratesError()).toBeNull()
})
