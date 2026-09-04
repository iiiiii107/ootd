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

**Phase 7 — first real-device run.** Install, storage, airplane mode, backup, randomizer and reach all passed on an iPhone. Storage came back at 39GB free, so the ~250KB-an-item budget is nowhere near binding. Three things came back needing work, and all three are fixed:

- **Import was ~7s a photo and left the page half-painted.** Measured rather than guessed: segmentation is ~9s and the backend is irrelevant (WebGPU came within a second of the CPU path), and it was running on the main thread. The pipeline now runs in a worker.

  That fixed the freeze but not the wait, and a later round of measuring found the wait was nearly all of it: with the model switched off the whole pipeline is **74ms**, with it on, ten seconds. Nor can the model be made faster — segmentation takes ~9.5s at a 384px input and ~9.9s at 1200px, because it resizes to its own fixed resolution first. So nothing waits for it any more. The crop step appears in ~60ms, the garment saves the instant you tap save, and the background comes off a few seconds later while you are already tagging. **Importing one garment went from 10.3s to 95ms.**
- **Editing anything made the photos lag.** Dexie's live queries return freshly-read records on every write, so one keystroke handed every tile on screen a new `Blob` and made the browser re-decode the whole grid. Image URLs are now keyed by item, and text fields write on a pause instead of per keystroke. Measured after: an edit re-decodes nothing.
- **Cutouts had specks of background left in them.** Islands unconnected to the garment are now dropped — with a threshold set low enough that a genuinely separate piece like a waistband survives, since silently deleting real clothing is much worse than leaving a speck.

Also from that run: **Discard** in the crop step, so a wrong photo is never saved in the first place, and a **Done** button to end an import session on.

**Design pass, family edition.** ootd now shares its visual language with 10 minutes to spare, calendar to spare and cookbook: the beige-and-ink palette, EB Garamond over Inter, and the family's soft radii on every control. The ground is the same beige 10 minutes to spare puts under everything, which is easier to sit with than near-white and which garment cutouts read better against.

**ootds — what you actually wore.** The Outfits screen leads with a log of recent days rather than the saved library. It needed a new store to exist at all: `lastWornAt` knew when each garment was last worn but not what it was worn *with*, so a top and a skirt worn together were indistinguishable from the same two worn in the same week. One entry per day, keyed by the local date so logging again simply replaces it, and `lastWornAt`/`wearCount` are now derived from that log rather than incremented — a counter can only go up, and changing your mind about an outfit has to take the first one back off.

The randomizer's "wearing this today" now says so. It always did write correctly; it just never changed, which is the same thing as broken from the outside.

**Outfits you build yourself.** Pick pieces from the wardrobe — multi-select, or `+` on the Outfits screen — and the outfit stores no photograph at all. It is its members, and their pictures are already here; what it looks like is composed when it's shown. A saved outfit now costs a few dozen bytes instead of a duplicate image, and re-cropping a garment updates every outfit it appears in.

**Thumbnails that heal themselves.** Object URLs are cached and long-lived so editing doesn't re-decode the grid, but on a real phone a cached URL can stop resolving while the photo behind it is perfectly fine — the tile shows a broken-image mark for something that was never lost. Every garment picture now renders through one component that notices, throws the dead URL away and asks for a new one.

**Crops keep their detail.** The app used to shrink a photo to 1200px and crop out of that, so a garment cropped to 40% of the frame was stored at 360×480 and looked soft the moment it filled the screen. It now crops the original and scales once — 900×1200 from the same photo — and compresses once instead of twice.

**Sharper garments, and a quality choice.** Thumbnails used to be a square centre crop, so a tall coat lost its top and bottom before it was ever drawn — they keep the photo's proportions now. And which segmentation model runs is a setting: 42MB and coarser, or 84MB and cleaner around knit and thin straps. The small one stays the default because it is also half the memory, and this app has been seen losing its worker to memory pressure on a real phone.

