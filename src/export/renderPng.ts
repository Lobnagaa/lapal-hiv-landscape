/**
 * Rendering the current view to images.
 *
 * Three outputs, because one shape does not suit every use:
 *
 *   figure  one tall PNG containing every row. Good for a report or a poster,
 *           poor on a slide, because 40-odd rows squeezed into 16:9 are
 *           unreadable when projected.
 *   slides  a series of 16:9 PNGs, roughly a dozen rows each, numbered
 *           "1 of 4". Each is a complete figure with its own header, legend and
 *           acknowledgements, so it stands alone on a PowerPoint slide.
 *   pdf     the same slides as pages of one document.
 *
 * A purpose-built canvas renderer, not a DOM screenshot: no dependency, every
 * row included rather than whatever is scrolled into view, and 2x output for
 * projection and print. The geometry comes from encoding.ts, the same module
 * the on-screen timeline uses, so the two cannot drift apart.
 */
import type { Entry, Meta } from '../types'
import { indicationBadge } from '../types'
import { BAR_H, BAR_OPACITY, DOT_R, axisGeometry, rowMarks } from '../encoding'
import { loadImage } from '../assets'
import { buildPdf } from './pdf'
import { buildZip } from './zip'

/* --------------------------------------------------------------- editable */

/**
 * Fallback only. The live wording comes from meta.disclaimer, so the page and
 * the exports cannot say different things; this is used when a data file has
 * no disclaimer field.
 */
export const DISCLAIMER =
  'LAPaL reflects a curated snapshot at a point in time. Efforts are put to refresh content ' +
  'on a rolling basis as new public information appears.'

/* ---------------------------------------------------------------- layout */

const SCALE = 2
const ROW_H = 44
const FONT = '"Manrope Variable", Manrope, ui-sans-serif, system-ui, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export type Layout = 'figure' | 'slide'

/** Page metrics per layout. Slides are 16:9 so they fill a PowerPoint slide. */
const SHEET = {
  figure: { W: 1400, H: 0, pad: 48 }, // H computed from the row count
  slide: { W: 1600, H: 900, pad: 44 },
} as const

/**
 * Heights of everything that is not a data row.
 *
 * Shared by the renderer and by rowsPerSlide(), which is the point: when these
 * were estimated separately, the two disagreed by about one row and every slide
 * carried a band of dead space above the legend.
 */
const CHROME = {
  logo: 52,
  logoGap: 18,
  title: 32,
  subtitle: 44,
  // Tick labels sit at +16 and the column captions at +27, so the rule beneath
  // the header needs to clear both. Too small here and the caption overprints
  // the first data row.
  axis: 36,
  legend: 40,
  routeKey: 22,
  footerText: 68,
  ack: 76,
}

/** y of the first data row, given the page padding and whether a logo is drawn. */
function bodyTop(pad: number, hasLogo: boolean): number {
  return (
    pad +
    (hasLogo ? CHROME.logo + CHROME.logoGap : 0) +
    CHROME.title +
    CHROME.subtitle +
    CHROME.axis
  )
}

function footerHeight(hasAck: boolean): number {
  return CHROME.routeKey + CHROME.footerText + (hasAck ? CHROME.ack : 0)
}

interface Cols {
  name: number
  plot: number
  route: number
  phase: number
  dev: number
  gap: number
}

function columns(W: number, pad: number): Cols {
  const gap = 16
  const usable = W - pad * 2
  // Proportional, so the slide layout is wider without redesigning anything.
  const route = 118
  const phase = 100
  const dev = Math.round(usable * 0.13)
  const name = Math.round(usable * 0.25)
  const plot = usable - name - route - phase - dev - gap * 4
  return { name, plot, route, phase, dev, gap }
}

export interface ExportOptions {
  entries: Entry[]
  meta: Meta
  indicationLabel: string
  accent: string
  arranged: boolean
  hiddenCount: number
}

interface Assets {
  logo: HTMLImageElement | null
  ack: { heading: string; images: { img: HTMLImageElement; alt: string }[] }[]
}

