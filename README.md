# LAPaL long-acting HIV therapeutics

An interactive dashboard of long-acting HIV therapeutics, covering treatment and prevention in
a single view. The signature visualisation is a dosing-interval timeline: every product and
compound is a row, placed on an ordinal axis running from weekly to yearly.

Data is curated in `hiv_curation.xlsx` and comes from LAPaL, the Long-Acting Therapeutics
Patents and Licences Database, coordinated by the Medicines Patent Pool.

---

## Updating the data

**`hiv_curation.xlsx` is the source of truth. `hiv_dashboard_data.json` is a build artefact.**
The dashboard never reads the workbook directly, so validation always runs first.

1. Edit `hiv_curation.xlsx` (the Entries tab). The "Legend & how to use" tab documents every
   column. Add or delete whole rows freely; order does not matter, and a new row can leave
   `id` blank for the build step to assign one.
2. Run the build step:

```bash
python3 build_data.py hiv_curation.xlsx
```

3. Replace `hiv_dashboard_data.json` on the server, alongside `index.html`.
4. Refresh the dashboard. The new data appears with no rebuild of the app.

The build step validates every row and **refuses to write** if anything essential is missing
or outside the controlled vocabulary. It prints the offending rows by number and name. It also
recomputes `meta.known_data_issues`, which the dashboard shows in its data-quality panel, so
that list always describes the data currently loaded.

`build_data.py` needs `openpyxl`:

```bash
python3 -m pip install openpyxl
```

### Choosing which entries appear

The dashboard is a **curated selection**, not every record in the source.

Two columns at the right-hand end of the Entries tab control this:

- **`exclude`** — leave blank to show the entry. Mark `x` to withhold it.
- **`exclude_reason`** — free text, shown in the data-quality panel beside the entry name.

Blank means shown, deliberately. Forgetting to mark a newly added row must never make a
product silently vanish, which is the same principle as the not-stated lane.

An excluded row is still fully validated by the build step, so a hidden row cannot quietly rot
and then fail when you bring it back. It is absent from the timeline and from every count, but
the build reports it:

```
OK  wrote public/hiv_dashboard_data.json
    41 entries shown  |  treatment 38  prevention 16  |  4 missing interval, 0 derived
    2 withheld by the curator:
      f018  cabotegravir PH20   (reason: parent molecule, covered by another entry)
      f022  PGT-121 (mAb)   (reason: out of scope for long-acting)
```

and the dashboard names them in the data-quality panel, so a reader can tell the view is
curated rather than exhaustive. The counts are carried in `meta.curation`.

### Setting the default order

The `order` column at the right-hand end of the Entries tab controls where entries appear in
the **default** view, the one a general user sees before touching anything.

Put a number in it. Rows without a number keep the automatic order and fall in behind the ones
that have one, so a partial ordering is useful on its own: number the few that matter and
leave the rest alone.

How it interacts with the band and stage grouping is set by one value in `build_data.py`:

| `default_order_mode` | Effect |
|---|---|
| `'grouped'` (current) | Rows stay grouped by band, then stage. The `order` column decides within each stage; anything unnumbered falls back to earliest interval, then name. |
| `'manual'` | Grouping is switched off entirely. The timeline is one flat list in `order` sequence, and unnumbered rows go last alphabetically. |

Change that one value to switch; nothing else needs editing.

This is separate from what a reader can do. The `order` column is the admin's starting point;
a reader dragging rows only changes their own screen and a refresh restores your order.

### Three separate ways an entry can be absent

Worth keeping distinct, because they live in different places and have different consequences:

| Layer | Where it lives | Who controls it | Effect |
|---|---|---|---|
| **Curation** | `exclude` column, applied by `build_data.py` | The curator | The entry is not in the JSON at all. No reader can bring it back. |
| **Filters** | `src/filters.ts` | The reader | Narrows what they are looking at. Counts follow. |
| **Arrangement** | `src/viewState.ts` | The reader | Hidden for one figure. Lives in the browser only; a refresh restores it. |

Reader state is deliberately never written back to the data. An arrangement made for one
figure must not change what the next person sees.

### Reordering, hiding and PNG export

Readers can drag rows by the handle at the left of each row, or focus a row and use
**Alt with the arrow keys**. The eye icon hides a row. Both are reversible from the bar above
the timeline.

