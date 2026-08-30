/**
 * Turning a preference into CSS.
 *
 * Every visual choice is expressed as a custom property or a data attribute on
 * `<html>`, and nothing else in the app reads appearance settings for styling.
 * That is what makes "pick your own colours" a real feature rather than a
 * handful of special cases: any token in tokens.css can be overridden here and
 * every rule that uses it follows, including ones written later.
 *
 * The approach is cookbook's; the token set is this app's own.
 */

/** The four colours the interface itself runs on. */
export const PALETTE_KEYS = [
  { id: 'paper', label: 'Paper', hint: 'the ground everything sits on' },
  { id: 'ink', label: 'Ink', hint: 'body text' },
  { id: 'accent', label: 'Accent', hint: 'shuffle, save, delete' },
  { id: 'muted', label: 'Muted', hint: 'labels and captions' },
] as const;

/** The six a tag group can own. Editable because they are the app's real colour. */
export const TAG_KEYS = [
  { id: 'tag-1', label: 'Group 1' },
  { id: 'tag-2', label: 'Group 2' },
  { id: 'tag-3', label: 'Group 3' },
  { id: 'tag-4', label: 'Group 4' },
  { id: 'tag-5', label: 'Group 5' },
  { id: 'tag-6', label: 'Group 6' },
] as const;

const ALL_KEYS = [...PALETTE_KEYS, ...TAG_KEYS];

/**
 * Ready-made palettes. Each carries a daylight *and* a night set, because a
 * palette authored for paper is unreadable on a dark ground — the accent that
 * reads as a considered olive at midday turns into a smudge at night. Picking
 * one sets both, so the choice survives the phone going dark in the evening.
 *
 * `paper` is the built-in defaults under a name, so choosing it is how you get
 * back to where you started.
 */
export const PRESETS = {
  paper: { label: 'Paper', light: {}, dark: {} },
  olivegrove: {
    label: 'Olive grove',
    light: { paper: '#f8f7f0', ink: '#2c3025', accent: '#5f6b4a', muted: '#7f8271' },
    dark: { paper: '#1e2019', ink: '#dfe3d5', accent: '#93a882', muted: '#8b9182' },
  },
  verdigris: {
    label: 'Verdigris',
    light: { paper: '#f7f9f7', ink: '#222b29', accent: '#47726a', muted: '#7c8886' },
    dark: { paper: '#191f1e', ink: '#d9e3e0', accent: '#79a79b', muted: '#83908d' },
  },
  clay: {
    label: 'Clay',
    light: { paper: '#faf7f2', ink: '#2b2825', accent: '#8a7b52', muted: '#8b8375' },
    dark: { paper: '#201d19', ink: '#e6ded2', accent: '#c2ab77', muted: '#8f867a' },
  },
  charcoal: {
    label: 'Charcoal',
    light: { paper: '#f8f8f7', ink: '#232323', accent: '#33312d', muted: '#87867f' },
    dark: { paper: '#1c1c1b', ink: '#e2e2e0', accent: '#b9b6ae', muted: '#8b8a85' },
  },
} as const satisfies Record<string, { label: string; light: Palette; dark: Palette }>;

/** Token id → hex. Absent keys keep whatever tokens.css says. */
export type Palette = Record<string, string>;

/** Which set of tokens is actually in force right now. */
export type Scheme = 'light' | 'dark';

export type PresetId = keyof typeof PRESETS;

export const FACES = {
  garamond: "'EB Garamond', 'Iowan Old Style', Georgia, serif",
  inter: "'Inter', -apple-system, 'Segoe UI', 'Helvetica Neue', sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;

export type FaceId = keyof typeof FACES;

export const FACE_LABELS: Record<FaceId, string> = {
  garamond: 'Garamond',
  inter: 'Inter',
  system: 'System',
};

/** How many garments sit across the wardrobe grid on a phone. */
export const DENSITIES = [
  { id: 2, label: 'Large' },
  { id: 3, label: 'Medium' },
  { id: 4, label: 'Small' },
] as const;

export interface Appearance {
  /** `system` follows the phone; the other two override it in both directions. */
  theme: 'system' | 'light' | 'dark';
  /**
   * One palette per scheme, and it has to be two rather than one: these are
   * applied as inline properties on `<html>`, which outrank every stylesheet
   * rule including the dark ones. A single shared palette therefore didn't
   * merely look wrong at night, it disabled dark mode outright — the theme
   * attribute flipped and not one colour moved.
   */
  palette: Palette;
  paletteDark: Palette;
  fontDisplay: FaceId;
  fontBody: FaceId;
  /** Columns in the wardrobe grid on a phone. */
  density: number;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'system',
  palette: {},
  paletteDark: {},
  fontDisplay: 'garamond',
  fontBody: 'inter',
  density: 2,
};

/**
 * Push the whole of an appearance onto the document. Called at boot and after
 * every change; idempotent, so calling it twice costs nothing.
 */
export function applyAppearance(appearance: Partial<Appearance> = {}): void {
  const root = document.documentElement;
  const settings = { ...DEFAULT_APPEARANCE, ...appearance };

  // `system` means leave the attribute off entirely and let the media query
  // in tokens.css decide.
  if (settings.theme === 'light' || settings.theme === 'dark') {
    root.dataset.theme = settings.theme;
  } else {
    delete root.dataset.theme;
  }

  const palette = settings[resolveScheme(settings.theme) === 'dark' ? 'paletteDark' : 'palette'];

  // Clearing a key has to *remove* the property, not set it to empty: an
  // inline empty string still shadows the stylesheet, so the colour someone
  // chose once would otherwise stick around forever after they cleared it.
  for (const { id } of ALL_KEYS) {
    const value = palette?.[id];
    if (value) root.style.setProperty(`--color-${id}`, value);
    else root.style.removeProperty(`--color-${id}`);
  }

  root.style.setProperty('--font-display', FACES[settings.fontDisplay] ?? FACES.garamond);
  root.style.setProperty('--font-sans', FACES[settings.fontBody] ?? FACES.inter);
  root.style.setProperty('--wardrobe-columns', String(settings.density));
}

/** What `theme` actually comes out as once the phone has had its say. */
export function resolveScheme(theme: Appearance['theme']): Scheme {
  if (theme === 'light' || theme === 'dark') return theme;
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Which of the two stored palettes a given theme setting edits. */
export function paletteKeyFor(theme: Appearance['theme']): 'palette' | 'paletteDark' {
  return resolveScheme(theme) === 'dark' ? 'paletteDark' : 'palette';
}

/**
 * Resolve any CSS colour to the plain hex an `<input type="color">` can open
 * on. Canvas does the parsing, which saves this file from having to know
 * anything about colour syntax.
 */
export function toHex(value: string): string {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;

  const resolved = raw.startsWith('var(')
    ? getComputedStyle(document.documentElement).getPropertyValue(raw.slice(4, -1).trim()).trim()
    : raw;
  if (/^#[0-9a-f]{6}$/i.test(resolved)) return resolved;

  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return '#000000';
  probe.fillStyle = '#000000';
  probe.fillStyle = resolved || '#000000';
  return probe.fillStyle as string;
}

/** The colour a swatch should currently show for a token. */
export function currentColour(id: string): string {
  return toHex(`var(--color-${id})`);
}
