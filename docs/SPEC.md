# ootd — Build Specification

*Outfit of the day. A private, offline wardrobe app that runs in Chrome and installs to the iPhone home screen.*

**Status:** requirements locked. This document is the source of truth — build to it.
**For the implementer (Claude Code):** every open decision in this document has a **locked default** written into it. Nothing here should require asking the user a question before you can start. Build the phases in order (§8); each phase has acceptance criteria.

---

## 1. Summary

A single-page web app. No server, no login, no accounts. Clothing photos live in a database inside the browser on the user's phone. Three main screens: **Randomizer** (the *Clueless* machine), **Wardrobe** (browse + filter), **Outfits** (saved full looks). Items are added by photograph; the app strips the background, compresses the image, and the user tags it.

Packaged as a PWA so it gets a home-screen icon, opens fullscreen, works offline, and never transmits a photo anywhere.

Target scale: **~200 items.** Design for 1,000 without pain; do not over-engineer beyond that.

---

## 2. Locked decisions

| Area | Decision |
|---|---|
| Storage | On-device only, IndexedDB. Free, offline, private. Manual export/import backup is **required**, not optional. |
| Randomizer | Tag-compatible: user sets filters, app shuffles within them. No ML matching. |
| Photos | HEIC→JPEG, resize, compress, **plus automatic background removal**. **Exactly one photo per item.** No icons, no second angle, no alternate view. |
| Platform | Chrome-first, installed to iPhone home screen. Responsive down to phone, up to desktop. |
| Language | English only. |
| Categories | `top`, `bottom`, `other`, `outfit`. **No dresses. No overalls.** |
| Duplicates | Two identical white t-shirts are **two separate entries**. No quantity field. |
| Deletion | Deleting an item **breaks (removes) any saved outfit that references it**, with a warning first. |
| Randomizer vs Outfits | **Separate modes.** The randomizer never serves a pre-saved outfit. |

---

## 3. The Chrome / iPhone situation

Since iOS 16.4 any browser that opts in can add a site to the home screen, and Chrome has. Share icon → Add to Home Screen → an ootd icon that opens fullscreen with no address bar. Desktop Chrome installs PWAs properly too, so one URL becomes an app on both.

**Critical constraint that shapes the build:** on iOS the installed home-screen app gets its own private storage bucket, separate from the Chrome tab it was installed from. Items added in a Chrome *tab* will not appear when opening the *icon* — it is effectively a second, empty copy of the app. This is how iOS sandboxes web apps and cannot be worked around.

**Implementation requirement:** on iOS, if the app detects it is running in a browser tab (`window.navigator.standalone !== true` and no `display-mode: standalone` match), show a persistent dismissible banner: *"Install ootd to your home screen and use the icon — items added here won't appear in the installed app."* Include the Share → Add to Home Screen instructions inline.

Also relevant: installed home-screen web apps are exempt from iOS clearing unused site data after 7 days. A bookmarked tab is not. Another reason the banner matters.

---

## 4. Data model

IndexedDB via **Dexie.js**. Three stores.

### 4.1 `items`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (UUID) | yes | **Primary key** |
| `name` | string | yes | Short human name, e.g. "black wide-leg jeans". On bulk import, auto-prefill as `Top 14` / `Bottom 7` from the category + a counter, so import is never blocked. Fully editable. |
| `category` | `'top' \| 'bottom' \| 'other' \| 'outfit'` | **yes — the only mandatory tag at save time** | Exactly one |
| `image` | Blob | yes | Processed JPEG, ~1200px longest edge, quality 0.82 |
| `thumb` | Blob | yes | 400×400 centre-cropped JPEG for grid scrolling |
| `hasCutout` | boolean | yes | Whether background removal succeeded |
| `seasons` | array of `'spring'\|'summer'\|'autumn'\|'winter'` | no | **Multi-select. Exactly these four values — no "transitional", no "all-year" value; year-round items get all four ticked.** |
| `formality` | `'formal' \| 'casual' \| 'home' \| null` | no | **Single-select.** |
| `location` | `'home' \| 'university' \| 'elsewhere' \| null` | no | Single. Three values only — no sub-locations. |
| `elsewhereNote` | string | no | Free text, only shown when `location === 'elsewhere'` |
| `vibe` | `'masculine' \| 'feminine' \| 'androgynous' \| null` | no | Single |
| `favorite` | boolean | yes | Default `false`. Standalone toggle, independent of all other tags. |
| `inWash` | boolean | yes | Default `false`. **Availability toggle** — see §6. |
| `customTags` | string[] | yes | Default `[]`. IDs into the `tags` store. |
| `dominantColor` | string (hex) | yes | Auto-extracted at import. Not used for matching in v1; stored so colour features can be added later without reprocessing 200 photos. |
| `memberIds` | string[] | yes | Default `[]`. Only populated for `category: 'outfit'` created from the randomizer. |
| `notes` | string | no | Free text |
| `lastWornAt` | number \| null | yes | Epoch ms. Set by "wearing this today". |
| `wearCount` | number | yes | Default `0` |
| `archived` | boolean | yes | Default `false`. Archived = no longer owned. Hidden from wardrobe, outfits and randomizer; visible only under an "Archived" filter. Photo retained. |
| `deletedAt` | number \| null | yes | Trash timestamp; see §4.4 |
| `createdAt` / `updatedAt` | number | yes | Epoch ms |

