# Fit Gap Assessment on SharePoint

The dashboard keeps its look and workflow, but stores everything in SharePoint lists instead of each person's browser,
so all consultants see the same assessments.

```
SharePoint site
 ├─ Fit Gap Process Catalogue        (list 1, from Excel – the 399 processes, read only)
 ├─ Fit Gap Assessments              (list 2 – one row per assessment)
 └─ Fit Gap Assessment Records       (list 3 – one row per saved version: rating, reason, who, when)
        ▲
        │ SharePoint REST, signed in as the user
 SPFx web part "Fit Gap Assessment"  ── runs the dashboard in an iframe, posts its state to the web part,
                                         which writes only the changes to the lists
```

* Who made a change comes from the Microsoft 365 login (the name box in the dashboard is read-only).
* History is append-only. **Reassess** adds a new version row; **Edit** corrects a row in place (EditedBy / EditedAt).
* Two people saving the same version of the same process: the first wins (unique key); the second is told and the page reloads.

## What is in this folder

| Path | What |
|---|---|
| `release/fit-gap-assessment.sppkg` | Ready-to-upload SharePoint package (built from `spfx/`) |
| `spfx/` | SPFx 1.23 web part source. `src/core/` is the SharePoint data layer |
| `provisioning/Provision-FitGapLists.ps1` | Creates lists 2 and 3 (PnP PowerShell) – **not run against a real tenant** |
| `provisioning/columns.md` | Exact columns, if you would rather create lists 2 and 3 by hand / from Excel |
| `tests/` | Automated tests against a mock SharePoint REST server |

## Deployment steps (for IT)

1. **Lists.** Import the catalogue (already done by Bhumika). Create lists 2 and 3 with `provisioning/Provision-FitGapLists.ps1`
   or by hand from `provisioning/columns.md`. Two settings matter: *Enforce unique values* on `AssessmentKey` (list 2) and on
   `Title` (list 3).
2. **Permissions.** Assessors need *Read* on list 1 and *Contribute* on lists 2 and 3 (deleting an assessment deletes its rows).
3. **Package.** Upload `release/fit-gap-assessment.sppkg` to the **App Catalog** (tenant-wide, or a site collection App Catalog)
   and click *Deploy*. The package asks for no API permissions (it uses the signed-in user's own SharePoint access).
4. **Add it to the site.** *Site contents → New → Page → Single-part app page* (full width) or add the *Fit Gap Assessment* web part
   to any page. If the site uses the app catalog's site-level installation, add the app under *Site contents → New → App* first.
5. **Settings.** Edit the web part → property pane: the three list names (defaults match the names above) and the height.
6. **Check.** Open the page: you should see "Saved to SharePoint" in the header and 399 processes. Start an assessment, rate one
   process with a reason, then look in list 3 for the new row.

### Rebuilding the package

```
cd sharepoint/spfx
npm install            # Node 22.14+ (SPFx 1.23)
npm run build          # embeds ../../Process-Fit-Assessment.html, bundles, writes sharepoint/solution/fit-gap-assessment.sppkg
```
If the dashboard (`src/imports/…html`, `src/enterprise.css`) changes, rebuild `Process-Fit-Assessment.html` at the repo root first
(see the root README), then run the build above.

## Tests

```
cd sharepoint
./tests/run-unit.sh                 # data layer vs mock SharePoint (paging, versions, edit, conflicts, errors)
node --test tests/e2e.test.mjs      # real dashboard + web-part host code in Chromium, two users, against the mock
```

## Honest limits

* **Not tested against a real SharePoint tenant** (none available to the author). REST calls follow the documented SharePoint
  API and were tested against a mock that imitates it, and the package builds with the real SPFx toolchain. Expect to fix small
  things on first deployment (list names, permissions, a column type).
* The list-creation script is untested.
* Data is loaded when the page opens. Another person's new work appears after a refresh (no live sync).
* Lists are only fast beyond 5,000 rows if `AssessmentKey` / `ProcessID` are indexed (the script does this).
* **Catalogue changes:** QM (Quality Management) rows are recognised by the L1 value "Quality Management (QM)". To add QM or hide the 12 old
  Manufacturing rows, use `QM_rows_for_SharePoint_catalogue.xlsx` (paste into the list in grid view; set Active = No on the old rows).
* The catalogue text contained two literal `_x000D_` markers (BPML-0074); the web part strips them when reading.
* "Reference plant" seeding writes one version-1 row per process, attributed to whoever started the assessment.
