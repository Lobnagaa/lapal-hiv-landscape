/**
 * Page chrome.
 *
 * The LAPaL logo, the title, the standfirst and the acknowledgements all come
 * from meta, so the wording and the partner list are edited in build_data.py
 * rather than here.
 *
 * The chrome accent still follows the indication selection (see theme.ts) and
 * is used for links and controls, but no longer for a rule above the title.
 */
import type { Meta } from '../types'
import { assetUrl } from '../assets'

export function Header({ meta }: { meta: Meta }) {
  return (
    <header className="pt-10 pb-8">
      {meta.brand_logo && (
        <img
          src={assetUrl(meta.brand_logo)}
          alt="LAPaL, the Long-Acting Therapeutics Patents and Licences Database"
          className="mb-7 h-14 w-auto"
        />
      )}
      <h1 className="mb-3 max-w-3xl text-[34px] leading-[1.15] font-semibold tracking-[-0.01em] text-ink">
        {meta.title}
      </h1>
      {meta.intro && (
        <p className="max-w-2xl text-[15px] leading-relaxed text-ink-soft">{meta.intro}</p>
      )}
    </header>
  )
}

/** Funders and partners, in the groups defined by meta.acknowledgements. */
export function Acknowledgements({ meta }: { meta: Meta }) {
  const groups = meta.acknowledgements ?? []
  if (groups.length === 0) return null

  return (
    <section
      aria-label="Acknowledgements"
      className="flex flex-wrap items-start gap-x-16 gap-y-8 border-t border-hairline pt-8"
    >
      {groups.map((group) => (
        <div key={group.heading}>
          <p className="mb-4 text-[10px] font-semibold tracking-[0.14em] text-treatment uppercase">
            {group.heading}
          </p>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            {group.logos.map((logo) => (
              <img
                key={logo.file}
                src={assetUrl(`logos/${logo.file}`)}
                alt={logo.alt}
                title={logo.alt}
                className="h-9 w-auto object-contain"
                // A partner logo that fails to load should leave a gap, not a
                // broken-image icon on a published page.
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

export function Footer({ meta }: { meta: Meta }) {
  return (
    <footer className="mt-14 pb-16">
      <Acknowledgements meta={meta} />
      <div className="mt-10 border-t border-hairline pt-6">
        <p className="max-w-3xl text-[12px] leading-relaxed text-ink-soft">{meta.source}</p>
        {meta.disclaimer && (
          <p className="mt-1.5 max-w-3xl text-[12px] leading-relaxed text-ink-soft">
            {meta.disclaimer}
          </p>
        )}
        <p className="mt-4 text-[11px] text-ink-soft opacity-70">
          LAPaL, the Long-Acting Therapeutics Patents and Licences Database, is coordinated by the
          Medicines Patent Pool.{' '}
          {meta.brand_url && (
            <a
              href={`https://${meta.brand_url}`}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline underline-offset-2"
            >
              {meta.brand_url}
            </a>
          )}
        </p>
      </div>
    </footer>
  )
}
