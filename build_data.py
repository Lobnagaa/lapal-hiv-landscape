#!/usr/bin/env python3
"""
Turn the curation workbook (hiv_curation.xlsx, Entries tab) into hiv_dashboard_data.json,
the file the interactive dashboard reads.

Usage:
    python build_data.py [hiv_curation.xlsx] [hiv_dashboard_data.json]

It validates every row, computes the automatic flags, and refuses to write if any row is
missing an essential field or uses a value outside the controlled vocabulary.
"""
import sys, json, re
import openpyxl

IN  = sys.argv[1] if len(sys.argv) > 1 else 'hiv_curation.xlsx'
# Default straight into public/, which is where the dashboard reads from and
# what Vite copies into dist/. Writing to the current directory instead would
# produce a JSON that looks correct but that nothing ever loads.
OUT = sys.argv[2] if len(sys.argv) > 2 else 'public/hiv_dashboard_data.json'

ROUTES = ['PO','SC','IM','IV','VR','TD']
FREQS  = ['1W','2W','1M','2M','3M','4M','6M','12M']
STAGES = ['Approved','Late-stage','Early-stage','Not stated']
BANDS  = ['formulations','compounds']
INDIC  = ['Treatment','Prevention','Both']
# Where a dosing interval came from. "not stated" is the curator convention for a row
# with no interval recorded at all; it pairs with the missing_frequency flag.
FREQSRC = ['LAPaL record','derived from trials','manually confirmed','not stated']

# Controlled vocabulary for class_group, which drives the class-by-phase grid.
# drug_class stays as free text for the tooltip; this is the tidy version.
# Combinations are their own value, so every entry is counted exactly once.
CLASS_SINGLES = ['Capsid inhibitor','INSTI','NNRTI','NRTI','NRTTI','mAb','PI','Fusion inhibitor']
CLASS_COMBOS  = ['Capsid inhibitor + INSTI','Capsid inhibitor + NRTTI','Capsid inhibitor + mAb',
                 'INSTI + NNRTI','INSTI + NRTI','NRTI + PI','NRTTI + NNRTI']
CLASSES = CLASS_SINGLES + CLASS_COMBOS

# Clinical phases in order, least to most advanced. Drives the phase chip ramp.
PHASES = ['Preclinical','Phase I','Phase I/II','Phase II','Phase II/III','Phase III','Phase IV']

ROUTE_FULL = {'PO':'Oral','SC':'Subcutaneous','IM':'Intramuscular','IV':'Intravenous',
              'VR':'Topical (Vaginal)','TD':'Transdermal'}
FREQ_FULL  = {'1W':'Weekly','2W':'Every 2 weeks','1M':'Monthly','2M':'Every 2 months',
              '3M':'Every 3 months','4M':'Every 4 months','6M':'Every 6 months','12M':'Yearly'}

