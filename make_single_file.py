#!/usr/bin/env python3
"""
Build a single self-contained HTML file from dist/, for sending to someone by
email who will simply double-click it.

Why this exists
---------------
The normal deployment fetches hiv_dashboard_data.json at runtime, so a curator
can replace the data on the server without a rebuild. That is the right design
for hosting, but it means the page MUST be served over http: browsers refuse to
fetch a local file from a page opened off the disk.

This script produces a review copy with everything inlined, so it opens with a
double-click and works offline. It is a review artefact, NOT the deployable
build: the data is frozen into it and cannot be swapped afterwards.

Usage:
    python3 make_single_file.py [dist] [output.html]

Run npm run build first.
"""
import base64, json, re, sys
from pathlib import Path

DIST = Path(sys.argv[1] if len(sys.argv) > 1 else 'dist')
OUT  = Path(sys.argv[2] if len(sys.argv) > 2 else 'HIV-dashboard-review.html')

if not (DIST / 'index.html').exists():
    sys.exit(f'No {DIST}/index.html. Run: npm run build')

html = (DIST / 'index.html').read_text(encoding='utf-8')
data = json.loads((DIST / 'hiv_dashboard_data.json').read_text(encoding='utf-8'))

MIME = {'.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'}


def data_uri(path: Path) -> str:
    mime = MIME.get(path.suffix, 'application/octet-stream')
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def inline_css_assets(css: str, css_dir: Path) -> str:
    """Replace url(...) references, mainly the Manrope font files, with data URIs."""
    def sub(m):
        raw = m.group(1).strip('\'"')
        if raw.startswith(('data:', 'http:', 'https:')):
            return m.group(0)
        target = (css_dir / raw.split('?')[0].split('#')[0]).resolve()
        if not target.exists():
            return m.group(0)
        return f'url({data_uri(target)})'
    return re.sub(r'url\(([^)]+)\)', sub, css)


# ---- stylesheets -------------------------------------------------------------
def replace_css(m):
    href = m.group(1)
    if href.startswith(('http:', 'https:', 'data:')):
        return m.group(0)
    path = (DIST / href.lstrip('./')).resolve()
    if not path.exists():
        return m.group(0)
    css = inline_css_assets(path.read_text(encoding='utf-8'), path.parent)
    return f'<style>{css}</style>'


html = re.sub(r'<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>', replace_css, html)
html = re.sub(r'<link[^>]+href="([^"]+)"[^>]*rel="stylesheet"[^>]*>', replace_css, html)

# ---- scripts -----------------------------------------------------------------
def replace_js(m):
    src = m.group(1)
    if src.startswith(('http:', 'https:', 'data:')):
        return m.group(0)
    path = (DIST / src.lstrip('./')).resolve()
    if not path.exists():
        return m.group(0)
    js = path.read_text(encoding='utf-8')
    # Guard against the closing-tag sequence terminating the inline script early.
    js = js.replace('</script>', '<\\/script>')
    return f'<script type="module">{js}</script>'


html = re.sub(r'<script[^>]*src="([^"]+)"[^>]*>\s*</script>', replace_js, html)

# ---- the data ----------------------------------------------------------------
# json.dumps escapes nothing HTML-sensitive by default, so close the two
# sequences that could break out of the script element.
payload = json.dumps(data, ensure_ascii=False).replace('</', '<\\/').replace('<!--', '<\\!--')

# Logos are fetched at runtime in the hosted build, so they must be inlined
# here too, or the review copy shows broken images and exports without branding.
assets = {}
for sub in ('logos',):
    folder = DIST / sub
    if folder.is_dir():
        for f in sorted(folder.iterdir()):
            if f.suffix.lower() in MIME:
                assets[f'{sub}/{f.name}'] = data_uri(f)

banner = (
    '<script>window.__LAPAL_DATA__=' + payload + ';'
    'window.__LAPAL_ASSETS__=' + json.dumps(assets) + ';</script>\n'
)
html = html.replace('</head>', banner + '</head>', 1)

OUT.write_text(html, encoding='utf-8')

# ---- report ------------------------------------------------------------------
leftovers = re.findall(r'(?:src|href)="(?!data:|#|https?://)([^"]+)"', html)
size_kb = OUT.stat().st_size / 1024
print(f'wrote {OUT}  ({size_kb:.0f} kB, {len(data["entries"])} entries)')
print('remaining external references:', leftovers if leftovers else 'none, fully self-contained')
