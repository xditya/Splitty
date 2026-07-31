// PLAN.md §4.1 — canvas preprocess before ANY engine: downscale to 1024px long
// edge, grayscale, contrast stretch, JPEG q0.8, SHA-256 → imageHash.
export interface Preprocessed {
  blob: Blob
  base64: string // without data: prefix
  width: number
  height: number
  hash: string
}

export async function preprocess(file: File | Blob): Promise<Preprocessed> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  // grayscale + histogram
  const hist = new Uint32Array(256)
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
    d[i] = d[i + 1] = d[i + 2] = g
    hist[g]++
  }
  // contrast stretch: clip 1% tails, normalise to full range
  const total = w * h
  const clip = total * 0.01
  let lo = 0
  let acc = 0
  while (lo < 255 && acc < clip) acc += hist[lo++]
  let hi = 255
  acc = 0
  while (hi > 0 && acc < clip) acc += hist[hi--]
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.min(255, Math.max(0, Math.round(((d[i] - lo) * 255) / range)))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.8),
  )
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')

  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return { blob, base64: btoa(bin), width: w, height: h, hash }
}
