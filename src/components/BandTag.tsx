/**
 * The C / F/R tag that marks what kind of record a row is.
 *
 * One component for all four views, because this mark had already started to
 * drift: the agents table and the class grid drew it slightly differently, and
 * the exported slides drew it a third way.
 *
 * Colour comes from meta.band_colours and is used as a light wash rather than a
 * solid fill, so the tag reads beside the stage dot, the phase chip and the
 * route codes without competing with any of them.
 *
 * The pair is olive and crimson, which a deuteranope would not tell apart. That
 * is deliberate rather than careless: this is a binary, the letter is always
 * present and C is a visibly different width from F/R, so the colour is
 * reinforcement and never the carrier. Every hue that would have been safer is
 * already in use by the stage, phase or route scales on the same row, and
 * repeating one of those would be the worse mistake.
 */
import type { Band, Meta } from '../types'
import { bandTag } from '../types'

export function BandTag({ band, meta }: { band: Band; meta: Meta }) {
  const tag = bandTag(band)
  const colour = meta.band_colours?.[band]
  return (
    <span
      title={tag.label}
      className="inline-flex h-4 shrink-0 items-center justify-center rounded-sm border px-1 text-[8px] leading-none font-semibold tracking-[0.02em]"
      style={
        colour
          ? {
              background: `color-mix(in srgb, ${colour} 15%, transparent)`,
              borderColor: `color-mix(in srgb, ${colour} 45%, transparent)`,
              color: 'var(--color-ink)',
            }
          : { borderColor: 'var(--color-hairline)', color: 'var(--color-ink-soft)' }
      }
    >
      {tag.letter}
    </span>
  )
}