**Derived (not stored):** `needsTagging` = `seasons.length === 0 || !formality || !location || !vibe`.

**Dexie schema string:**

```
items: 'id, category, location, formality, vibe, favorite, inWash, archived, deletedAt, createdAt, lastWornAt, *seasons, *customTags'
```

### 4.2 `tags` — user-extensible tag groups

The answer to "I'm worried I forgot a tag." Tags are grouped, not a flat list, so new ones feel native.

| Field | Notes |
|---|---|
| `id` | UUID (primary key) |
| `groupName` | e.g. "Colour", "Fabric", "Brand", "Fit" |
| `label` | e.g. "wool", "cropped", "borrowed from Kat" |
| `multiSelect` | Whether an item can hold several values from this group |
| `sortOrder` | number |

Settings offers: create group, add/rename/delete values, merge two values, and a usage count per tag. **Any new group automatically appears in both the item editor form and the filter bar with no code changes** — build the editor and filter bar as generic renderers over the group list, not as hardcoded fields.

The five built-in groups (category, season, formality, location, vibe) are hardcoded rather than living in this store, because they have special behaviour in the pairing engine. They cannot be deleted.

### 4.3 `meta`

Key-value store: `lastBackupAt`, `lastFilterState`, `schemaVersion`, `settings`.

### 4.4 Deletion, archiving, trash

Three distinct states, do not conflate them:

- **Archive** — user no longer owns the garment. Hidden everywhere except the Archived view. Kept forever. Reversible.
- **Trash** — `deletedAt` set. Hidden everywhere, purged automatically after **30 days**. Reversible until purge. *(Locked default: 30-day trash rather than immediate hard delete, so a mis-tap never costs a photo.)*
- **Purge** — Blob and record removed.

**Outfit breakage:** when the user deletes (trashes) a `top`/`bottom`/`other` item, first query outfits whose `memberIds` contain it. If any exist, show: *"This is used in 2 saved outfits. Deleting it will remove them too."* On confirm, trash the item **and** those outfits. Standalone photographed outfits (empty `memberIds`) are never affected.

---

## 5. Filtering semantics

**Within a tag group: OR. Across tag groups: AND.**

Selecting `summer` + `spring` returns items wearable in *either*. Adding `casual` and `at home` narrows to items that are (spring OR summer) AND casual AND at home.

- Items with an **empty** value for a group are **excluded** when that group has an active filter. A `needs tagging` filter exists to find them.
- `favorite` and `inWash` are boolean switches, not groups: "favourites only" (on/off) and "hide items in the wash" (on by default).
- `archived` items are excluded everywhere unless the Archived view is open.
- Filter state persists across app launches (`meta.lastFilterState`).

---

## 6. Availability: the wash toggle

The stated purpose of the app is knowing what is actually *available*. Location answers "where is it"; it does not answer "is it clean". Therefore:

- Every item has an `inWash` boolean, toggled from the item detail sheet and from a long-press on any grid tile (fast bulk marking after doing laundry).
- The randomizer **excludes `inWash` items by default**. A switch in the filter row can include them.
- The wardrobe grid shows a subtle indicator on in-wash items and offers a "In the wash" filter chip so the whole load can be cleared in a few taps.
- **Locked default: no automation.** Marking an item worn does *not* auto-flag it as dirty, and nothing auto-clears. Guessing wrong here is more annoying than tapping.

---

## 7. Screens

**Bottom tab bar**, thumb-reachable, four tabs: **Randomizer · Wardrobe · Outfits · Add**. Randomizer is the launch screen.

