// Fork (2026-11-18): der Fork gegen dnis Mock-Mint aus lnurlcash-conformance (dni: „an das Conformance-Repo
// muss sich der Bot halten“). Das Paket liegt neben dem Fork, nicht in ihm (PROJEKTE/lnurlcash-wallet/conformance,
// npm install --ignore-scripts); fehlt es — etwa auf GitHub —, wird hier alles übersprungen.
import {existsSync, readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {bytesToHex, randomBytes} from '@noble/hashes/utils.js'

import {isCs1WithAmount} from './recoverableNotes'
import {verifyNoteSignature} from './signature'
import {fetchNoteInfo, meltNote, rotateNote} from './request'
import {fetchInvoiceVerification} from './mintRequest'
import {
  decodeBolt11AmountMsat,
  isBolt11Invoice,
  isPreimage,
  sameInvoice
} from './bolt11'
import {
  buildNoteUrl,
  fromBech32Lnurl,
  isAllowedServiceUrl,
  resolveLnurlInput,
  resolveMintInput,
  resolveNoteInput,
  toBech32Lnurl,
  withNewK1,
  withoutK1
} from './urls'
import {applyMintFee, grossUpForMintFee, parseMintFee} from './fees'

const MOCK = fileURLToPath(
  new URL(
    '../../../conformance/node_modules/lnurlcash-conformance/mock-mint/index.mjs',
    import.meta.url
  )
)
const da = existsSync(MOCK)

type Mint = {
  url: string
  state: {
    creditNote(k1: string, msat: number): string | undefined
    failMelt(k1: string): void
    settleMelt(k1: string): void
  }
  close(): Promise<void>
}

const starte = async (opts: object): Promise<Mint> => {
  const {createMockMint} = await import(/* @vite-ignore */ MOCK)
  return createMockMint(opts)
}

describe.skipIf(!da)('Mock-Mint (Conformance)', () => {
  const faelle: [string, object][] = [
    ['v0.17', {}],
    ['heute (65-Byte-Zertifikat)', {certificateTime: 'none'}]
  ]
  for (const [name, opts] of faelle) {
    describe(name, () => {
      let mint: Mint
      beforeAll(async () => {
        mint = await starte(opts)
      })
      afterAll(async () => mint?.close())

      it('Zertifikat der Stelle', () => {
        const k1 = bytesToHex(randomBytes(32))
        const c = mint.state.creditNote(k1, 21_000)
        console.log(
          name,
          'erkannt:',
          isCs1WithAmount(c ?? ''),
          'echt:',
          verifyNoteSignature(k1, 21_000, c ?? '', (mint.state as any).pubkey)
        )
      })

      it('Nachfrage und Erneuern', async () => {
        const k1 = bytesToHex(randomBytes(32))
        mint.state.creditNote(k1, 21_000)
        const url = `${mint.url}/w?k1=${k1}&amount=21000`
        const info = await fetchNoteInfo(url)
        console.log(name, 'info.c =', info.c ?? '(fehlt)')
        let ergebnis: unknown
        try {
          ergebnis = await rotateNote(info.callback, k1)
        } catch (e) {
          ergebnis = `${(e as Error).name}: ${(e as Error).message}`
        }
        console.log(name, 'rotate:', JSON.stringify(ergebnis))
        expect(info.maxWithdrawable).toBe(21_000)
      })
    })
  }

  describe('Bezahlen (v0.17)', () => {
    let mint: Mint
    beforeAll(async () => {
      mint = await starte({})
    })
    afterAll(async () => mint?.close())

    const rechnung = async (msat: number) => {
      const h = bytesToHex(randomBytes(32))
      const r = await fetch(`${mint.url}/p/cb?amount=${msat}&comment=${h}`)
      return ((await r.json()) as {pr: string}).pr
    }

    for (const ausgang of ['scheitert', 'geht durch'] as const) {
      it(`Zahlung ${ausgang}: was Nachweis und Nachfrage sagen`, async () => {
        const k1 = bytesToHex(randomBytes(32))
        mint.state.creditNote(k1, 21_000)
        const url = `${mint.url}/w?k1=${k1}&amount=21000`
        const info = await fetchNoteInfo(url)
        const pr = await rechnung(21_000)
        const m = await meltNote(info.callback, k1, pr)
        const lies = async () => {
          let v: unknown, n: unknown
          try {
            v = await fetchInvoiceVerification(m.verify!)
          } catch (e) {
            v = `${(e as Error).name}: ${(e as Error).message}`
          }
          try {
            n = (await fetchNoteInfo(url)).maxWithdrawable
          } catch (e) {
            n = (e as Error).name
          }
          return {v, n}
        }
        console.log(ausgang, 'unterwegs:', JSON.stringify(await lies()))
        if (ausgang === 'scheitert') mint.state.failMelt(k1)
        else mint.state.settleMelt(k1)
        console.log(ausgang, 'danach:', JSON.stringify(await lies()))
        expect(m.verify).toBeTruthy()
      })
    }
  })
})

// Vektoren: jede Art zählt bestanden/gesamt und nennt die ersten Abweichungen (Bestandsaufnahme, kein Urteil)
const VEKT = fileURLToPath(
  new URL(
    '../../../conformance/node_modules/lnurlcash-conformance/vectors/',
    import.meta.url
  )
)
const lade = (f: string) => JSON.parse(readFileSync(VEKT + f + '.json', 'utf8'))
const gleich = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b)
const sicher = (f: () => unknown) => {
  try {
    return f()
  } catch (e) {
    return `Fehler: ${(e as Error).message}`
  }
}

