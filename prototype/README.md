# Fitphone Check — screenshot recognition prototype

A standalone, mobile-first React + TypeScript + Vite application. Repository inspection found only the root README and Git configuration, with no application, components, Check flow, graphs or persistence to reuse. This prototype lives in its own directory and uses the supplied Fitphone homepage image as visual inspiration. It has a Check form and an overview of confirmed daily measurements.

## Run

Use Node.js 22.12+ (verified with Node 24) and npm:

```sh
cd prototype
npm ci
npm run dev
```

Open http://localhost:5173. To test on a phone on the same network, use the Network URL printed by Vite. Firewall access may need to be allowed. For deployment, serve the generated `dist/` directory over HTTPS.

```sh
npm test
npm run build
npm run preview
```

Browser tests use Playwright and generate non-personal test images in memory:

```sh
npx playwright install chromium
npm run test:e2e
```

To check the built application instead of the development server, run `npm run build`, set `$env:PLAYWRIGHT_PREVIEW = '1'`, then run `npm run test:e2e`. Close any existing server on port 5173 first.

Alternatively, use an installed Edge browser on Windows:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

OCR needs an internet connection to download Tesseract's worker, WebAssembly core and Dutch/English language models. Tests do not mock the OCR engine. A restricted network can prevent these tests from completing; parser and validation unit tests do not need network access. If a managed Windows network uses an enterprise certificate, Node 24 supports `$env:NODE_USE_SYSTEM_CA = '1'` before `npm ci`; retain TLS verification.

## Demonstrate

1. Choose iPhone or Android. Follow the instructions to open a **daily** Screen Time / Digital Wellbeing overview.
2. Select PNG, JPEG or WebP screenshots. Select multiple files at once or add files afterwards. Limits: five screenshots, 10 MiB per file, 16 megapixels per image. Use screenshots of the **same day**. The selected platform controls guidance and saved metadata; parsing accepts supported labels from either language.
3. Select **Gegevens herkennen**. Loading and recognition progress are displayed; recognition can be cancelled. Invalid or corrupt images receive an error and can be removed or replaced.
4. Review every extracted value. Expand **Vergelijk met je screenshots** to inspect the originals, or **Bekijk herkende tekst** to inspect OCR output. Edit the date, total hours/minutes, count and count type; add, edit or remove apps. Unknown values remain empty. A displayed date such as `Sunday, 11 September` preserves the day and month and asks only for the missing year. A mismatch between the chosen date and recognised weekday gets a warning. For a completely missing date, choose the date yourself.
5. Confirm that the information describes one day and that you have checked it. **Meting opslaan** saves the confirmed values and opens **Metingen**. Editing a field clears the verification checkbox. Nothing is saved before explicit confirmation.
6. Reload and open **Metingen** to check persistence. One measurement per date and platform is retained; the form warns before replacing a matching measurement.

**Gegevens handmatig invullen** opens the same editable form without OCR. Switching between Check and Metingen preserves an in-memory draft. Reloading discards an unsaved draft and uploaded files.

## Implementation

- `src/lib/parser.ts`: pure functions for duration extraction, period detection, metric identification, app extraction and merging screenshots. `src/lib/dates.ts` parses Dutch/English named dates, preserves yearless day/month/weekday information, and completes dates using a user-supplied year.
- `src/lib/validation.ts`: file metadata, calendar dates, bounded whole-number durations/counts, required verification and conversion from draft fields to the data model. Units are converted to integer minutes. Missing fields use `null`; explicit zero stays `0`.
- `src/lib/image-validation.ts`: decodes files in the browser, rejects corrupted/oversized images, and releases temporary object URLs.
- `src/lib/ocr.ts`, `ocr.worker.ts`, `ocr-engine.ts`: creates an on-demand supervisor worker, dynamically imports Tesseract.js, loads `nld` and `eng`, recognizes files sequentially with one Tesseract worker, and releases workers on success, failure, cancellation or a three-minute deadline. The supervisor allows termination even while Tesseract is initializing. No OCR code or models execute on initial page load.
- `src/components/ReviewForm.tsx`: editable, controlled confirmation form shared by screenshot and manual entry. Both confirmation checkboxes must be selected. Partial measurements are allowed if at least one valid value is supplied.
- `src/lib/storage.ts`: shared persistence for manual and screenshot entries; schema validation, non-destructive handling of corrupt storage, and one entry per day/platform.
- `src/components/Overview.tsx`: displays the same structured measurements with source/platform labels and separate pickup/unlock/activation wording. No existing graph implementation was present.

