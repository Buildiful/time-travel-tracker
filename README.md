# Time Travel Tracker by Buildiful®

A free, browser-based flight diary that adds up how far your local clock has moved on cross-timezone flights. Flights are entered manually; no account, live flight tracking or backend is required.

## Run locally

Open `index.html` in a current browser, or serve the directory locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. To publish on GitHub Pages, put the **contents of this folder** at the repository root. Intended public URL: `https://buildiful.github.io/time-travel-tracker/`.

## Using the tracker

1. Enter the **from** and **to** airports. Type an airport's three-letter IATA code or city and choose from the shared built-in suggestions. The included reference contains **584 airports**. If your airport is not listed, a valid three-letter code and a manually selected timezone will also work.
2. Enter the departure and arrival dates/times **as shown on the local clocks**. Each airport auto-fills its IANA timezone; you can override the timezone using the shared dropdown suggestions (including historical IANA names).
3. The elapsed **flight duration** fills automatically from the two timestamp/timezone combinations, in days, hours, and minutes. You can edit it. A manually entered duration more than one minute different from the computed elapsed time is flagged and **not included** until corrected. The one-minute margin accommodates minute-level inputs.
4. Add or remove flight entries as needed. Current entries autosave in browser local storage, subject to storage availability. **Save project** downloads an editable JSON backup; **Open project** restores a downloaded project file.
5. Music is **off by default**. The original light, upbeat instrumental music plays for four minutes and loops if enabled; the light action sound effects can be switched off independently.

## What the totals mean

This is a **playful, local-clock definition** of “time travel,” not a physics claim or a measurement of extra/lost elapsed time. On each valid cross-timezone flight, the arrival calendar date and time **as displayed at the destination** is compared directly with the departure date and time **as displayed at the origin**, without adding or subtracting any timezone offset:

```text
local clock change = arrival local date/time - departure local date/time
actual elapsed flight duration = arrival UTC instant - departure UTC instant
```

If the arrival local date/time is earlier, its absolute value goes into **Back in time**; if later, it goes into **Forward in time**. The sum of their absolute values is **Lifetime time traveled**. **Net clock change** is forward minus backward. An arrival time on a different date contributes the calendar-day difference as well as the clock-hour difference.

Timezones **are not included in the local-clock change calculation**. They *are* used separately to verify the actual elapsed flight duration, interpret daylight saving transitions, and ensure that the route crossed timezones. Flights in the same timezone, or with the same UTC offset at the departure and arrival times, contribute nothing. A zero local-clock change also contributes nothing. An invalid entry or a manually entered duration differing by more than one minute from the computed actual flight duration is not counted.

**Example:** HKG on December 25, 2026 at 06:00 (UTC+08:00) to SFO after 12 hours results in arrival on December 25 at 02:00 (UTC−08:00). Since 02:00 is four hours *earlier* than 06:00 on the same date, **the result is 4 hours back in time**, despite 12 hours actually spent in flight. Arriving at 04:00 instead would represent a 14-hour actual flight and **2 hours back** on the local clocks.

On daylight saving fall-back dates, a local clock time can occur twice; the app offers a choice between first and second occurrence for accurate flight-duration validation. Nonexistent times on spring-forward dates are rejected. For very old dates, timezone accuracy follows the browser/OS timezone database; historical records may need separate verification. This is not a flight schedule or operating-time verification tool.

## Project file format

Projects are ordinary text JSON, with `format: "buildiful-time-travel-tracker"`, `version: 1`, `savedAt`, and a `flights` array containing the typed values. Only the local user chooses where to save them. Import is limited to 2 MiB / 1,000 entries and validates the project type and fields before replacing the current log. Do not open unfamiliar project files from untrusted parties without normal care.

## Privacy & analytics

No flight information is uploaded by the tool. The browser processes the flight log and stores a draft locally. On the official Buildiful GitHub Pages host, the unchanged **Buildiful Analytics v2.1.0** module provides basic GA4 page/action measurement with regional opt-in and privacy-signal handling. Only these aggregate event names are allowlisted:

`flight_added`, `flight_removed`, `project_saved`, `project_opened`, `log_cleared`, `music_enabled`.

See [privacy.html](privacy.html) and [ANALYTICS.md](ANALYTICS.md). Verify the separate GA4 property-level advertising/retention settings before releasing. The regional policy service uses `https://ipwho.is/` only in the Analytics module; the flight log itself makes no external API calls.

## Contents and licensing

- `index.html`, `styles.css`, `js/app.js`, `js/time.js` — app, MIT licensed.
- `js/airports.js` — a manually curated airport-code/city/timezone list maintained in this repository (not imported from a licensed airport database). It may omit some airports or contain outdated data. The user can enter other IATA codes/timezones manually.
- `assets/audio/sunny-skies.mp3` — **Sunny Skies**, original upbeat, easygoing instrumental composition, duration 4:00, licensed [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). `scripts/render_music.py` can recreate the track (requires Python, NumPy, SoundFile, FFmpeg).
- `assets/buildiful-logo-white.png` and official favicon files — Buildiful® brand assets, **not** MIT licensed; see [TRADEMARKS.md](TRADEMARKS.md).
- `js/buildiful-analytics.js` — unchanged Buildiful Analytics v2.1.0 module from the supplied Tool Shell.

## Development tests

```bash
node tests/time.test.js
node --check js/app.js
node --check js/time.js
node --check js/buildiful-analytics.js
```

On GitHub Pages, check that the Privacy link works, visitor-region and GPC/DNT analytics cases work as intended, and GA4 never receives travel fields. Verify the music starts only after tapping its toggle and that the flight log works even when analytics/geolocation requests are blocked.