async function loadAssets(meta: Meta): Promise<Assets> {
  const logo = meta.brand_logo ? await loadImage(meta.brand_logo) : null
  const ack: Assets['ack'] = []
  for (const group of meta.acknowledgements ?? []) {
    const images: { img: HTMLImageElement; alt: string }[] = []
    for (const l of group.logos) {
      const img = await loadImage(`logos/${l.file}`)
      if (img) images.push({ img, alt: l.alt })
    }
    if (images.length) ack.push({ heading: group.heading, images })
  }
  return { logo, ack }
}

/** Wrap text to a width, truncating with an ellipsis past `maxLines`. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  let overflow = false
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i]
    if (ctx.measureText(test ?? '').width <= maxW || !line) {
      line = test ?? ''
    } else {
      lines.push(line)
      line = words[i] ?? ''
      if (lines.length === maxLines) {
        overflow = true
        break
      }
    }
  }
  if (!overflow && lines.length < maxLines && line) lines.push(line)
  if (overflow && lines.length) {
    let last = lines[lines.length - 1] ?? ''
    while (last && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1)
    lines[lines.length - 1] = `${last}…`
  }
  return lines
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

/* ------------------------------------------------------------ one sheet */

interface SheetOpts extends ExportOptions {
  layout: Layout
  assets: Assets
  /** Rows for this sheet only. */
  rows: Entry[]
  page?: { index: number; total: number }
}