This follows the documented [Tesseract.js worker API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md). Recognition runs locally. Only OCR software/model downloads and optional Google Fonts requests use the network; image bytes and recognized text are never sent to a server. Screenshots, preview URLs and raw OCR text are discarded after save/reset, and are never put in localStorage. Language models may be cached by Tesseract in IndexedDB.

## Temporary data storage

This is **prototype-only localStorage**, scoped to the browser and site origin, with no account, sync or backend. Browser data clearing removes measurements. Private browsing/storage quotas may prevent saving; the form retains its draft and reports the error. Corrupt existing data is not overwritten.

Key: `fitphone.check.v1`. Envelope:

```json
{
  "version": 1,
  "measurements": [
    {
      "date": "2026-01-15",
      "screenTimeMinutes": 272,
      "pickups": 68,
      "pickupMetric": "unlocks",
      "apps": [{ "name": "Instagram", "durationMinutes": 105 }],
      "source": "screenshot",
      "platform": "android"
    }
  ]
}
```

Example values are illustrative. `pickupMetric` is `pickups`, `unlocks`, `activations`, or `null`. The historical name `pickups` holds the numeric count, while `pickupMetric` preserves its meaning; do not aggregate different count types as equivalent. A missing total/count is `null`, not zero. Future Check integrations can reuse the `Measurement` type and replace the storage adapter.

## Parsing boundaries

- Recognizes explicit unit formats such as `4h 32m`, `4 u 32 min`, `4 uur 32 minuten`, and `4 hours 32 minutes`. Bare numbers, percentages, decimal hours and clock times such as `9:41` are deliberately not treated as durations.
- Total durations require an explicit total/screen-time/today label, either on the same line or beside a standalone duration line. The Samsung overview also supports a standalone duration immediately below its `Digital Wellbeing` / `Digitaal welzijn` heading. Other unlabelled layouts may still leave the field empty. Chart axes and the Samsung `Today Weekly` navigation row are excluded from total extraction.
- Weekly/average labels cause usage values in that screenshot to be withheld. Both visible Day/Week tab labels alone cannot establish the active tab; the period is unknown unless another daily label/date is recognized. The user must always confirm the daily period.
- ISO dates, unambiguous numeric day-first dates, and Dutch/English month-name dates containing a year can be copied. Yearless named dates preserve the day/month/weekday and request only the year; a missing year is never guessed. Ambiguous numeric dates and relative Today/Yesterday labels are not converted into guessed dates.
- App names with durations on the same line are supported; simple adjacent name/duration rows are supported inside a recognized apps section. Samsung horizontal app-name and duration rows are paired when the column counts agree unambiguously. Common categories, including OCR icon-prefixed category labels, are excluded; app/category classification remains a heuristic.
- iPhone `Total Pickups` values are supported inline, on an adjacent row, or beside the `First Pickup` clock in a two-column layout. First-pickup times, notification counts, and app-open counts are never treated as phone pickups. The iPhone `FIRST USED AFTER PICKUP` app list shows pickup frequency, not duration, so those counts are not imported as app usage.
- Screenshots are merged without adding totals. Conflicting totals, count types or app durations are withheld. Different recognized calendar dates prevent merging. Screenshots with unrecognized dates cannot be verified as belonging to the same day, so the user must check this.
- No preprocessing is applied. Small fonts, dark mode, low contrast, crop/rotation, complex columns, graph labels, category summaries and OCR mistakes can reduce accuracy. A valid-looking wrong value can still pass parsing: user review is essential.
- Screen time and each app duration are bounded at 24 hours. Counts must be whole numbers from 0–10,000. Blank app rows must be completed or removed. Duplicate app names and app durations greater than a known total are rejected. A blank hour or minute component counts as zero only when the other component has been entered.

