/**
 * Resolving static assets (logos) against Vite's base path, so they work from a
 * subfolder deployment as well as from the domain root.
 */

/**
 * Assets inlined as data URIs by make_single_file.py, for the self-contained
 * review build. Absent in the normal deployment, where the files are fetched.
 */
declare global {
  interface Window {
    __LAPAL_ASSETS__?: Record<string, string>
  }
}

export function assetUrl(path: string): string {
  const key = path.replace(/^\//, '')
  const inlined = typeof window !== 'undefined' ? window.__LAPAL_ASSETS__?.[key] : undefined
  if (inlined) return inlined
  const base = import.meta.env.BASE_URL || '/'
  const sep = base.endsWith('/') ? '' : '/'
  return `${base}${sep}${key}`
}

/**
 * Load an image for canvas drawing. Resolves to null rather than rejecting: a
 * missing or slow logo must never prevent an export from completing.
 */
export function loadImage(path: string, timeoutMs = 4000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    let settled = false
    const done = (v: HTMLImageElement | null) => {
      if (!settled) {
        settled = true
        resolve(v)
      }
    }
    const img = new Image()
    img.onload = () => done(img)
    img.onerror = () => done(null)
    setTimeout(() => done(null), timeoutMs)
    img.src = assetUrl(path)
  })
}