### 7.1 Randomizer — the main screen

- Slim filter row at top: season, formality, location, vibe, favourites-only, include-in-wash. **Locked default: season pre-selects from today's date** (Mar–May spring, Jun–Aug summer, Sep–Nov autumn, Dec–Feb winter); location defaults to `home`. Overridable, and the last used state is remembered.
- A toggle: **"add an accessory"** — when on, the shuffle also returns one `other` item. **Locked default: off.**
- One large **shuffle** button.
- Result: a top card and a bottom card stacked vertically like a look, plus the accessory card if enabled.
- Each card has a **lock** icon — lock the top, reshuffle only the bottom.
- Result actions: ♡ favourite both · **Save as outfit** (creates an `outfit` item with a generated side-by-side composite image and `memberIds` populated) · **Wearing this today** (sets `lastWornAt = now`, increments `wearCount` on every piece shown) · reshuffle.
- Empty state must be diagnostic, not blank: *"No bottoms match summer + formal + at university."* with tap-to-remove chips for each active filter.

**Pairing rules (v1) — implement as one pure function, `pickOutfit(items, filters, history)`, with unit tests:**

```
tops    = items where category='top'    and passes(filters) and !archived and !deletedAt and (!inWash or filters.includeInWash)
bottoms = items where category='bottom' and same
others  = items where category='other'  and same        // only if filters.addAccessory

compatible(a, b):
    seasons:    a.seasons ∩ b.seasons ≠ ∅                       // must share at least one season
    formality:  a.formality === b.formality                     // single-select, so exact match
    vibe:       androgynous pairs with anything;
                masculine + feminine is rejected unless filters.allowMixedVibe
    // items with a null field on any of the above are treated as compatible (untagged ≠ blocked),
    // but only surface if that group has no active filter (see §5)

weight(item):
    1.0
    × 1.4 if item.favorite
    × 1.5 if lastWornAt is null or older than 30 days      // resurface neglected clothes
    × 0.2 if the item appeared in the last 8 shuffles      // anti-repeat

pick: weighted-random a top, then weighted-random a bottom from those compatible with it.
      If no compatible bottom exists, re-pick the top (max 20 attempts) before showing the
      diagnostic empty state.
```

### 7.2 Wardrobe

- **Search bar pinned to the top.** Free text matches `name` and `notes`. Beneath it, horizontally scrolling chip rows — one row per tag group, including custom groups — plus `favourites`, `in the wash`, `needs tagging`, `archived`.
- Dense image grid: 2 columns on phone, 4–6 on desktop, square thumbs, 1px gaps.
- **Locked default sort: newest first.** Offer sort by name, by last worn, by category.
- Tap → detail sheet: full image, editable name, all tag groups as chips, heart, wash toggle, location quick-change, wear log, notes, archive, delete.
- **Multi-select mode** for bulk edits — essential for "everything in this box is going to university" and for clearing a laundry load.

### 7.3 Outfits

Same grid filtered to `category: 'outfit'`, larger cards. **Both kinds live here together:** photographs of a real worn look, and composites saved from the randomizer. Outfits carry the **full tag set** (seasons, formality, location, vibe, favourite, custom tags) and are filterable exactly like items. Composites inherit their tags from their member pieces at save time, then diverge freely.

### 7.4 Add

Camera or library picker, **multi-select** (dump 20 photos at once) → processing queue with per-photo progress → tagging.

**Tagging is never mandatory beyond category.** Items save immediately with everything else blank and appear under the `needs tagging` filter to be finished later on the sofa. A **"same tags as previous"** button, because five tops in a row usually share everything.

### 7.5 Settings

Manage tag groups · **Export backup** · **Import backup** · storage used · background-removal toggle · trash (restore/empty) · archived items · delete everything.

---

## 8. Design

Minimal but fashionable, meaning: the clothes are the only colour on screen.