The first reorder switches **stage grouping off** and the timeline becomes one flat list the
reader controls. Stage is then read from the coloured dot beside each name, which is present
in both modes.

**The summary tiles are filters.** Clicking "8 Approved" narrows the view to those eight and
clicking again clears it. The mapping lives in `summaryFilter()` in `src/filters.ts`, beside
the counting logic, so a tile can never show one number and filter to a different set. "In
view" and "Developers" are not clickable: the first is already everything, and the second
counts organisations rather than rows.

**Clicking a row** opens that entry on lapal.ch in a new tab, from the `link in LAPaL` column.
Hovering still shows the detail card. The drag handle and the hide button do not navigate, and
a drag never triggers a click.

### Exports

Three formats, from the **Export** menu above the timeline. All are rendered at 2x by a
purpose-built canvas renderer in `src/export/renderPng.ts`, not screenshots: they reuse the
geometry from `encoding.ts`, include every row rather than what happens to be scrolled into
view, and carry the LAPaL logo, the acknowledgements, the timestamp and the disclaimer.

| Format | Shape |
|---|---|
| **Slides** (recommended) | One 16:9 PNG per ten rows, delivered as a **ZIP**. Unzip and drop onto PowerPoint slides. |
| **PDF** | The same slides as pages of one document. |
| **Single tall PNG** | Every row in one image. Good for a report or poster, too tall for a slide. |

The slides come as a ZIP rather than separate downloads on purpose: a browser permits one
programmatic download per gesture, so firing several delivers the first file and silently
drops the rest.

`src/export/pdf.ts` and `src/export/zip.ts` are minimal hand-rolled writers, for the same
reason the dashboard has no chart library: each is around a hundred lines against a few
hundred kilobytes of dependency.

**`DISCLAIMER`** in `renderPng.ts` is the one constant meant to be edited.

### Adding a field

The round-trip only stays intact if a new field is added in all three places:

1. a column in `hiv_curation.xlsx` (and in `make_workbook.py`, if you ever regenerate the
   workbook from scratch),
2. the entry dictionary in `build_data.py`,
3. the `Entry` interface in `src/types.ts`.

`make_workbook.py` regenerates the workbook from a JSON file. It is a bootstrap tool only.
**Do not run it against a curated workbook: it will overwrite the curation.**

---

## Running and building the app

Requires Node (LTS) and npm.

### Where Node lives on this machine

Node 24.18.0 LTS is installed at **`~/.local/node`**, from the official
`nodejs.org` tarball (SHA-256 verified). It is a user-local install, so it needed no admin
password and touches nothing outside your home folder.

It is on your PATH permanently, via this line in `~/.zshrc`:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
```

So `node`, `npm` and `npx` just work in any new terminal. Note that non-interactive shells do
not read `~/.zshrc`, which is why `.claude/launch.json` still sets the PATH explicitly.

To remove Node later, delete `~/.local/node` and that line from `~/.zshrc`. To replace it with
the standard system-wide install, run the `.pkg` installer from nodejs.org, then delete
`~/.local/node` and the `~/.zshrc` line.

### Hosting on GitHub Pages

The dashboard is a folder of static files, so it needs a file host rather than an app server.
`.github/workflows/deploy.yml` builds and publishes it on every push to `main`.

The workflow regenerates `hiv_dashboard_data.json` from `hiv_curation.xlsx` before building, so
the workbook stays the source of truth all the way to the server. The useful consequence:
**an invalid row fails the deploy** and the live site keeps the last good version rather than
breaking.

Once it is set up, updating the dashboard is: edit the workbook, commit it, push.

First-time setup:

```bash
git init -b main
git add -A
git commit -m "Initial commit: LAPaL HIV long-acting therapeutics landscape"
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

Then in the repository on GitHub, open **Settings → Pages** and set **Source** to
**GitHub Actions**. The first deploy runs automatically and the URL appears in the Actions tab,
as `https://<your-username>.github.io/<repo-name>/`.

`vite.config.ts` already uses `base: './'`, so the site works from that subpath with no change.

**GitHub Pages is public.** Free-tier Pages cannot be made private, and search engines will
index it. `hiv_curation.xlsx` is committed too, which publishes the `curator_notes` and
`exclude_reason` columns along with everything else, so keep genuinely private working notes
elsewhere.

