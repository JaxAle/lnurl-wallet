// Bezahl-Wache (Gerhard am Pixel, 2026-10-29): angestoßene Zahlungen nur lesend zu Ende führen
import {beforeEach, describe, expect, it, vi} from 'vitest'

const probe = vi.fn()
const verify = vi.fn()
vi.mock('../lib/request', async orig => ({
  ...(await orig<typeof import('../lib/request')>()),
  probeBurnedNote: (u: string) => probe(u)
}))
vi.mock('../lnurlcash', async orig => ({
  ...(await orig<typeof import('../lnurlcash')>()),
  fetchInvoiceVerification: (u: string) => verify(u)
}))

import type {Bearer} from '../storage'
import {FRIST_MS, istZahlung, pruefeZahlung} from './bezahlwache'

let n = 0
const schein = (z: Partial<NonNullable<Bearer['zahlung']>> = {}): Bearer => ({
  id: `s${++n}`,
  url: 'https://mint.example/lnurlw/x?k1=abc',
  callback: '',
  amount: 60_000,
  verified: true,
  spent: true,
  spentGrund: 'zahlung',
  zahlung: {
    seit: 1_000_000,
    text: '60 Sats bezahlt an a@b.c',
    pr: 'lnbc1x',
    ...z
  },
  createdAt: 0,
  updatedAt: 0
})
const ctx = () => ({
  updateBearer: vi.fn(async () => {}),
  removeBearer: vi.fn(),
  logActivity: vi.fn()
})

beforeEach(() => {
  probe.mockReset()
  verify.mockReset()
})

describe('pruefeZahlung', () => {
  it('Stelle kennt den Schein nicht mehr → bezahlt, Verlauf, Schein weg', async () => {
    probe.mockResolvedValue('gone')
    const b = schein()
    const c = ctx()
    expect(await pruefeZahlung(b, c, 1_000_100)).toBe('bezahlt')
    expect(c.logActivity).toHaveBeenCalledWith(
      'melt',
      '60 Sats bezahlt an a@b.c — von mint.example bestätigt.',
      undefined
    )
    expect(c.removeBearer).toHaveBeenCalledWith(b.id)
  })

  it('Nachweis der Stelle meldet bezahlt (gleiche Rechnung) → bezahlt ohne Schein-Abfrage', async () => {
    verify.mockResolvedValue({settled: true, pr: 'LNBC1X', preimage: null})
    const c = ctx()
    expect(
      await pruefeZahlung(schein({verify: 'https://v'}), c, 1_000_100)
    ).toBe('bezahlt')
    expect(probe).not.toHaveBeenCalled()
  })

  it('Nachweis für eine andere Rechnung zählt nicht', async () => {
    verify.mockResolvedValue({settled: true, pr: 'lnbc1anders', preimage: null})
    probe.mockResolvedValue('live')
    expect(
      await pruefeZahlung(schein({verify: 'https://v'}), ctx(), 1_000_100)
    ).toBe('offen')
  })

  it('noch gültig innerhalb der Frist → offen, nichts verändert', async () => {
    probe.mockResolvedValue('live')
    const c = ctx()
    expect(await pruefeZahlung(schein(), c, 1_000_000 + FRIST_MS - 1)).toBe(
      'offen'
    )
    expect(c.updateBearer).not.toHaveBeenCalled()
    expect(c.logActivity).not.toHaveBeenCalled()
  })

  it('nach der Frist noch gültig → gescheitert, Schein zurück, Verlauf', async () => {
    probe.mockResolvedValue('live')
    const b = schein()
    const c = ctx()
    expect(await pruefeZahlung(b, c, 1_000_000 + FRIST_MS + 1)).toBe(
      'gescheitert'
    )
    expect(c.updateBearer).toHaveBeenCalledWith(b.id, {
      spent: false,
      spentGrund: undefined,
      zahlung: undefined
    })
    expect(c.logActivity).toHaveBeenCalledWith(
      'unspent',
      'Nicht durchgegangen: 60 Sats an a@b.c — der Schein (mint.example) ist wieder in der Wallet.',
      undefined
    )
  })

  it('keine Antwort → offen, auch nach der Frist', async () => {
    probe.mockResolvedValue('unknown')
    expect(await pruefeZahlung(schein(), ctx(), 1_000_000 + FRIST_MS * 9)).toBe(
      'offen'
    )
  })

  it('Seite und Wache zugleich: nur ein Verlaufseintrag', async () => {
    probe.mockResolvedValue('gone')
    const b = schein()
    const c = ctx()
    await Promise.all([
      pruefeZahlung(b, c, 1_000_100),
      pruefeZahlung(b, c, 1_000_100)
    ])
    expect(c.logActivity).toHaveBeenCalledTimes(1)
  })
})

describe('istZahlung', () => {
  it('nur gesperrte Scheine mit Zahlung', () => {
    expect(istZahlung(schein())).toBe(true)
    expect(istZahlung({...schein(), spentGrund: 'markiert'})).toBe(false)
    expect(istZahlung({...schein(), spent: false})).toBe(false)
  })
})