- Paper off-white background `#FAF9F7`, near-black text `#1A1A1A`, mid-grey `#8A8681` for secondary. One restrained accent for interactive/selected states. Everything else greyscale.
- Typography does the fashion work: **Sniglet** (bold, 800) for the `ootd` wordmark and screen titles — a bubble-letter, Comic-Sans-family display face; **Comic Neue** for all UI, the same cartoon family but legible down to chip and caption sizes. Lowercase wordmark, wide letterspacing. *(Revised from the original editorial-serif direction — the user asked for a black-and-white, cartoon-ish vibe after seeing Phase 0/1 running. Both fonts are self-hosted via `@fontsource`, same offline guarantee as before.)*
- No drop shadows, no gradients, no rounded-everything. Hairline rules, generous whitespace, images edge-to-edge in the grid.
- Cutouts on flat white make the grid read as a lookbook rather than a camera roll — this is why background removal earns its complexity.
- Motion minimal and fast: shuffle is a quick card cross-fade, not a slot-machine animation. Tasteful over cute.
- Dark mode: inverted, warm black.
- 44px minimum tap targets; respect `env(safe-area-inset-*)` so nothing hides under the iPhone home bar.

**App icon — build it.** *Locked default:* lowercase `ootd` wordmark in Sniglet Bold, near-black on the off-white paper ground, generous margin, plus a `maskable` variant with extra padding. Export 192/512/1024 PNG + `apple-touch-icon`. If the user later wants a drawn symbol instead, it is a single-file swap.

---

## 9. Tech stack

| Layer | Choice |
|---|---|
| Build | Vite + React + TypeScript |
| Styling | Tailwind CSS |
| Database | Dexie.js over IndexedDB |
| Routing | React Router (hash or memory router — must survive standalone launch) |
| HEIC | `heic-to` (fallback only; iOS usually hands over JPEG already) |
| Resize/compress/thumb | Canvas API, no dependency |
| Background removal | `@imgly/background-removal` — runs entirely in-browser, no API, no cost |
| Dominant colour | ~30 lines of canvas pixel averaging, no dependency |
| App shell | `vite-plugin-pwa` (manifest, icons, service worker, offline) |
| Backup zip | `fflate` |
| Hosting | **Netlify, signed in with GitHub** (user has a GitHub account; this avoids creating a new password and gives push-to-deploy) |
| Backend | **None** |

Estimated ~2,500–3,000 lines of app code.

**Suggested structure:**

```
src/
  db/           dexie schema, migrations, queries, backup/restore
  images/       heic decode, resize, thumb, cutout, dominant colour
  logic/        pickOutfit.ts  ← pure, unit-tested
  components/   grid, item card, tag chip row, filter bar, sheet
  screens/      Randomizer, Wardrobe, Outfits, Add, Settings
  design/       tokens, typography
```

---

## 10. Build phases

Each phase ends with something openable on the phone.

**Phase 0 — Prove the pipeline. Do this first.**
Scaffold Vite+React+TS+Tailwind, PWA manifest, real icon, deploy to Netlify, install on iPhone from Chrome, confirm the icon opens fullscreen with no address bar. Content: a screen saying `ootd`.
*Acceptance:* an ootd icon on the home screen that opens fullscreen and still loads in airplane mode.
*Why first:* this de-risks the entire project in an hour. There is no point writing 3,000 lines before knowing the icon works.

**Phase 1 — Get clothes in.**
Dexie schema, add-item flow, multi-photo import, HEIC/resize/compress/thumb, dominant colour, basic wardrobe grid, the iOS browser-tab banner.
*Acceptance:* 20 photos imported from an iPhone in one go, thumbnails render, data survives a force-quit.

**Phase 2 — Find clothes.**
Search bar, generic chip filter bar over all groups, filter semantics per §5, detail sheet, editing, favourite, wash toggle, archive, bulk multi-select.
*Acceptance:* "summer + casual + at home, favourites only, hide in the wash" returns the right set at 200 items with no visible lag.

**Phase 3 — The randomizer.**
Filter row, `pickOutfit` with unit tests, lock, reshuffle, accessory toggle, diagnostic empty states, wear log, save-as-outfit composite.
*Acceptance:* the app is genuinely useful from here. Unit tests cover season overlap, formality match, vibe rules, anti-repeat, empty pools.

**Phase 4 — Outfits view.** Larger grid, composite generation, member links, outfit-breakage warning on delete.

**Phase 5 — Background removal + design pass.** Add cutouts, then a full visual polish **against real photos** — design decisions made on 60 real garments beat decisions made on placeholders.

**Phase 6 — Custom tags + backup.** Tag group manager, export/import, storage meter, trash, archived view, backup nag.

**Phase 7 — Real-device testing.** iPhone Chrome installed icon, airplane mode, 200+ items, memory behaviour during batch import, a full export→wipe→import round trip.

---

## 11. Running and deploying it

**On the laptop:** `npm run dev` → a localhost URL in Chrome.

