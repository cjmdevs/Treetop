'use strict'
/**
 * create-icon.cjs — Generate client/electron/icon.ico
 *
 * Run once (or whenever you want to regenerate the icon):
 *   node scripts/create-icon.cjs
 *
 * Output: client/electron/icon.ico
 *   Multi-size PNG-embedded ICO: 16×16, 32×32, 48×48, 256×256
 *   Colors: Treetop forest green #1F7A4D background, white "T" letterform
 *
 * No external dependencies — uses only Node.js built-ins (zlib, fs, path).
 * PNG-embedded ICO is supported on Windows Vista and later, and by all
 * versions of electron-builder.
 */

const fs   = require('fs')
const path = require('path')
const zlib = require('zlib')

// ── CRC-32 (required for PNG chunk integrity) ─────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()

function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length)
  const t   = Buffer.from(type, 'ascii')
  const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

// ── PNG generator ─────────────────────────────────────────────────────────────
// Produces a valid RGBA PNG with Treetop branding at the requested size.
function makePNG(size) {
  // RGBA pixel buffer — fill with forest green #1F7A4D
  const px = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    px[i*4]   = 0x1F  // R
    px[i*4+1] = 0x7A  // G
    px[i*4+2] = 0x4D  // B
    px[i*4+3] = 0xFF  // A (fully opaque)
  }

  // Draw white "T" letterform
  const pad  = Math.max(1, Math.round(size * 0.18))   // outer margin
  const sw   = Math.max(2, Math.round(size * 0.14))   // stroke width
  const midX = Math.floor(size / 2)
  const stemL = midX - Math.floor(sw / 2)
  const stemR = stemL + sw

  const setWhite = (x, y) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const i = (y * size + x) * 4
    px[i] = 0xFF; px[i+1] = 0xFF; px[i+2] = 0xFF; px[i+3] = 0xFF
  }

  // Horizontal top bar
  for (let y = pad; y < pad + sw; y++)
    for (let x = pad; x < size - pad; x++) setWhite(x, y)

  // Vertical stem (centered)
  for (let y = pad; y < size - pad; y++)
    for (let x = stemL; x < stemR; x++) setWhite(x, y)

  // Build raw filter-0 row data (required by PNG spec before compression)
  const stride = size * 4
  const raw    = Buffer.alloc(size * (1 + stride))
  for (let y = 0; y < size; y++) {
    raw[y * (1 + stride)] = 0  // filter byte: None
    px.copy(raw, y * (1 + stride) + 1, y * stride, (y + 1) * stride)
  }

  const compressed = zlib.deflateSync(raw, { level: 9 })

  // IHDR: width, height, bit depth 8, color type 6 (RGBA)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // RGBA

  const PNG_SIG = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A])
  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── ICO builder ───────────────────────────────────────────────────────────────
// Wraps multiple PNG images in a single ICO container.
// Spec: https://en.wikipedia.org/wiki/ICO_(file_format)
function makeICO(sizes) {
  const pngs    = sizes.map(s => makePNG(s))
  const dirSize = 6 + sizes.length * 16

  // Pre-calculate data offsets
  const offsets = []
  let offset = dirSize
  for (const png of pngs) { offsets.push(offset); offset += png.length }

  // ICO header
  const header = Buffer.alloc(dirSize)
  header.writeUInt16LE(0, 0)            // reserved
  header.writeUInt16LE(1, 2)            // type: ICO (not CUR)
  header.writeUInt16LE(sizes.length, 4) // image count

  // ICONDIRENTRY for each image
  for (let i = 0; i < sizes.length; i++) {
    const e = 6 + i * 16
    const s = sizes[i]
    header[e+0] = s === 256 ? 0 : s    // width  (0 encodes 256)
    header[e+1] = s === 256 ? 0 : s    // height
    header[e+2] = 0                     // color count (0 = no palette)
    header[e+3] = 0                     // reserved
    header.writeUInt16LE(1,  e+4)       // color planes
    header.writeUInt16LE(32, e+6)       // bits per pixel
    header.writeUInt32LE(pngs[i].length, e+8)  // data size
    header.writeUInt32LE(offsets[i],    e+12)  // data offset
  }

  return Buffer.concat([header, ...pngs])
}

// ── Write output ──────────────────────────────────────────────────────────────
const ico     = makeICO([16, 32, 48, 256])
const outPath = path.join(__dirname, '..', 'electron', 'icon.ico')
fs.writeFileSync(outPath, ico)
console.log(`  Icon generated: ${outPath}`)
console.log(`  Sizes: 16, 32, 48, 256  |  Format: PNG-in-ICO  |  Size: ${(ico.length / 1024).toFixed(1)} KB`)
