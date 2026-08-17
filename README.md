# ootd

Outfit of the day. A private, offline wardrobe app that runs in Chrome and installs to the iPhone home screen.

No server, no login, no accounts. Clothing photos live in a database inside the browser on your own device and are never transmitted anywhere. Anyone who opens the URL sees an empty app.

The full specification is in [`docs/SPEC.md`](docs/SPEC.md) — it is the source of truth.

## Status

**Phase 0 complete** — the pipeline. Scaffold, PWA manifest, real icon, offline shell, and the iOS install banner.

| Phase | What it adds | State |
| --- | --- | --- |
| 0 | Scaffold, PWA, icon, offline, install banner | done |
| 1 | Dexie schema, photo import, resize/compress, wardrobe grid | next |
| 2 | Search, generic filter bar, detail sheet, bulk edit | |
| 3 | Randomizer + `pickOutfit` | |
| 4 | Outfits view, composites | |
| 5 | Background removal, design pass | |
| 6 | Custom tags, export/import backup | |
| 7 | Real-device testing | |

## Running it

```bash
npm install
npm run dev
```

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server on localhost |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the built `dist/` |
| `npm test` | Unit tests |
| `npm run lint` | Lint |
| `npm run icons` | Regenerate the app icons |

## Putting it on the phone

The phone needs a real HTTPS URL — home-screen install and service workers do not work over a plain local network address. So it has to be deployed, even though nothing about the app is online.

1. Create a GitHub repo and push this directory to it.
2. On [netlify.com](https://netlify.com), sign in **with GitHub** and pick the repo. `netlify.toml` already sets the build command, the publish directory, and the SPA redirect, so the defaults are correct.
3. Every push now deploys automatically to something like `ootd-isi.netlify.app`.

Then, on the iPhone: open the URL in Chrome → Share icon → **Add to Home Screen** → name it `ootd` → open the new icon.

### Use the icon, not the tab

On iOS an installed home-screen app gets **its own private storage bucket**, separate from the Chrome tab it was installed from. Items added in a tab will not appear in the installed app — it is effectively a second, empty copy. iOS sandboxes web apps this way and it cannot be worked around.

The app detects this and shows a banner when it is running in an iOS tab. Once installed, add clothes only from the icon.

Installed home-screen apps are also exempt from iOS clearing unused site data after 7 days. A bookmarked tab is not.

## The icon

`scripts/icon.js` is the whole icon — a lowercase `ootd` wordmark in Playfair Display on the paper ground. `npm run icons` re-renders every size into `public/icons/`, reading the font straight out of the copy the app itself ships, so the icon and the in-app wordmark cannot drift apart. Swapping in a drawn symbol later means editing that one file.

The generated PNGs are committed, so a build or a deploy never runs the generator.

## Layout

```
scripts/      icon source + generator
src/
  design/     tokens, typography
  lib/        install-mode detection
  components/ InstallBanner
  App.tsx     Phase 0 screen
```

Later phases add `src/db/` (Dexie, kept behind a repository module so a sync backend is a swap, not a rewrite), `src/images/`, `src/logic/pickOutfit.ts`, and `src/screens/`.

## Backup

Local-only data can be lost — deleting the app, wiping the phone, or storage eviction takes the wardrobe with it. Export/import lands in Phase 6, and once it exists it is worth actually using.