**On the phone:** it must be on a real HTTPS URL — home-screen install and service workers do not work over plain local network addresses. Create a GitHub repo, connect Netlify (sign in with GitHub), every push auto-deploys to something like `ootd-isi.netlify.app`.

**Installing on iPhone:** open the URL in Chrome → Share icon → Add to Home Screen → name it `ootd` → open the new icon. **Then use only the icon on the phone** (§3).

Anyone with the URL sees an empty app. The photos are in the phone's storage, not on the internet.

---

## 12. Risks and mitigations

**R1 — Local-only data can be lost.** Deleting the app, wiping the phone, or storage eviction takes the wardrobe with it. Re-photographing 200 garments is a genuinely awful afternoon.
*Mitigation:* export/import is a required Phase 6 deliverable. **Locked default: the app prompts to back up when it has been 30 days since `lastBackupAt` and items have been added since.** Export writes one `.ootd` zip (JSON + images) that can go straight into iCloud Drive. The Dexie layer is isolated behind a repository module so cloud sync can be added later without a rewrite.

**R2 — The two-copies problem on iOS** (§3). *Mitigation:* detection banner plus backup as the escape hatch.

**R3 — Background removal on an iPhone.** ~40MB model download (cached after first use), several seconds and significant memory per photo. iOS aggressively kills memory-hungry pages; batch-processing 20 photos may crash the tab.
*Mitigation:* strictly one photo at a time; downscale before processing; keep the original until the cutout succeeds; automatic fallback to the plain photo on failure; a visible off switch. **Recommendation to the user: bulk-add the initial wardrobe from the laptop, use the phone for one-offs.**

**R4 — HEIC.** iOS usually delivers JPEG from the picker, but not always. Detect and convert; clear error if a file truly cannot be read.

**R5 — Storage size.** ~250KB/item × 200 items ≈ 50MB. Comfortably within limits; the Settings storage meter keeps it visible.

**R6 — Scope creep.** Outfit calendars, weather integration, packing lists, wear statistics, colour matching — all tempting, **none in v1**. Ship Phase 3, live with it for two weeks, then decide.

---

## 13. Consequences of the locked decisions worth knowing

Not blockers — build as specified — but the user should recognise these when they appear.

**Formality is single-select.** Black jeans worn both at home and out get exactly one value. *Guidance shown in the app's tagging help:* pick the dressiest context you would wear it in, since the randomizer matches formality exactly. If this proves too rigid in use, the fix is a custom tag group rather than a schema change.

**One photo per item, no icons.** Items are identified visually and by name only. A garment photographed badly is hard to recognise in the grid; the cutout treatment mitigates this.

**Season matching requires overlap, not equality.** A four-season top pairs with a winter-only bottom. This is intentional and generous — the alternative rejects most valid pairs.

**Untagged items are compatible with everything but invisible under active filters.** This is what makes "import 20 now, tag later" work without the randomizer producing nonsense.

---

## 14. Still open — defaults locked, revisit after two weeks of use

Every item below has a working default. Do not block on them.

| # | Question | Locked default |
|---|---|---|
| 1 | Should wearing an item auto-mark it as in the wash? | No. Fully manual both ways. |
| 2 | Trash retention | 30 days, then purge |
| 3 | Randomizer pre-selects season from today's date | Yes |
| 4 | Wardrobe default sort | Newest first |
| 5 | Do outfits carry the full tag set? | Yes; composites inherit from members at save time |
| 6 | Accessory (`other`) in the randomizer | Toggle, off by default |
| 7 | Backup reminder cadence | 30 days since last backup, only if items were added |
| 8 | App icon | `ootd` Sniglet Bold wordmark, off-white ground |
| 9 | Are `other` items mixed into the main wardrobe grid? | Yes, with a category chip to isolate them |
| 10 | Hosting | Netlify, signed in with GitHub |

---

## 15. Notes for the implementer

- Work **one phase per session**, not "build the whole app". Review each phase before the next lands on top of it.
- `src/logic/pickOutfit.ts` must be a **pure function with unit tests**. It is the only real logic in the app and the one part that will be tuned repeatedly.
- The item editor form and the filter chip bar must be **generic renderers over the tag-group list**, not hardcoded fields. Adding a custom group must require zero code changes — this is an explicit requirement, not an optimisation.
- Keep all Dexie access behind `src/db/` so a future sync backend is a swap, not a rewrite.
- Never hold more than one full-resolution image in memory at a time (R3).
- Test on a real iPhone at the end of every phase, not just at the end.