function drawSheet(o: SheetOpts): HTMLCanvasElement {
  const { meta, rows, layout, assets, accent } = o
  const p = meta.palette
  // Annotated as number: SHEET is `as const`, so these would otherwise infer as
  // literal unions and poison every arithmetic assignment downstream.
  const pad: number = SHEET[layout].pad
  const W: number = SHEET[layout].W
  const cols = columns(W, pad)

  const x0 = pad
  const xPlot = x0 + cols.name + cols.gap
  const xRoute = xPlot + cols.plot + cols.gap
  const xPhase = xRoute + cols.route + cols.gap
  const xDev = xPhase + cols.phase + cols.gap

  const hasLogo = assets.logo !== null
  const top = bodyTop(pad, hasLogo)
  const legendH = CHROME.legend
  const footerH = footerHeight(assets.ack.length > 0)
  const bodyH = rows.length * ROW_H
  const H = layout === 'slide' ? SHEET.slide.H : top + bodyH + legendH + footerH + pad

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = Math.round(H * SCALE)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a 2D canvas context for the export.')
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = p.paper
  ctx.fillRect(0, 0, W, H)

  const geo = axisGeometry(cols.plot, meta.dosing_axis_order.length)

  /* ---- header ---- */
  let y: number = pad
  if (assets.logo) {
    const h = CHROME.logo
    const w = (assets.logo.width / assets.logo.height) * h
    ctx.drawImage(assets.logo, x0, y, w, h)
    y += h + CHROME.logoGap
  }

  ctx.font = `600 28px ${FONT}`
  ctx.fillStyle = p.ink
  ctx.fillText(meta.title, x0, y + 20)
  y += CHROME.title

  ctx.font = `400 13px ${FONT}`
  ctx.fillStyle = p.ink_soft
  const bits = [`${o.entries.length} ${o.entries.length === 1 ? 'entry' : 'entries'}`, o.indicationLabel]
  if (o.hiddenCount > 0) bits.push(`${o.hiddenCount} hidden by the user`)
  if (o.arranged) bits.push('user-arranged order')
  if (o.page && o.page.total > 1) bits.push(`part ${o.page.index + 1} of ${o.page.total}`)
  ctx.fillText(bits.join('  ·  '), x0, y + 16)
  y += CHROME.subtitle

  /* ---- axis ---- */
  ctx.font = `600 10px ${FONT}`
  ctx.fillStyle = p.ink_soft
  ctx.letterSpacing = '1.4px'
  ctx.fillText('PRODUCT', x0, y + 16)
  ctx.fillText('DOSING INTERVAL', xPlot, y)
  ctx.fillText('ROUTE', xRoute, y + 16)
  ctx.fillText('HIGHEST PHASE', xPhase, y + 16)
  ctx.fillText('DEVELOPER', xDev, y + 16)
  ctx.letterSpacing = '0px'
  ctx.font = `400 10px ${FONT}`
  ctx.fillText('W = weeks, M = months · ordinal, not to scale', xPlot + 108, y)
  // Captions clarifying that the route is either approved or merely studied,
  // and that the phase is the most advanced trial on record.
  ctx.font = `400 9px ${FONT}`
  ctx.fillText('approved or investigated', xRoute, y + 27)
  ctx.fillText('most advanced trial', xPhase, y + 27)

  ctx.textAlign = 'center'
  ctx.font = `400 11px ${MONO}`
  ctx.fillStyle = p.ink
  meta.dosing_axis_order.forEach((code, i) => ctx.fillText(code, xPlot + geo.centre(i), y + 16))
  ctx.font = `400 10px ${FONT}`
  ctx.fillStyle = p.ink_soft
  ctx.fillText('no interval stated', xPlot + geo.notStatedCentre, y + 16)
  ctx.textAlign = 'left'

  y += CHROME.axis
  ctx.strokeStyle = p.ink
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x0, y + 0.5)
  ctx.lineTo(W - pad, y + 0.5)
  ctx.stroke()

  /* ---- rows ---- */
  rows.forEach((entry, i) => {
    const top = y + i * ROW_H
    const mid = top + ROW_H / 2
    const marks = rowMarks(entry, meta)
    const colour = meta.stage_tiers[entry.stage]?.colour ?? p.ink_soft

    ctx.strokeStyle = p.hairline
    ctx.globalAlpha = 0.7
    meta.dosing_axis_order.forEach((_, k) => {
      const cx = xPlot + geo.centre(k)
      ctx.beginPath()
      ctx.moveTo(cx + 0.5, top)
      ctx.lineTo(cx + 0.5, top + ROW_H)
      ctx.stroke()
    })
    ctx.globalAlpha = 1

    ctx.save()
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.moveTo(xPlot + geo.dividerX + 0.5, top)
    ctx.lineTo(xPlot + geo.dividerX + 0.5, top + ROW_H)
    ctx.stroke()
    ctx.restore()

    // stage dot
    ctx.fillStyle = colour
    ctx.beginPath()
    ctx.arc(x0 + 5, mid, 5, 0, Math.PI * 2)
    ctx.fill()

    // name + badge
    const badge = indicationBadge(entry)
    const badgeText = badge === 'Treatment' ? 'Tx' : badge === 'Prevention' ? 'Prev' : 'Both'
    ctx.font = `700 9px ${FONT}`
    const badgeW = ctx.measureText(badgeText).width + 12
    ctx.font = `400 13px ${FONT}`
    ctx.fillStyle = p.ink
    const lines = wrap(ctx, entry.name_full, cols.name - 18 - badgeW - 10, 2)
    const lineH = 15
    let ny = mid - ((lines.length - 1) * lineH) / 2 + 4
    for (const line of lines) {
      ctx.fillText(line, x0 + 18, ny)
      ny += lineH
    }

    const badgeX = x0 + 18 + Math.max(...lines.map((l) => ctx.measureText(l).width)) + 8
    const badgeY = mid - ((lines.length - 1) * lineH) / 2 - 6
    const badgeColour =
      badge === 'Prevention' ? p.prevention_accent : badge === 'Treatment' ? p.treatment_accent : p.ink_soft
    ctx.globalAlpha = 0.12
    ctx.fillStyle = badgeColour
    roundRect(ctx, badgeX, badgeY, badgeW, 14, 7)
    ctx.globalAlpha = 1
    ctx.fillStyle = badge === 'Both' ? p.ink : badgeColour
    ctx.font = `700 9px ${FONT}`
    ctx.textAlign = 'center'
    ctx.letterSpacing = '0.7px'
    ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + 10)
    ctx.letterSpacing = '0px'
    ctx.textAlign = 'left'

    if (marks.span) {
      const bx = xPlot + geo.centre(marks.span.from)
      const bw = geo.centre(marks.span.to) - geo.centre(marks.span.from)
      ctx.globalAlpha = BAR_OPACITY
      ctx.fillStyle = colour
      roundRect(ctx, bx, mid - BAR_H / 2, bw, BAR_H, BAR_H / 2)
      ctx.globalAlpha = 1
    }

    ctx.fillStyle = colour
    for (const k of marks.dotIndices) {
      ctx.beginPath()
      ctx.arc(xPlot + geo.centre(k), mid, DOT_R, 0, Math.PI * 2)
      ctx.fill()
    }

    if (marks.notStated) {
      ctx.beginPath()
      ctx.arc(xPlot + geo.notStatedCentre, mid, DOT_R, 0, Math.PI * 2)
      ctx.fillStyle = p.paper
      ctx.fill()
      ctx.strokeStyle = colour
      ctx.lineWidth = 1.6
      ctx.stroke()
      ctx.lineWidth = 1
    }

    // Route chips, tinted per route. The tint is fill and border only; the
    // letters stay in ink so the code never depends on the colour.
    let rx = xRoute
    ctx.font = `400 10px ${MONO}`
    for (const r of entry.routes) {
      const w = ctx.measureText(r).width + 10
      if (rx + w > xRoute + cols.route) break
      const tint = meta.route_colours?.[r]
      ctx.beginPath()
      ctx.roundRect(rx, mid - 8, w, 15, 2)
      if (tint) {
        ctx.globalAlpha = 0.14
        ctx.fillStyle = tint
        ctx.fill()
        ctx.globalAlpha = 0.45
        ctx.strokeStyle = tint
        ctx.stroke()
        ctx.globalAlpha = 1
      } else {
        ctx.strokeStyle = p.hairline
        ctx.stroke()
      }
      ctx.fillStyle = tint ? p.ink : p.ink_soft
      ctx.fillText(r, rx + 5, mid + 3)
      rx += w + 4
    }

    // highest phase of any linked trial
    ctx.font = `400 11px ${FONT}`
    if (entry.highest_phase) {
      ctx.fillStyle = p.ink
      ctx.fillText(entry.highest_phase.replace(/^Phase\s+/i, ''), xPhase, mid + 4)
    } else {
      ctx.fillStyle = p.ink_soft
      ctx.globalAlpha = 0.55
      ctx.fillText('not stated', xPhase, mid + 4)
      ctx.globalAlpha = 1
    }

    ctx.font = `400 12px ${FONT}`
    ctx.fillStyle = p.ink_soft
    const devText =
      entry.developers_full.length > 1
        ? `${entry.developers_full[0]} +${entry.developers_full.length - 1}`
        : (entry.developers_full[0] ?? '')
    const devLines = wrap(ctx, devText, cols.dev, 2)
    let dy = mid - ((devLines.length - 1) * 14) / 2 + 4
    for (const line of devLines) {
      ctx.fillText(line, xDev, dy)
      dy += 14
    }
  })

  // Slides have a fixed height, so the footer is pinned to the bottom rather
  // than following the last row.
  y = layout === 'slide' ? H - pad - footerH - legendH : y + rows.length * ROW_H

  /* ---- legend ---- */
  ctx.strokeStyle = p.hairline
  ctx.beginPath()
  ctx.moveTo(x0, y + 0.5)
  ctx.lineTo(W - pad, y + 0.5)
  ctx.stroke()
  y += 24

  const stagesPresent = Object.keys(meta.stage_tiers).filter((s) => rows.some((e) => e.stage === s))
  let lx = x0
  ctx.font = `600 10px ${FONT}`
  ctx.fillStyle = p.ink_soft
  ctx.letterSpacing = '1.4px'
  ctx.fillText('STAGE', lx, y)
  ctx.letterSpacing = '0px'
  lx += 52
  ctx.font = `400 12px ${FONT}`
  for (const stage of stagesPresent) {
    ctx.fillStyle = meta.stage_tiers[stage]?.colour ?? p.ink_soft
    ctx.beginPath()
    ctx.arc(lx + 5, y - 4, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = p.ink
    ctx.fillText(stage, lx + 15, y)
    lx += 15 + ctx.measureText(stage).width + 20
  }
  if (rows.some((e) => rowMarks(e, meta).span)) {
    ctx.fillStyle = p.ink_soft
    ctx.globalAlpha = BAR_OPACITY
    roundRect(ctx, lx, y - 5, 18, BAR_H, BAR_H / 2)
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(lx, y - 4, DOT_R, 0, Math.PI * 2)
    ctx.arc(lx + 18, y - 4, DOT_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillText('range studied', lx + 28, y)
    lx += 28 + ctx.measureText('range studied').width + 20
  }
  if (rows.some((e) => rowMarks(e, meta).notStated)) {
    ctx.beginPath()
    ctx.arc(lx + 5, y - 4, DOT_R, 0, Math.PI * 2)
    ctx.fillStyle = p.paper
    ctx.fill()
    ctx.strokeStyle = p.ink_soft
    ctx.lineWidth = 1.6
    ctx.stroke()
    ctx.lineWidth = 1
    ctx.fillStyle = p.ink_soft
    ctx.fillText('interval not stated', lx + 15, y)
  }

  /* ---- route key ---- */
  // The codes are meaningless without this, and an exported slide is read on
  // its own, away from the dashboard where the legend lives.
  y += 20
  ctx.font = `600 9px ${FONT}`
  ctx.fillStyle = p.ink_soft
  ctx.letterSpacing = '1.2px'
  const routeLabel = (meta.route_legend_label ?? 'Routes of administration').toUpperCase()
  ctx.fillText(routeLabel, x0, y)
  // Measure BEFORE clearing letterSpacing: measureText ignores spacing that is
  // no longer set, which made the label read narrower than it drew and left the
  // first route code printed on top of it.
  let kx = x0 + ctx.measureText(routeLabel).width + 20
  ctx.letterSpacing = '0px'
  for (const [code, label] of Object.entries(meta.route_legend)) {
    ctx.font = `400 9px ${MONO}`
    const tint = meta.route_colours?.[code]
    const cw = ctx.measureText(code).width
    if (tint) {
      ctx.globalAlpha = 0.16
      ctx.fillStyle = tint
      ctx.beginPath()
      ctx.roundRect(kx - 3, y - 8, cw + 6, 12, 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.fillStyle = tint ? p.ink : p.ink_soft
    ctx.fillText(code, kx, y)
    ctx.font = `400 10px ${FONT}`
    ctx.fillStyle = p.ink
    ctx.fillText(label, kx + cw + 5, y)
    kx += cw + 5 + ctx.measureText(label).width + 16
  }

  /* ---- acknowledgements ---- */
  y += 20
  ctx.strokeStyle = p.hairline
  ctx.beginPath()
  ctx.moveTo(x0, y + 0.5)
  ctx.lineTo(W - pad, y + 0.5)
  ctx.stroke()
  y += 22

  if (assets.ack.length) {
    let ax = x0
    for (const group of assets.ack) {
      ctx.font = `600 8px ${FONT}`
      ctx.fillStyle = accent
      ctx.letterSpacing = '1.2px'
      ctx.fillText(group.heading.toUpperCase(), ax, y)
      ctx.letterSpacing = '0px'
      let gx = ax
      const rowY = y + 8
      const h = 26
      for (const { img } of group.images) {
        const w = (img.width / img.height) * h
        ctx.drawImage(img, gx, rowY, w, h)
        gx += w + 18
      }
      ax = Math.max(gx + 26, ax + 200)
    }
    y += 46
  }

  /* ---- attribution ---- */
  ctx.font = `400 10px ${FONT}`
  ctx.fillStyle = p.ink_soft
  const now = new Date()
  const when = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short' }).format(now)
  const zone =
    new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' })
      .formatToParts(now)
      .find((part) => part.type === 'timeZoneName')?.value ?? ''

  ctx.fillText(`${meta.brand_url ?? ''}   ·   Exported ${when}${zone ? ` ${zone}` : ''}`, x0, y + 10)
  ctx.fillText(meta.source, x0, y + 23)

  const discLines = wrap(ctx, meta.disclaimer ?? DISCLAIMER, 340, 5)
  let dyy = y + 10
  for (const line of discLines) {
    ctx.fillText(line, W - pad - 340, dyy)
    dyy += 12
  }

  // Trim the figure layout to real content; slides keep their fixed 16:9 shape.
  if (layout === 'figure') {
    const bottom = Math.max(y + 23, dyy) + pad
    if (bottom < H - 1) {
      const trimmed = document.createElement('canvas')
      trimmed.width = W * SCALE
      trimmed.height = Math.round(bottom * SCALE)
      const t = trimmed.getContext('2d')
      if (t) {
        t.fillStyle = p.paper
        t.fillRect(0, 0, trimmed.width, trimmed.height)
        t.drawImage(canvas, 0, 0)
        return trimmed
      }
    }
  }
  return canvas
}

/* ------------------------------------------------------------- public API */

/**
 * How many rows fit on one 16:9 slide. Uses exactly the same chrome constants
 * as the renderer, so the body always fills the space available to it.
 */
export function rowsPerSlide(meta: Meta): number {
  const pad = SHEET.slide.pad
  const hasAck = (meta.acknowledgements?.length ?? 0) > 0
  const available =
    SHEET.slide.H - pad - footerHeight(hasAck) - CHROME.legend - bodyTop(pad, Boolean(meta.brand_logo))
  return Math.max(4, Math.floor(available / ROW_H))
}

export function slideCount(opts: ExportOptions): number {
  return Math.max(1, Math.ceil(opts.entries.length / rowsPerSlide(opts.meta)))
}

async function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not produce a PNG.'))), 'image/png')
  })
}

