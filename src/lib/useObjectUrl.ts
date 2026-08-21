import { useEffect, useState } from 'react';

/**
 * Object URLs, cached by a caller-chosen key.
 *
 * Dexie's live queries hand back freshly-read records on every write, so
 * editing one item's name produced brand-new `Blob` objects for *every* item
 * on screen. Keyed only on blob identity, each of those looked like a new
 * image: revoke, re-create, and make the browser decode the whole grid again
 * on every keystroke. That is the editing lag.
 *
 * Keying on the item instead means the same URL string comes back, React
 * leaves the `src` attribute alone, and nothing re-decodes.
 *
 * URLs are kept alive rather than reference-counted: a URL is a cheap handle
 * to a blob the live query is holding in memory anyway, and refcounting would
 * revoke on every re-render (cleanup runs before setup), which is exactly the
 * churn this exists to stop. An LRU bound keeps a long session from growing
 * without limit.
 */

const MAX_URLS = 400;
const cache = new Map<string, string>();

function urlFor(key: string, blob: Blob): string {
  const existing = cache.get(key);
  if (existing) {
    // Re-insert to mark it as recently used; Map iterates in insertion order.
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }

  const url = URL.createObjectURL(blob);
  cache.set(key, url);

  if (cache.size > MAX_URLS) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      const stale = cache.get(oldest);
      if (stale) URL.revokeObjectURL(stale);
      cache.delete(oldest);
    }
  }

  return url;
}

/**
 * A stable object URL for an item's image.
 *
 * The key should identify the *picture*, not the record: include the blob's
 * size so a genuinely replaced image gets a new URL, but nothing else, so
 * editing a name or a tag doesn't. Computed during render rather than in an
 * effect — it's idempotent through the cache, and it saves every tile a
 * second render just to learn its own `src`.
 */
export function useItemImageUrl(id: string, blob: Blob | undefined): string | undefined {
  return blob ? urlFor(`${id}:${blob.size}`, blob) : undefined;
}

/**
 * For one-off blobs with no stable identity — a photo mid-import that isn't
 * in the database yet. Revokes on unmount, since nothing else will.
 */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  return url;
}
