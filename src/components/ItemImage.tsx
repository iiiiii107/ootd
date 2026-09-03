import { useEffect, useState } from 'react';

import type { Item } from '../db/types';
import { dropItemImageUrl, useItemImageUrl } from '../lib/useObjectUrl';

/**
 * A garment's picture, with recovery when its object URL goes stale.
 *
 * Object URLs are cached and long-lived on purpose (src/lib/useObjectUrl.ts):
 * that is what stops one keystroke re-decoding every tile on screen. The cost
 * is that a URL can stop working while the blob behind it is perfectly fine —
 * WebKit backs an IndexedDB blob with a file, and a long-held URL can be
 * invalidated when the system reclaims memory. The tile then shows a
 * broken-image mark for a photo that is not lost at all.
 *
 * Reported from a real phone, and diagnosable precisely because the same
 * garment still drew correctly inside an outfit composite — which builds a
 * fresh URL every time and never touches the cache.
 *
 * So: on failure, drop the cached URL and ask for a new one. If a second
 * attempt also fails the thumbnail itself is suspect, and the full-size image
 * is tried instead, which is a different blob entirely.
 */
export function ItemImage({
  item,
  alt,
  className,
  lazy = true,
}: {
  item: Item;
  alt?: string;
  className?: string;
  lazy?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const useFullImage = attempt > 1;
  const blob = useFullImage ? item.image : item.thumb;
  const url = useItemImageUrl(useFullImage ? `${item.id}:full` : item.id, blob, attempt);

  // A replaced photo is a fresh start: the old failure says nothing about it.
  useEffect(() => {
    setAttempt(0);
  }, [item.thumb, item.image]);

  if (!url) return null;

  return (
    <img
      src={url}
      alt={alt ?? item.name}
      className={className}
      loading={lazy ? 'lazy' : undefined}
      onError={() => {
        dropItemImageUrl(useFullImage ? `${item.id}:full` : item.id, blob, attempt);
        // Two retries: one for a stale URL, one falling back to the full-size
        // image. Past that, stop — a third would loop on a genuinely
        // undecodable photo, and an empty tile beats a flickering one.
        if (attempt < 2) setAttempt((n) => n + 1);
      }}
    />
  );
}