async function prepare(opts: ExportOptions) {
  if (document.fonts?.ready) await document.fonts.ready
  return loadAssets(opts.meta)
}

/** One tall PNG containing every row. */
export async function renderFigure(opts: ExportOptions): Promise<Blob> {
  const assets = await prepare(opts)
  return toBlob(drawSheet({ ...opts, layout: 'figure', assets, rows: opts.entries }))
}

/** A series of 16:9 canvases, one per slide. */
export async function renderSlides(opts: ExportOptions): Promise<HTMLCanvasElement[]> {
  const assets = await prepare(opts)
  const per = rowsPerSlide(opts.meta)
  const total = Math.max(1, Math.ceil(opts.entries.length / per))
  const out: HTMLCanvasElement[] = []
  for (let i = 0; i < total; i++) {
    out.push(
      drawSheet({
        ...opts,
        layout: 'slide',
        assets,
        rows: opts.entries.slice(i * per, (i + 1) * per),
        page: { index: i, total },
      }),
    )
  }
  return out
}

/* -------------------------------------------------------------- downloads */

function stamp(): string {
  const d = new Date()
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 20_000)
}

export async function downloadFigurePng(opts: ExportOptions): Promise<void> {
  save(await renderFigure(opts), `LAPaL-HIV-landscape-${stamp()}.png`)
}