### Just opening the dashboard, without a terminal

Double-click **`Open dashboard.command`**. It serves `dist/` locally using the Python already
on macOS and opens your browser. Keep the Terminal window it opens; closing that window stops
the dashboard.

It serves the last `npm run build`, so rebuild after changing the data.

**Do not double-click `dist/index.html`.** The page fetches its data file at runtime and
browsers block that on a `file://` origin, so it will show the "could not reach" error screen.
It has to be served over http, which is what the launcher does.

### Commands

```bash
npm install
npm run dev
```

To produce the static bundle for hosting:

```bash
npm run build
```

`dist/` then contains everything to upload: `index.html`, `assets/`, and
`hiv_dashboard_data.json`. The build uses a relative base path, so it works from a subfolder
on standard hosting such as Infomaniak, not only from the domain root. Upload the contents of
`dist/`; no server-side runtime is needed.

`npm run typecheck` runs TypeScript alone, without building.

---

## How the code is organised

| File | Responsibility |
|---|---|
| `src/types.ts` | The data schema, documented field by field, plus notes on extending it |
| `src/data/load.ts` | Runtime fetch and validation, with a typed failure for each way it can go wrong |
| `src/data/useDataset.ts` | The React hook wrapping the above |
| `src/encoding.ts` | **All visual encoding rules**: geometry, marks, grouping, sorting |
| `src/filters.ts` | **All filter logic**: state, predicate, facet counts, summary |
| `src/theme.ts` | Applies `meta.palette` and `meta.stage_tiers` to CSS custom properties |
| `src/components/` | Rendering only. These files draw what the two modules above decide |

The separation is deliberate: `encoding.ts` and `filters.ts` are pure and have no React in
them, so the behaviour of the dashboard can be read and changed without reading any JSX.

### The visual encoding

- **Horizontal position** is the ordinal dosing interval from `meta.dosing_axis_order`. It is
  a ranking, **not to scale**: 1W to 2W occupies the same width as 6M to 12M.
- **A filled dot** marks each interval an entry is actually recorded at.
- **A connecting bar** spans the earliest to the latest recorded interval. It crosses any
  interval in between that is *not* recorded, so a gap reads as bar-without-dot rather than
  being hidden. Four entries in the current dataset have such a gap.
- **An open circle in the not-stated lane**, to the right of the axis past a divider, marks an
  entry with no interval recorded. These entries are never dropped from the view.
- **Colour is always development stage**, from `meta.stage_tiers`. Colour never encodes
  indication.
- **A small magenta dot** at the row's left edge marks any active data-quality flag; a dagger
  marks an interval derived from trials that still awaits curator confirmation.

Every colour, label and vocabulary comes from `meta` at runtime. Nothing is hard-coded, so a
dataset for a different therapeutic area needs only a `meta` block of the same shape. See the
notes at the top of `src/types.ts`.

### Indication handling

The indication selector is multi-select and both options are on by default. An entry is shown
when `(Treatment selected AND is_treatment) OR (Prevention selected AND is_prevention)`. This
is a union, so an entry indicated for both appears **once**, tagged `Both`, and is counted once
in the summary. The header accent follows the selection: Medical Blue whenever Treatment is in
scope, LAPaL magenta when the selection is narrowed to Prevention alone.

---

## Accessibility note on the stage palette

`meta.stage_tiers` was checked against the standard colour-vision separation measures. Three
findings, none of which change the palette as shipped:

- **`Approved` #44B384 and `Not stated` #9AA3AE are close under deuteranopia** (OKLab ΔE 5.3,
  against a target of 8). Stage is also given as a text heading above every group of rows, so no
  row's stage depends on colour alone, but the two are hard to tell apart in the legend.
- **All four tiers fall below 3:1 contrast against the paper background.** This is acceptable
  only because each is always accompanied by its written stage name, which it is.
- **A one-line fix is available if you want it.** Changing `Not stated` to `#5A6472`, which is
  already `ink_soft` in your own palette, clears every check: ΔE 20.1 under deuteranopia, 19.2
  under protanopia, 5.75:1 contrast. Edit `META['stage_tiers']` in `build_data.py` and rebuild.

---

## Conventions

UK English throughout. No em dashes.