# ---- meta block, mirrored from the reference dataset; edit here if the design changes ----
META = {
 'title':'HIV long-acting therapeutics landscape',
 # Standfirst under the title. Edit here, not in the React components.
 'intro':('Formulations, technologies, agents and regimens in the HIV long-acting space. '
          'Researched and approved candidates, for treatment and prevention are shown, placed '
          'on an ordinal dosing-interval axis. Live counts for the current selection are below.'),
 'source':'Curated in hiv_curation.xlsx (Entries tab), built from LAPaL database extracts.',
 'record_bands':{'formulations':'Candidate or approved regimens and formulations',
                 'compounds':'Underlying agents researched or approved for use in HIV '
                             'long-acting therapeutics'},
 'dosing_axis_order':FREQS,
 'dosing_axis_labels':FREQ_FULL,
 # Shown above the axis and in the legend, because "1W" and "12M" are not
 # self-explanatory to a reader meeting the chart for the first time.
 'dosing_axis_note':('W = weeks, M = months, so 1W is weekly and 12M is yearly. The axis is '
                     'ordinal, not to scale. An entry with no dosing interval on record sits '
                     'in the separate "not stated" lane at the right of the axis.'),
 'route_legend':{'PO':'oral','SC':'subcutaneous','IM':'intramuscular','IV':'intravenous',
                 'VR':'vaginal ring','TD':'transdermal'},
 'route_legend_label':'Investigated and/or approved routes of administration',
 # One tint per route, so a reader can scan the column without reading every
 # code. Chosen by optimising the worst-case colour-vision-deficient separation
 # across all fifteen pairs: min OKLab dE 12.0 under protanopia and deuteranopia,
 # against a target of 8. Three hue families at two lightnesses each, which also
 # groups sensibly: amber = non-injection, blue = tissue injection, teal = IV and
 # ring. The chip letters stay in ink, so nothing depends on colour alone.
 # Wash colours for the compound / formulation tag shown beside each name.
 # Every other hue on that row is already spoken for: the stage dot is green,
 # orange, cyan or grey, the phase chip is on a violet ramp and the route codes
 # are orange, blue and teal. Olive and crimson are what is left, and they are
 # used at 15% so they read as a wash, not as a fourth colour scale.
 'band_colours':{'formulations':'#4F7A2F','compounds':'#B0304A'},
 'route_colours':{'PO':'#B66D00','TD':'#834300',
                  'SC':'#6975D8','IM':'#2C4FA2',
                  'IV':'#006B69','VR':'#009C84'},
 # Highest clinical phase, shown as a chip beside the indication badge.
 #
 # An ORDERED progression, so it takes a single-hue ramp rather than categorical
 # hues: darker reads as further along without needing a legend. Violet, at hue
 # 293, is well clear of every other colour in use (nearest is the IM route blue
 # at 264). Verified light-to-dark monotone, visible steps, and ink text at
 # 4.7:1 or better on every step, so the label never depends on the tint.
 'phase_order':PHASES,
 # Display overrides. The STORED value stays 'Phase IV' so the workbook
 # dropdown, the validation and any existing curation keep working; only what
 # the reader sees changes. Add another entry here to relabel any other phase.
 'phase_labels':{'Phase IV':'Marketed'},
 'phase_colours':{'Preclinical':'#F1F0F7','Phase I':'#E4E1F1','Phase I/II':'#D5D0E9',
                  'Phase II':'#C3BBDE','Phase II/III':'#AFA4D1','Phase III':'#9A8CC3',
                  'Phase IV':'#8878B8'},
 # Categorical palette for the stacked count charts, where class is a series
 # rather than an ordered value. Optimised for worst-case colour-vision-deficient
 # separation: min OKLab dE 11.0 across all pairs, against a target of 8.
 # Assigned in fixed vocabulary order, never by rank, so a filter that changes
 # the class counts never repaints the survivors.
 #
 # The charts fold every combination class into one "Combination" series, which
 # keeps the stack to seven and inside the readable limit for a stacked bar.
 'class_colours':{'Capsid inhibitor':'#922940','INSTI':'#436CC8','NNRTI':'#9A6700',
                  'NRTI':'#009ED2','NRTTI':'#008B88','mAb':'#30A86A',
                  'Combination':'#793480'},
 'class_singles':CLASS_SINGLES,
 'stage_tiers':{
    'Approved':{'colour':'#44B384','definition':'marketed in at least one jurisdiction'},
    'Late-stage':{'colour':'#EE7718','definition':'highest recorded phase II/III to III'},
    'Early-stage':{'colour':'#0BBBEF','definition':'preclinical to phase II'},
    'Not stated':{'colour':'#9AA3AE','definition':'no interval or stage recorded in LAPaL'}},
 'palette':{'treatment_accent':'#153F8F','prevention_accent':'#A21C7A','ink':'#12161C',
            'ink_soft':'#5A6472','hairline':'#E4E7EB','paper':'#FFFFFF','flag':'#A21C7A'},
 # Acknowledgements, rendered on the page and in every export. Files live in
 # public/logos/. A missing file is skipped rather than breaking the render.
 'acknowledgements':[
    {'heading':'Hosted and coordinated by','logos':[{'file':'mpp.png','alt':'Medicines Patent Pool'}]},
    {'heading':'In collaboration with','logos':[
        {'file':'liverpool.png','alt':'University of Liverpool'},
        {'file':'celt.png','alt':'CELT'}]},
    {'heading':'With support from','logos':[
        {'file':'unitaid.png','alt':'Unitaid'},
        {'file':'leap.png','alt':'Leap'},
        {'file':'coefficient-giving.png','alt':'Coefficient Giving'}]}],
 'brand_logo':'logos/lapal.png',
 'brand_url':'lapal.ch',
 # How the DEFAULT view is ordered. Readers can always rearrange for themselves;
 # this is the admin's starting point, and the only thing a general user sees
 # until they drag something.
 #
 #   'grouped'  rows are grouped by band, then by development stage. Inside each
 #              stage, the "order" column decides, and anything without a number
 #              falls back to earliest dosing interval, then name.
 #   'manual'   grouping is switched off entirely and the timeline is one flat
 #              list in "order" column sequence. Rows without a number go last.
 #
 # Change this one value to switch. Nothing else needs editing.
 'default_order_mode':'grouped',
 'typeface':'Manrope',
 'encoding_notes':[
    'Dosing axis is ordinal, not to scale.',
    'A dot marks each stated interval; a bar connects the range where several are studied.',
    'missing_frequency entries sit in a dedicated not-stated lane.',
    'frequency_derived_from_trials entries need curator confirmation (shown with a dagger).',
    'conventional_approval_only marks a molecule approved in a conventional non-LA form.',
    'Daily and single-dose values are excluded as not long-acting.'],
 'dual_use_note':'Entries indicated for both treatment and prevention appear once, tagged Both.',
 # Shown at the foot of the page and on every export. Edit here only.
 'disclaimer':('LAPaL reflects a curated snapshot at a point in time. Efforts are put to '
               'refresh content on a rolling basis as new public information appears.'),
}