describe.skipIf(!da)('Conformance-Vektoren', () => {
  const art = (
    name: string,
    faelle: any[],
    pruefe: (c: any) => [unknown, unknown]
  ) =>
    it(name, () => {
      const ab = faelle
        .map(c => ({c, r: pruefe(c)}))
        .filter(({r}) => !gleich(r[0], r[1]))
      console.log(
        `VEKTOR ${name}: ${faelle.length - ab.length}/${faelle.length}`
      )
      for (const {c, r} of ab.slice(0, 4))
        console.log(
          `  ✗ ${name}: ${JSON.stringify(r[0])} ≠ ${JSON.stringify(r[1])} · ${c.why ?? JSON.stringify(c).slice(0, 140)}`
        )
    })
  const b = da ? lade('bolt11') : {}
  art('bolt11.decodeAmountMsat', b.decodeAmountMsat ?? [], c => [
    sicher(() => decodeBolt11AmountMsat(c.pr)),
    c.expect
  ])
  art('bolt11.isInvoice', b.isInvoice ?? [], c => [
    sicher(() => isBolt11Invoice(c.pr)),
    c.expect
  ])
  art('bolt11.sameInvoice', b.sameInvoice ?? [], c => [
    sicher(() => sameInvoice(c.a, c.b)),
    c.expect
  ])
  art('bolt11.isPreimage', b.isPreimage ?? [], c => [
    sicher(() => isPreimage(c.value)),
    c.expect
  ])
  const e = da ? lade('bech32') : {}
  art('bech32.encode', e.encode ?? [], c => [
    sicher(() => toBech32Lnurl(c.url).toUpperCase()),
    c.lnurl.toUpperCase()
  ])
  art('bech32.decodeInvalid', e.decodeInvalid ?? [], c => [
    sicher(() => fromBech32Lnurl(c.input)),
    null
  ])
  const u = da ? lade('url-admission') : {}
  art('url.allowed', u.allowed ?? [], c => [
    sicher(() => isAllowedServiceUrl(c)),
    true
  ])
  art('url.rejected', u.rejected ?? [], c => [
    sicher(() => isAllowedServiceUrl(c.url)),
    false
  ])
  const i = da ? lade('input-resolution') : {}
  art('input.lnurl', i.lnurl ?? [], c => [
    sicher(() => resolveLnurlInput(c.input) ?? null),
    c.expect ?? null
  ])
  art('input.mint', i.mint ?? [], c => [
    sicher(() => resolveMintInput(c.input) ?? null),
    c.expect ?? null
  ])
  art('input.note', i.note ?? [], c => [
    sicher(() => resolveNoteInput(c.input) ?? null),
    c.expect ?? null
  ])
  const n = da ? lade('note-url') : {}
  art('noteUrl.build', n.build ?? [], c => [
    sicher(() => buildNoteUrl(c.withdrawLink, c.k1, c.amountMsat ?? undefined)),
    c.expect
  ])
  art('noteUrl.withNewK1', n.withNewK1 ?? [], c => [
    sicher(() =>
      withNewK1(c.url, c.k1, c.amountMsat, c.signature ?? undefined)
    ),
    c.expect
  ])
  art('noteUrl.withoutK1', n.withoutK1 ?? [], c => [
    sicher(() => withoutK1(c.url, c.amountMsat, c.signature ?? undefined)),
    c.expect
  ])
  const f = da ? lade('fees') : {}
  art('fees.parse', f.parse ?? [], c => {
    const r: any = sicher(() => parseMintFee(c.metadata))
    const x = c.expect
    return [
      r && typeof r === 'object'
        ? {
            baseFeeMsat: r.baseFeeMsat,
            feePpm: r.feePpm,
            ...(x && 'addressFeeMsat' in x
              ? {addressFeeMsat: r.addressFeeMsat ?? null}
              : {})
          }
        : r,
      x
    ]
  })
  art('fees.apply', f.apply ?? [], c => [
    sicher(() => applyMintFee(c.grossMsat, c.fee)),
    c.expect
  ])
  art('fees.grossUp', f.grossUp ?? [], c => [
    sicher(() => grossUpForMintFee(c.netMsat, c.fee)),
    c.expect
  ])
})
