/**
 * A minimal PDF writer: one page per canvas, each canvas embedded as a
 * Flate-compressed RGB image.
 *
 * Why hand-rolled rather than a library: the only thing needed here is
 * "put these images on these pages", which is about 100 lines of PDF syntax.
 * A PDF library would be several hundred kilobytes for that, in a bundle that
 * deliberately has no chart dependency either.
 *
 * Compression uses the browser's own CompressionStream('deflate'), which emits
 * the zlib wrapper that PDF's /FlateDecode expects. Without it the pages would
 * be roughly 17 MB each, so an unsupported browser is reported rather than
 * silently producing an unusable file.
 */

const enc = new TextEncoder()

/** PDF structural syntax is Latin-1; the text we write here is ASCII. */
function ascii(s: string): Uint8Array {
  return enc.encode(s)
}

/** Escape a string for a PDF literal string object. */
function pdfString(s: string): string {
  return `(${s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error(
      'This browser cannot compress the PDF (CompressionStream is unavailable). ' +
        'Use the PNG export instead, or try a current version of Chrome, Edge, Safari or Firefox.',
    )
  }
  const cs = new CompressionStream('deflate')
  const writer = cs.writable.getWriter()
  void writer.write(bytes)
  void writer.close()
  const buf = await new Response(cs.readable).arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * Canvas pixels are RGBA and may carry alpha. PDF images here are DeviceRGB, so
 * composite onto white and drop the alpha channel.
 */
function rgbBytes(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read the canvas for the PDF.')
  const { width, height } = canvas
  const src = ctx.getImageData(0, 0, width, height).data
  const out = new Uint8Array(width * height * 3)
  for (let i = 0, j = 0; i < src.length; i += 4, j += 3) {
    const a = (src[i + 3] ?? 255) / 255
    out[j] = Math.round((src[i] ?? 0) * a + 255 * (1 - a))
    out[j + 1] = Math.round((src[i + 1] ?? 0) * a + 255 * (1 - a))
    out[j + 2] = Math.round((src[i + 2] ?? 0) * a + 255 * (1 - a))
  }
  return out
}

export interface PdfMeta {
  title: string
  author: string
}

/** CSS pixels to PostScript points, at the usual 96 dpi assumption. */
const PX_TO_PT = 72 / 96
/** Canvases are rendered at 2x; the page should be the logical size. */
const CANVAS_SCALE = 2

export async function buildPdf(
  canvases: HTMLCanvasElement[],
  meta: PdfMeta,
): Promise<Blob> {
  if (canvases.length === 0) throw new Error('Nothing to export.')

  const chunks: Uint8Array[] = []
  let length = 0
  const offsets: number[] = [] // offsets[objNum] = byte offset

  const push = (bytes: Uint8Array) => {
    chunks.push(bytes)
    length += bytes.length
  }
  const obj = (num: number, body: string, stream?: Uint8Array) => {
    offsets[num] = length
    push(ascii(`${num} 0 obj\n${body}\n`))
    if (stream) {
      push(ascii('stream\n'))
      push(stream)
      push(ascii('\nendstream\n'))
    }
    push(ascii('endobj\n'))
  }

  push(ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'))

  // Object numbering: 1 catalog, 2 pages, 3 info, then 3 objects per page.
  const firstPageObj = 4
  const pageObjNum = (i: number) => firstPageObj + i * 3
  const contentObjNum = (i: number) => firstPageObj + i * 3 + 1
  const imageObjNum = (i: number) => firstPageObj + i * 3 + 2
  const kids = canvases.map((_, i) => `${pageObjNum(i)} 0 R`).join(' ')

  obj(1, `<< /Type /Catalog /Pages 2 0 R >>`)
  obj(2, `<< /Type /Pages /Count ${canvases.length} /Kids [${kids}] >>`)
  obj(
    3,
    `<< /Title ${pdfString(meta.title)} /Author ${pdfString(meta.author)} ` +
      `/Producer ${pdfString('LAPaL HIV dashboard')} /CreationDate ${pdfString(pdfDate(new Date()))} >>`,
  )

  for (let i = 0; i < canvases.length; i++) {
    const canvas = canvases[i]
    if (!canvas) continue
    const wPt = (canvas.width / CANVAS_SCALE) * PX_TO_PT
    const hPt = (canvas.height / CANVAS_SCALE) * PX_TO_PT
    const data = await deflate(rgbBytes(canvas))

    obj(
      pageObjNum(i),
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt.toFixed(2)} ${hPt.toFixed(2)}] ` +
        `/Resources << /XObject << /Im0 ${imageObjNum(i)} 0 R >> >> ` +
        `/Contents ${contentObjNum(i)} 0 R >>`,
    )

    // Draw the image to fill the page: scale, then place at the origin.
    const content = ascii(`q\n${wPt.toFixed(2)} 0 0 ${hPt.toFixed(2)} 0 0 cm\n/Im0 Do\nQ`)
    obj(contentObjNum(i), `<< /Length ${content.length} >>`, content)

    obj(
      imageObjNum(i),
      `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length} >>`,
      data,
    )
  }

  const maxObj = firstPageObj + canvases.length * 3 - 1
  const xrefStart = length
  let xref = `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`
  for (let n = 1; n <= maxObj; n++) {
    xref += `${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`
  }
  xref += `trailer\n<< /Size ${maxObj + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  push(ascii(xref))

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}

function pdfDate(d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `D:${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`
}
