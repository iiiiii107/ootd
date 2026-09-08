import { DEFAULT_COLOUR_PREFERENCES, type ColourPreferences } from '../logic/colour';
import { getMeta, setMeta } from './meta';

/**
 * How the user wants colour judged.
 *
 * Two kinds of preference live here, and they are different in nature. The
 * *rules* are about colour theory — which pairings count as going together.
 * The *liked* colours are about taste — what this particular person reaches
 * for. Both are global and long-lived, which is why neither belongs in
 * `RandomizerFilters` alongside "favourites only": that is per-shuffle state.
 *
 * The switch that turns matching on and off *is* per-shuffle, and lives there.
 */
export const COLOUR_PREFERENCES_KEY = 'colourPreferences';

export async function getColourPreferences(): Promise<ColourPreferences> {
  const stored = await getMeta<Partial<ColourPreferences>>(COLOUR_PREFERENCES_KEY);
  return {
    ...DEFAULT_COLOUR_PREFERENCES,
    ...stored,
    // Nested, because a stored object written before a rule existed would
    // otherwise come back missing it — and a missing rule reads as `false`,
    // silently switching off something the user never turned off.
    rules: { ...DEFAULT_COLOUR_PREFERENCES.rules, ...stored?.rules },
  };
}

export async function updateColourPreferences(
  patch: Partial<ColourPreferences>,
): Promise<ColourPreferences> {
  const next = { ...(await getColourPreferences()), ...patch };
  await setMeta(COLOUR_PREFERENCES_KEY, next);
  return next;
}
