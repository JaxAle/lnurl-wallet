import {beforeEach, describe, expect, it, vi} from 'vitest'

const speicher = new Map<string, string>()
;(globalThis as {localStorage?: unknown}).localStorage = {
  getItem: (k: string) => speicher.get(k) ?? null,
  setItem: (k: string, v: string) => void speicher.set(k, v),
  removeItem: (k: string) => void speicher.delete(k)
}

class NoteSpentError extends Error {}
class NoteUnknownError extends Error {}
let antwort: () => Promise<unknown> = async () => {
  throw new NoteUnknownError()
}
vi.mock('../cashSecrets', () => ({
  cashAddressSecretAtIndex: () => new Uint8Array([1])
}))
vi.mock('../lnurlcash', () => ({
  buildNoteUrl: (w: string, k1: string) => `${w}?k1=${k1}`,
  encodeCk1: () => 'ck1neu',
  fetchNoteInfo: () => antwort(),
  k1SpendsNote: (k1: string | null) => k1 === 'ck1neu',
  noteK1: (u: string) => new URL(u).searchParams.get('k1'),
  NoteSpentError,
  NoteUnknownError,
  serverOf: (u: string) => new URL(u).host,
  signNoteOwnership: () => ({
    pubkeyXOnly: new Uint8Array([2]),
    signature: new Uint8Array([3])
  })
}))

const {holeRechnungAb, merkeRechnung, offeneRechnungen, vergissRechnung} =
  await import('./rechnungen')

const r = {
  pr: 'lnbc1',
  host: 'lnurl.21linz.at',
  index: 4,
  withdrawLink: 'https://lnurl.21linz.at/w',
  netMsat: 100_000,
  seit: 0
}

describe('Offene Rechnungen selbst abholen', () => {
  beforeEach(() => {
    for (const x of offeneRechnungen()) vergissRechnung(x.pr)
    merkeRechnung(r)
  })

  it('noch nicht bezahlt: bleibt offen, legt nichts ab', async () => {
    const addBearer = vi.fn()
    antwort = async () => {
      throw new NoteUnknownError()
    }
    const e = await holeRechnungAb(
      r,
      () => [],
      {addBearer, logActivity: vi.fn()} as never,
      1000
    )
    expect(e).toBe('offen')
    expect(addBearer).not.toHaveBeenCalled()
    expect(offeneRechnungen()).toHaveLength(1)
  })

  it('bezahlt: legt den Schein ab und vergisst die Rechnung', async () => {
    const addBearer = vi.fn()
    antwort = async () => ({maxWithdrawable: 99_000, callback: 'cb'})
    const e = await holeRechnungAb(
      r,
      () => [],
      {addBearer, logActivity: vi.fn()} as never,
      1000
    )
    expect(e).toBe('abgeholt')
    expect(addBearer).toHaveBeenCalledWith(
      expect.objectContaining({amount: 99_000, verified: true})
    )
    expect(offeneRechnungen()).toEqual([])
  })

  it('schon in der Wallet: nicht zweimal ablegen', async () => {
    const addBearer = vi.fn()
    const gehalten = [{url: 'https://lnurl.21linz.at/w?k1=ck1neu'}] as never
    const e = await holeRechnungAb(
      r,
      () => gehalten,
      {addBearer, logActivity: vi.fn()} as never,
      1000
    )
    expect(e).toBe('vergessen')
    expect(addBearer).not.toHaveBeenCalled()
  })

  it('nach einem Tag unbezahlt: still vergessen', async () => {
    antwort = async () => {
      throw new NoteUnknownError()
    }
    const e = await holeRechnungAb(
      r,
      () => [],
      {addBearer: vi.fn(), logActivity: vi.fn()} as never,
      2 * 24 * 3600_000
    )
    expect(e).toBe('vergessen')
    expect(offeneRechnungen()).toEqual([])
  })
})
