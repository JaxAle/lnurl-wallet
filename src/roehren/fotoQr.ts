// QR aus einem Foto lesen — der sichere Ausweg, wenn das Kamerabild im Browser schwarz bleibt (iPhone,
// Gerhard 2026-10-17): „Foto machen“ öffnet die Kamera des Geräts selbst, die Wallet liest den QR aus
// dem Bild. Große Fotos werden verkleinert, sonst ist jsQR langsam; ein zweiter Versuch in voller Größe,
// falls der Code klein im Bild ist.
import jsQR from 'jsqr'

const lies = (bild: ImageBitmap, max: number): string | null => {
  const f = Math.min(1, max / Math.max(bild.width, bild.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bild.width * f)
  c.height = Math.round(bild.height * f)
  const g = c.getContext('2d', {willReadFrequently: true})
  if (!g) return null
  g.drawImage(bild, 0, 0, c.width, c.height)
  const d = g.getImageData(0, 0, c.width, c.height)
  return jsQR(d.data, d.width, d.height)?.data ?? null
}

export const qrAusFoto = async (datei: File): Promise<string | null> => {
  const bild = await createImageBitmap(datei)
  try {
    return lies(bild, 1200) ?? lies(bild, 2400)
  } finally {
    bild.close()
  }
}
