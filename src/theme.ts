/**
 * Applies meta.palette and meta.stage_tiers to CSS custom properties.
 *
 * Every colour in the dashboard comes from the JSON. Nothing is hard-coded
 * except the fallbacks in index.css, which only show if a palette key is
 * missing from the data file.
 */
import type { Indication, Meta, StageName } from './types'

/** Turn a stage name into a CSS-safe custom property suffix. */
export function stageSlug(stage: StageName): string {
  return stage.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

/** CSS custom property holding a given stage's colour. */
export function stageVar(stage: StageName): string {
  return `var(--stage-${stageSlug(stage)}, var(--color-ink-soft))`
}

/**
 * The chrome accent follows the indication SELECTION, not the data:
 * Medical Blue whenever Treatment is in scope, LAPaL magenta when the user has
 * narrowed to Prevention alone. Row marks are never coloured this way; they are
 * always coloured by development stage.
 */
export function accentFor(meta: Meta, selected: Set<Indication>): string {
  const preventionOnly = selected.has('Prevention') && !selected.has('Treatment')
  return preventionOnly ? meta.palette.prevention_accent : meta.palette.treatment_accent
}

export function applyPalette(meta: Meta): void {
  const root = document.documentElement.style
  const p = meta.palette
  const set = (name: string, value: string | undefined) => {
    if (value) root.setProperty(name, value)
  }

  set('--color-ink', p.ink)
  set('--color-ink-soft', p.ink_soft)
  set('--color-hairline', p.hairline)
  set('--color-paper', p.paper)
  set('--color-flag', p.flag)
  set('--color-treatment', p.treatment_accent)
  set('--color-prevention', p.prevention_accent)

  for (const [stage, tier] of Object.entries(meta.stage_tiers)) {
    set(`--stage-${stageSlug(stage)}`, tier.colour)
  }
}

/** Called whenever the indication selection changes. */
export function applyAccent(meta: Meta, selected: Set<Indication>): void {
  document.documentElement.style.setProperty('--color-accent', accentFor(meta, selected))
}
