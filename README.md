# ootd

Outfit of the day. A private, offline wardrobe app that runs in Chrome and installs to the iPhone home screen.

No server, no login, no accounts. Clothing photos live in a database inside the browser on your own device and are never transmitted anywhere. Anyone who opens the URL sees an empty app.

The full specification is in [`docs/SPEC.md`](docs/SPEC.md) — it is the source of truth.

## Status

**Phase 6.5 complete** — a round of changes driven by actually using the app.

- **Crop before saving.** Every photo goes picker → crop → save → tag. **Automatic clothes detection** pre-draws the crop box around the garment, so it's usually one tap; it reuses the background-removal model's own alpha mask, so it costs no extra download and no second inference pass. Separately switchable in Settings.
- **Tag on import**, inline, instead of hunting the item down in the wardrobe afterwards.
- **Cutouts keep their transparency** rather than being flattened onto white, so garments sit on the app's own paper ground. WebP-with-alpha where the browser can encode it, PNG otherwise.
- **Wardrobe:** 3 columns on phone, laundry-basket and heart quick filters beside the search control, last-worn as the default sort, and every sort reverses with a real name for the reversed direction (newest ⇄ oldest, last worn ⇄ not worn in ages).
- **"I wore this"** in the detail sheet. Previously the only way to log a wear was the randomizer's result card, which left no way at all to log something picked out by hand.
- **Randomizer pairing fixed:** an active filter now defines the acceptable set for that dimension, so pressing spring + summer pairs a spring top with a summer bottom instead of quietly demanding both pieces share a season.
- **Laundry reminder** at 15+ items in the wash, plus the `@Linh` location and a considered order for the location and vibe chips.

**Phase 5, photo-independent half** — the parts of the design pass that don't need real garments:

- **One standing message at a time**, ordered install → backup → laundry. All three could stack, which pushed the screen title most of the way down the phone.
- **The settings gear moved into the title row.** It had a 44px row to itself on every screen; on a phone that came straight out of the grid. The wardrobe grid now starts ~75px higher — about a third of a garment row.
- **One shared sort control** for Wardrobe and Outfits. They were near-identical copies and only one of them grew the reverse behaviour — the same copy-paste drift that once knocked the screen titles out of alignment.
- **Cutout masks are hardened before storage.** Flattening onto white used to hide the model's low-alpha haze; transparency doesn't, and against the dark ground it read as white speckle.

The rest of the design pass — type scale and spacing judged against real garments, and calibrating the mask and detection thresholds — still waits on a real batch of photos. Everything so far has run on synthetic test swatches, which are pathological input for a salient-object model. Phase 7's real-device testing is also still open.

| Phase | What it adds | State |
| --- | --- | --- |
| 0 | Scaffold, PWA, icon, offline, install banner | done |
| 1 | Dexie schema, photo import, resize/compress, wardrobe grid | done |
| 2 | Search, generic filter bar, detail sheet, bulk edit | done |
| 3 | Randomizer + `pickOutfit` | done |
| 4 | Outfits view, composites | done |
| 5 | Background removal, design pass | background removal done; design pass done except what needs real photos |
| 6 | Custom tags, export/import backup | done |
| 6.5 | Crop + detection, tag on import, transparent cutouts, wardrobe controls | done |
| 7 | Real-device testing | next |

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

`scripts/icon.js` is the whole icon — a lowercase `ootd` wordmark in Sniglet Bold on the paper ground. `npm run icons` re-renders every size into `public/icons/`, reading the font straight out of the copy the app itself ships, so the icon and the in-app wordmark cannot drift apart. Swapping in a drawn symbol later means editing that one file.

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