/**
 * One PNG per slide, delivered as a single ZIP.
 *
 * NOT as separate downloads: a browser allows one programmatic download per
 * user gesture, so firing several `a.click()` calls delivers the first file and
 * silently drops the rest. One archive containing every slide is the only
 * reliable way to hand over all of them.
 */
export async function downloadSlidePngs(opts: ExportOptions): Promise<number> {
  const canvases = await renderSlides(opts)
  const s = stamp()
  const files = []
  for (let i = 0; i < canvases.length; i++) {
    const canvas = canvases[i]
    if (!canvas) continue
    const blob = await toBlob(canvas)
    files.push({
      name: `LAPaL-HIV-landscape-slide-${String(i + 1).padStart(2, '0')}-of-${canvases.length}.png`,
      data: new Uint8Array(await blob.arrayBuffer()),
    })
  }
  save(buildZip(files), `LAPaL-HIV-landscape-${s}-slides.zip`)
  return files.length
}

/** The same slides, as pages of a single PDF. */
export async function downloadPdf(opts: ExportOptions): Promise<number> {
  const canvases = await renderSlides(opts)
  const blob = await buildPdf(canvases, {
    title: opts.meta.title,
    author: 'LAPaL, coordinated by the Medicines Patent Pool',
  })
  save(blob, `LAPaL-HIV-landscape-${stamp()}.pdf`)
  return canvases.length
}
