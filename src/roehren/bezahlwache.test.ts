// Bezahl-Wache (Gerhard am Pixel, 2026-10-29): angestoßene Zahlungen nur lesend zu Ende führen
import {beforeEach, describe, expect, it, vi} from 'vitest'

const probe = vi.fn()
const verify = vi.fn()
// probe liefert wie früher 'live' | 'gone' | 'unknown' | 'schwebt' — hier in die Antwort der Stelle übersetzt
vi.mock('../lnurlcash', async orig => {
  const echt = await orig<typeof import('../lnurlcash')>()
  return {
    ...echt,
    fetchInvoiceVerification: (u: string) => verify(u),
    fetchNoteInfo: async (u: string) => {
      const a = await probe(u)
      if (a === 'live') return {}
      if (a === 'gone') throw new echt.NoteSpentError('spent')
      if (a === 'schwebt') throw new echt.PendingNoteError()
      if (a === 'wert0') throw new echt.NoteWorthZeroError()
      throw new Error('keine Antwort')
    }
  }
})

import type {Bearer} from '../storage'
import {FRIST_MS, istZahlung, pruefeZahlung, quittiere} from './bezahlwache'
import {erfahrung} from './auszahlung'

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
    expect(erfahrung('mint.example')?.ok).toBe(true)
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
    expect(erfahrung('mint.example')?.ok).toBe(false)
  })

  it('Stelle meldet pending → offen, als schwebend vermerkt, nie zurückgebucht', async () => {
    probe.mockResolvedValue('schwebt')
    const b = schein()
    const c = ctx()
    expect(await pruefeZahlung(b, c, 1_000_000 + FRIST_MS * 9)).toBe('offen')
    expect(c.updateBearer).toHaveBeenCalledWith(b.id, {
      zahlung: {...b.zahlung, schwebt: true}
    })
    expect(c.logActivity).not.toHaveBeenCalled()
  })

  // Conformance v0.17: Wert 0 = verbrannt ODER mitten im Einschmelzen (2026-11-18)
  it('Wert 0 mit Nachweis, Nachweis noch nicht bezahlt → offen, schwebend, nie bezahlt', async () => {
    probe.mockResolvedValue('wert0')
    verify.mockResolvedValue({settled: false})
    const b = schein({verify: 'https://mint.example/v/geheim'})
    const c = ctx()
    expect(await pruefeZahlung(b, c, 1_000_000 + FRIST_MS * 9)).toBe('offen')
    expect(c.updateBearer).toHaveBeenCalledWith(b.id, {
      zahlung: {...b.zahlung, schwebt: true}
    })
    expect(c.removeBearer).not.toHaveBeenCalled()
    expect(c.logActivity).not.toHaveBeenCalled()
  })

  it('Wert 0 mit Nachweis „bezahlt“ → bezahlt', async () => {
    probe.mockResolvedValue('wert0')
    verify.mockResolvedValue({settled: true, pr: 'lnbc1x'})
    const b = schein({verify: 'https://mint.example/v/geheim'})
    expect(await pruefeZahlung(b, ctx())).toBe('bezahlt')
  })

  it('Wert 0 ohne Nachweis (alte Stelle) → bezahlt wie bisher', async () => {
    probe.mockResolvedValue('wert0')
    expect(await pruefeZahlung(schein(), ctx())).toBe('bezahlt')
  })

  it('Nachweis „Not found“ und Schein wieder gültig → sofort gescheitert, ohne Frist', async () => {
    const echt =
      await vi.importActual<typeof import('../lnurlcash')>('../lnurlcash')
    verify.mockRejectedValue(new echt.ServiceError('Not found'))
    probe.mockResolvedValue('live')
    const b = schein({verify: 'https://mint.example/v/geheim'})
    const c = ctx()
    expect(await pruefeZahlung(b, c, 1_000_001)).toBe('gescheitert')
    expect(c.logActivity).toHaveBeenCalledTimes(1)
  })

  it('Nachweis „Not found“, Schein noch Wert 0 → offen (nicht gescheitert)', async () => {
    const echt =
      await vi.importActual<typeof import('../lnurlcash')>('../lnurlcash')
    verify.mockRejectedValue(new echt.ServiceError('Not found'))
    probe.mockResolvedValue('wert0')
    const b = schein({verify: 'https://mint.example/v/geheim'})
    expect(await pruefeZahlung(b, ctx(), 1_000_001)).toBe('offen')
  })

  it('Nachweis nicht erreichbar, Schein gültig → innerhalb der Frist offen', async () => {
    verify.mockRejectedValue(new Error('network down'))
    probe.mockResolvedValue('live')
    const b = schein({verify: 'https://mint.example/v/geheim'})
    expect(await pruefeZahlung(b, ctx(), 1_000_001)).toBe('offen')
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

describe('Umziehen', () => {
  it('gescheitert: Text ohne „umgezogen“', async () => {
    probe.mockResolvedValue('live')
    const b = schein({text: '637 Sats umgezogen nach neu.example'})
    const c = ctx()
    await pruefeZahlung(b, c, 1_000_000 + FRIST_MS + 1)
    expect(c.logActivity).toHaveBeenCalledWith(
      'unspent',
      'Nicht durchgegangen: 637 Sats nach neu.example — der Schein (mint.example) ist wieder in der Wallet.',
      undefined
    )
  })

  it('Fenster hat entschieden: quittiert, Erfahrung gemerkt, Wache trägt nichts mehr ein', async () => {
    probe.mockResolvedValue('gone')
    const b = schein()
    const c = ctx()
    await quittiere(b, b.zahlung!.seit, false, c.updateBearer)
    expect(c.updateBearer).toHaveBeenCalledWith(b.id, {
      spentGrund: undefined,
      zahlung: undefined
    })
    expect(erfahrung('mint.example')?.ok).toBe(false)
    await pruefeZahlung(b, c, 1_000_100)
    expect(c.logActivity).not.toHaveBeenCalled()
  })
})

describe('derselbe Schein, zweiter Versuch', () => {
  it('nach einem gescheiterten Versuch wird der nächste wieder entschieden', async () => {
    probe.mockResolvedValue('live')
    const b = schein()
    const c = ctx()
    expect(await pruefeZahlung(b, c, 1_000_000 + FRIST_MS + 1)).toBe(
      'gescheitert'
    )
    // zurückgeholt, gleicher Schein (gleiche id), neuer Versuch
    const zweiter = {...b, zahlung: {...b.zahlung!, seit: 2_000_000}}
    expect(await pruefeZahlung(zweiter, c, 2_000_000 + FRIST_MS + 1)).toBe(
      'gescheitert'
    )
    expect(c.logActivity).toHaveBeenCalledTimes(2)
  })

  it('nach Quittung durch das Fenster wird der nächste Versuch wieder entschieden', async () => {
    probe.mockResolvedValue('live')
    const b = schein()
    const c = ctx()
    await quittiere(b, b.zahlung!.seit, false, c.updateBearer)
    const zweiter = {...b, zahlung: {...b.zahlung!, seit: 3_000_000}}
    expect(await pruefeZahlung(zweiter, c, 3_000_000 + FRIST_MS + 1)).toBe(
      'gescheitert'
    )
  })
})

describe('istZahlung', () => {
  it('nur gesperrte Scheine mit Zahlung', () => {
    expect(istZahlung(schein())).toBe(true)
    expect(istZahlung({...schein(), spentGrund: 'markiert'})).toBe(false)
    expect(istZahlung({...schein(), spent: false})).toBe(false)
  })
})
