import { useEffect, useRef, useState } from 'react';

const DELAY_MS = 400;

/**
 * A text field that updates on screen instantly but only writes to the
 * database once you stop typing.
 *
 * Every keystroke used to be its own Dexie write, and every write wakes every
 * live query in the app — each of which re-reads whole records, photo blobs
 * included. Typing a nine-character name meant nine full re-reads of the
 * wardrobe, which is a large part of why editing felt sticky.
 *
 * Returns the draft to display and a setter to call from `onChange`.
 */
export function useDebouncedText(
  committed: string,
  write: (value: string) => void,
  delay = DELAY_MS,
): readonly [string, (value: string) => void] {
  const [draft, setDraft] = useState(committed);
  const editing = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const writeRef = useRef(write);
  writeRef.current = write;

  // Adopt outside changes only while the user isn't mid-edit, so a live-query
  // refresh can't move the cursor or overwrite a half-typed word.
  useEffect(() => {
    if (!editing.current) setDraft(committed);
  }, [committed]);

  useEffect(() => {
    if (!editing.current) return;
    const timer = setTimeout(() => {
      editing.current = false;
      writeRef.current(draftRef.current);
    }, delay);
    return () => clearTimeout(timer);
  }, [draft, delay]);

  // Closing the sheet the instant after typing must not lose the last word,
  // so an unmount with a pending edit flushes it rather than dropping it.
  useEffect(
    () => () => {
      if (editing.current) writeRef.current(draftRef.current);
    },
    [],
  );

  return [
    draft,
    (value: string) => {
      editing.current = true;
      setDraft(value);
    },
  ] as const;
}