**Background removal can be undone.** The photo as it was is kept when the background comes off, so "put the background back" is a real option rather than a re-import. It only works going forward — a garment cut before this existed has no copy to return to.

**Erasing background by hand.** The model gets it almost right often enough that an escape hatch beats another threshold. Open any garment and tidy it up: tap a leftover patch and the whole connected region of that colour goes at once, or brush away background fused to the garment. Editing touches only the alpha channel, which is what makes undo cheap enough to keep eight steps of it on a phone.

**Make it yours.** Settings carries the family's appearance panel, the same one cookbook and the two spare apps have: theme (auto, light, dark), five ready-made palettes, a colour picker for each of the four interface colours *and* each of the six tag hues, a choice of face for headings and body, and how many garments sit across the grid on a phone. Every one of those is written onto `<html>` as a custom property, so nothing else in the app reads a setting to decide how to look — which is what makes any of it a feature rather than a special case in each component.

Colour then took over the work small-caps were doing. Every tag group owns one of six hues and wears it on its label and its selected chips, so season reads differently from formality at a glance instead of both being grey letterspaced capitals. Rust is the accent and means *primary action* or *destructive*, nothing else; green means a switch is on. There are no capitalised labels left anywhere in the app.

Still open: the last of the design pass — type scale and spacing judged against real garments, and calibrating the mask and detection thresholds now that there are real photos to calibrate against.

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
| 7 | Real-device testing | first run done; findings fixed |

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
2. In the repo's **Settings → Pages**, set the source to **GitHub Actions**. Leave the custom domain field empty — a project repo gets `https://<user>.github.io/ootd/` for free.
3. Every push to `main` now builds and deploys automatically via `.github/workflows/deploy.yml`.

`vite.config.ts` sets `base: '/ootd/'` for this, and the app already uses a hash router, so there is no SPA-redirect rule to get wrong.

Then, on the iPhone: open the URL in **Safari** → Share icon → **Add to Home Screen** → name it `ootd` → open the new icon. (Chrome on iOS can install too, but Safari is the path with no surprises — and either way the installed app runs on WebKit.)

### Use the icon, not the tab

On iOS an installed home-screen app gets **its own private storage bucket**, separate from the browser tab it was installed from. Items added in a tab will not appear in the installed app — it is effectively a second, empty copy. iOS sandboxes web apps this way and it cannot be worked around.

The app detects this and shows a banner when it is running in an iOS tab. Once installed, add clothes only from the icon.

Installed home-screen apps are also exempt from iOS clearing unused site data after 7 days. A bookmarked tab is not.

## The icon

`scripts/icon.js` is the whole icon — a lowercase `ootd` wordmark in EB Garamond Semibold on the paper ground. `npm run icons` re-renders every size into `public/icons/`, reading the font straight out of the copy the app itself ships, so the icon and the in-app wordmark cannot drift apart. Swapping in a drawn symbol later means editing that one file.

The generated PNGs are committed, so a build or a deploy never runs the generator.

## Layout

```
scripts/      icon source + generator
src/
  design/     tokens (colour, type) — the whole visual system
  db/         Dexie, schema, queries. The ONLY place that touches the database
  images/     decode → crop → segment → encode, plus the worker it all runs in
  logic/      pickOutfit.ts — the one piece of real algorithm, pure and tested
  tags/       the generic tag-group system built-ins and custom groups share
  components/ shared UI
  screens/    the five screens: randomizer, wardrobe, outfits, add, settings
  lib/        install-mode detection, object URLs, debounced text
```

`src/db/` is kept behind a repository module so a sync backend later is a swap, not a rewrite. Nothing outside it imports the Dexie instance.

## Backup

Local-only data can be lost — deleting the app, wiping the phone, or storage eviction takes the wardrobe with it. Export/import landed in Phase 6 and has been round-tripped through a full wipe — items, photos and custom tags all come back byte-identical. Use it.