## Verification and remaining validation

Verification on 15 November 2026: **111 unit tests passed**, **8 browser tests passed against the production build in Microsoft Edge**, and **TypeScript + Vite production build passed**. The browser suite includes seven synthetic interaction scenarios and one opt-in test exercising all six supplied real screenshots. The new year-completion flow and weekday-mismatch warning were verified. Mobile (390 px) and desktop (1280 px) layouts were visually inspected. No test or build failures remain.

Automated parser/validation/storage/OCR tests cover Dutch/English formats, missing versus zero, ambiguous text, app rows, daily/weekly/average labels, cross-file conflicts, invalid files, failed/empty recognition, initialization errors, cancellation, deadlines, resource cleanup and storage failures.

Browser coverage uses actual Tesseract.js in headless Microsoft Edge with **synthetic text images**, not real operating-system screenshots:

- English iOS-inspired labels on PNG: `Screen Time`, daily total, two app durations and `Pickups`.
- Dutch Android-inspired labels on WebP: `Digitaal welzijn`, `Schermtijd`, two app durations and `Ontgrendelingen`.
- Complementary PNG/JPEG images combined into one measurement.
- Editing before save, explicit verification, zero values, persistence after reload, manual entry, corrupt/unsupported files, cancellation and responsive mobile/desktop layouts.

Actual Tesseract OCR was also verified against all **six real JPEG screenshots supplied by the user**, read directly from their private directory:

| Layout                                              | Verified behaviour                                                                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Samsung Digital Wellbeing daily overview, dark mode | Imports the prominent total (3 h 29 m) and the three horizontal app durations; excludes category summaries.                                                                                      |
| Samsung Social detail, dark mode                    | Treats `Today Weekly` as daily navigation; does not import graph ticks, 10 notifications or 41 app opens as total screen time or phone pickups. No phone pickup metric is present in this image. |
| Samsung weekly report with daily average            | Withholds the weekly average and app durations from the daily form.                                                                                                                              |
| Samsung weekly total / peak usage report            | Withholds the weekly total and app durations from the daily form.                                                                                                                                |
| iPhone pickups view                                 | Imports 100 total pickups and recognises Sunday, 11 September. The year is not displayed; entering a year completes the date. App pickup-frequency counts are not durations.                     |
| iPhone weekly Screen Time view                      | Withholds Daily Average (7 h 24 m) and weekly Total Screen Time (44 h 25 m) from daily measurements.                                                                                             |

Re-run the optional real-image test with the files in their original directory, or an ignored private fixture directory:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:FITPHONE_SCREENSHOT_DIR = 'C:\path\to\private-screenshots'
npm run test:e2e -- real-screenshots
```

The opt-in test uses the six supplied filenames, stores diagnostic OCR reports only under ignored `test-results/`, and is skipped when `FITPHONE_SCREENSHOT_DIR` is unset. The screenshots and their raw OCR output are not committed. No pixel preprocessing was needed for these fixes; the changes target the observed OCR layouts. Actual iOS Safari/Android Chrome devices, other OS/vendor variants, further daily iOS total layouts and older mobile browsers remain unvalidated. These checks do not establish universal cross-platform accuracy.

For user evaluation, test privately with original daily screenshots from both platforms. Check totals, date, count type and every app against the original; test multiple screenshots, a weekly overview (must not import weekly data as daily), wrong dates, missing fields, cancellation, network failure and storage denial. Store personal fixtures only in the ignored `private-screenshots/` directory and do not commit them. Generated browser screenshots/traces are also ignored under `test-results/`.
