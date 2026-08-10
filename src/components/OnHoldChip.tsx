/**
 * The "on hold / discontinued" chip.
 *
 * Deliberately NOT drawn like a phase chip, and deliberately colourless.
 * highest_phase and on_hold are independent facts, and an entry can carry
 * both at once (Phase III, on hold), so this cannot be another step on the
 * phase ramp: it sits beside the phase chip, never instead of it. Every hue
 * on this row already means something else, magenta included: that is
 * meta.palette.flag, reserved for data-quality issues in encoding.ts, and a
 * status is not a data-quality problem. A dashed neutral outline reads as
 * "paused" without adding a colour scale that would collide with one already
 * in use.
 */
import type { Meta } from '../types'

export function OnHoldChip({ meta }: { meta: Meta }) {
  const label = meta.on_hold_label ?? 'On hold / discontinued'
  return (
    <span
      title={label}
      className="shrink-0 rounded-full border border-dashed border-ink-soft/60 px-1.5 py-px text-[9px] font-semibold tracking-[0.04em] whitespace-nowrap text-ink-soft"
    >
      On hold
    </span>
  )
}