def fail(msgs):
    print('BUILD STOPPED. Fix these and run again:\n')
    for m in msgs: print('  -', m)
    sys.exit(1)

def cell(v):
    return '' if v is None else str(v).strip()

def main():
    wb = openpyxl.load_workbook(IN, data_only=True)
    if 'Entries' not in wb.sheetnames:
        fail(['Workbook has no "Entries" tab.'])
    ws = wb['Entries']
    rows = list(ws.iter_rows(values_only=True))
    # header is on row 2 (row 1 is the group banner)
    header = [cell(x) for x in rows[1]]
    idx = {h:i for i,h in enumerate(header)}
    for req in ['band','name','indication','stage']:
        if req not in idx: fail([f'Missing column "{req}" on the Entries header row.'])

    errors=[]; entries=[]; excluded=[]; used_ids=set()
    seq=0
    for rn, raw in enumerate(rows[2:], start=3):
        g = lambda h: cell(raw[idx[h]]) if h in idx and idx[h] < len(raw) else ''
        name=g('name'); band=g('band')
        if not any([name, band, g('indication'), g('stage')]):
            continue  # blank spacer row
        where=f'row {rn} ({name or "unnamed"})'
        if not name: errors.append(f'{where}: no name'); 
        if band not in BANDS: errors.append(f'{where}: band must be one of {BANDS}, got "{band}"')
        ind=g('indication')
        if ind not in INDIC: errors.append(f'{where}: indication must be one of {INDIC}, got "{ind}"')
        stage=g('stage')
        if stage not in STAGES: errors.append(f'{where}: stage must be one of {STAGES}, got "{stage}"')

        routes=[c for c in ROUTES if g(c).lower()=='x']
        freqs =[c for c in FREQS  if g(c).lower()=='x']

        rid=g('id')
        if not rid:
            seq+=1; rid=f'{band[:1] or "x"}{900+seq:03d}'
        if rid in used_ids: errors.append(f'{where}: duplicate id "{rid}"')
        used_ids.add(rid)

        src=g('frequency_source') or 'LAPaL record'
        if src not in FREQSRC:
            errors.append(f'{where}: frequency_source must be one of {FREQSRC}, got "{src}"')

        # Link to the entry on lapal.ch. Optional, but if present it must be a
        # plain web address: the dashboard opens it in a new tab, so anything
        # else (javascript:, data:) would be an injection route into the page.
        # Admin-controlled position in the default view. Blank means "no
        # opinion": those rows fall to the end, in the automatic order.
        order_raw=g('order')
        order=None
        if order_raw:
            try:
                order=float(order_raw)
            except ValueError:
                errors.append(f'{where}: "order" must be a number, got "{order_raw}"')

        cls=g('class_group')
        if cls and cls not in CLASSES:
            errors.append(f'{where}: class_group must be one of {CLASSES}, got "{cls}"')

        link=g('link in LAPaL')
        if link and not re.match(r'^https?://', link, re.I):
            errors.append(f'{where}: "link in LAPaL" must start with http:// or https://, got "{link}"')
        is_t = ind in ('Treatment','Both')
        is_p = ind in ('Prevention','Both')
        conv = (stage=='Approved' and not freqs and set(routes)<= {'PO'})

        # Editorial selection. Blank means shown, deliberately: forgetting to
        # mark a newly added row must never make a product silently disappear.
        # An excluded row is still validated above, so a hidden row cannot rot.
        if g('exclude').lower()=='x':
            excluded.append({'id':rid,'name_full':name,
                             'reason':g('exclude_reason') or None})
            continue

        entries.append({
            'id':rid,'band':band,'name_full':name,
            'routes':routes,'routes_full':[ROUTE_FULL[r] for r in routes],
            'frequencies':freqs,'frequencies_full':[FREQ_FULL[f] for f in freqs],
            'frequency_provenance':src,
            'stage':stage,'highest_phase':g('highest_phase') or None,
            'developers_full':[d.strip() for d in re.split(r'[;]', g('developers')) if d.strip()],
            'drug_class':g('drug_class') or None,
            'class_group':cls or None,
            'lapal_url':link or None,
            'display_order':order,
            'therapeutic_areas':'HIV',
            'use_case_raw':ind,'is_treatment':is_t,'is_prevention':is_p,
            'flags':{
                'missing_frequency': not freqs,
                'frequency_derived_from_trials': src=='derived from trials',
                'derived_frequency_needs_review': src=='derived from trials',
                'conventional_approval_only': conv,
                'no_linked_trials': g('flag_no_trials').lower()=='x',
                'approved_but_no_regulatory_rows': g('flag_no_reg_rows').lower()=='x',
            }})

    if errors: fail(errors)
    if not entries and not excluded: fail(['No data rows found.'])
    if not entries:
        fail(['Every row is marked exclude, so the dashboard would be empty.'])

    # The dashboard is a curated view, not an exhaustive dump of every HIV
    # record. Excluded rows are absent from the timeline and from every count,
    # but they are recorded here so the dashboard can report what was withheld.
    # Curation stays visible rather than silent.
    META['curation'] = {'excluded_count': len(excluded), 'excluded': excluded}

    # Row order for the class-by-phase grid: single classes first, most populous
    # at the top, then the combinations. Computed here rather than in the
    # dashboard so the order is stable and the build owns it.
    import collections as _c
    counts = _c.Counter(e['class_group'] for e in entries if e['class_group'])
    META['class_order'] = (
        sorted((c for c in counts if c in CLASS_SINGLES), key=lambda c: (-counts[c], c))
        + sorted((c for c in counts if c not in CLASS_SINGLES), key=lambda c: (-counts[c], c))
    )
    META['class_vocabulary'] = CLASSES

    known=[]
    mf=[e['name_full'] for e in entries if e['flags']['missing_frequency']]
    if mf: known.append(f'{len(mf)} entries have no recorded dosing interval.')
    dr=[e['name_full'] for e in entries if e['flags']['frequency_derived_from_trials']]
    if dr: known.append(f'{len(dr)} intervals are derived from trials and await confirmation.')
    nr=[e['name_full'] for e in entries if e['flags']['approved_but_no_regulatory_rows']]
    if nr: known.append('Approved but missing regulatory rows: ' + ', '.join(nr) + '.')
    META['known_data_issues']=known

    json.dump({'meta':META,'entries':entries}, open(OUT,'w'), indent=1, ensure_ascii=False)
    t=sum(e['is_treatment'] for e in entries); p=sum(e['is_prevention'] for e in entries)
    print(f'OK  wrote {OUT}')
    print(f'    {len(entries)} entries shown  |  treatment {t}  prevention {p}  |  '
          f'{len(mf)} missing interval, {len(dr)} derived')
    if excluded:
        print(f'    {len(excluded)} withheld by the curator:')
        for e in excluded:
            print(f'      {e["id"]}  {e["name_full"]}'
                  + (f'   (reason: {e["reason"]})' if e['reason'] else '   (no reason given)'))

if __name__ == '__main__':
    main()
