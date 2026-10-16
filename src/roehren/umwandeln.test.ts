import {describe, expect, it, vi} from 'vitest'

const aufrufe: string[] = []
vi.mock('../cashSecrets', () => ({
  readCashAddressSecretIndices: () => ({'lnurl.21linz.at': 7})
}))
vi.mock('../lnurlcash', () => ({
  serverOf: (u: string) => new URL(u).host,
  rotateNote: async () => (aufrufe.push('erneuern'), {k1: 'x'}),
  upgradeNote: async () => (aufrufe.push('umwandeln'), {k1: 'y'})
}))
vi.mock('../lib/request', () => ({
  isUpgradedSecret: (k1: string) => k1.startsWith('ck1')
}))

const {erneuereEmpfangen} = await import('./umwandeln')

describe('Empfangene Scheine umwandeln', () => {
  it('wandelt alte Hash-Scheine nur bei einer Stelle mit pub/sig um', async () => {
    await erneuereEmpfangen('https://lnurl.21linz.at/cb', 'ab'.repeat(32))
    await erneuereEmpfangen('https://lnurl.21linz.at/cb', 'ck1abc')
    await erneuereEmpfangen('https://andere.stelle.at/cb', 'ab'.repeat(32))
    expect(aufrufe).toEqual(['umwandeln', 'erneuern', 'erneuern'])
  })
})
