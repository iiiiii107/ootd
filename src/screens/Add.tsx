import { useRef, useState } from 'react';

import { ScreenTitle } from '../components/ScreenTitle';
import { createItem, suggestName, updateItem } from '../db/items';
import type { Category } from '../db/types';
import { importPhoto } from '../images/pipeline';
import { useObjectUrl } from '../lib/useObjectUrl';

type Status = 'processing' | 'done' | 'error';

interface QueueEntry {
  key: string;
  file: File;
  status: Status;
  category: Category;
  name: string;
  /** False until the user edits the auto-generated name by hand. */
  nameIsCustom: boolean;
  thumb?: Blob;
  itemId?: string;
  error?: string;
}

const CATEGORIES: Category[] = ['top', 'bottom', 'other', 'outfit'];

/**
 * Camera or library picker, multi-select → processing queue → tagging
 * (spec §7.4). Tagging beyond category is never mandatory: every photo saves
 * to the database as soon as it is processed, category and name are the only
 * fields set here, and everything else waits under "needs tagging" (Phase 2).
 *
 * Photos are processed strictly one at a time (spec R3) — the queue is a
 * `for` loop over one `await importPhoto(...)` at a time, never `Promise.all`.
 */
export default function Add() {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  // Carries the last-chosen category to the next photo, so five tops in a
  // row don't each need re-selecting (spec §7.4's "same tags as previous").
  const lastCategory = useRef<Category>('top');

  function patchEntry(key: string, patch: Partial<QueueEntry>) {
    setQueue((q) => q.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const entries: QueueEntry[] = Array.from(files).map((file) => ({
      key: crypto.randomUUID(),
      file,
      status: 'processing',
      category: lastCategory.current,
      name: '',
      nameIsCustom: false,
    }));
    setQueue((q) => [...entries, ...q]);
    setIsProcessing(true);
    for (const entry of entries) {
      try {
        const { image, thumb, dominantColor } = await importPhoto(entry.file);
        const item = await createItem({ category: entry.category, image, thumb, dominantColor });
        patchEntry(entry.key, { status: 'done', thumb, itemId: item.id, name: item.name });
      } catch (err) {
        patchEntry(entry.key, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Could not read this photo.',
        });
      }
    }
    setIsProcessing(false);
  }

  async function changeCategory(entry: QueueEntry, category: Category) {
    lastCategory.current = category;
    if (!entry.itemId) {
      patchEntry(entry.key, { category });
      return;
    }
    // The auto-generated name is category-derived ("Top 14"); re-suggest it
    // so it stays consistent, but only while the user hasn't typed their own.
    const name = entry.nameIsCustom ? entry.name : await suggestName(category);
    await updateItem(entry.itemId, { category, name });
    patchEntry(entry.key, { category, name });
  }

  async function changeName(entry: QueueEntry, name: string) {
    patchEntry(entry.key, { name, nameIsCustom: true });
    if (entry.itemId) await updateItem(entry.itemId, { name });
  }

  return (
    <div className="flex flex-col gap-5 px-5 pb-10">
      <ScreenTitle>add</ScreenTitle>

      <div className="flex gap-3">
        <PickerButton label="Take photo" capture accept="image/*" onFiles={handleFiles} />
        <PickerButton label="Choose photos" multiple accept="image/*" onFiles={handleFiles} />
      </div>

      {queue.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-muted">
          Photos save as soon as they&rsquo;re processed. Category is the only required tag —
          everything else can be finished later from the wardrobe.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {queue.map((entry) => (
            <QueueCard
              key={entry.key}
              entry={entry}
              onCategoryChange={(category) => void changeCategory(entry, category)}
              onNameChange={(name) => void changeName(entry, name)}
            />
          ))}
        </ul>
      )}

      {isProcessing && (
        <p className="text-[11px] tracking-[0.1em] text-muted uppercase">Processing…</p>
      )}
    </div>
  );
}

function PickerButton({
  label,
  onFiles,
  multiple,
  capture,
  accept,
}: {
  label: string;
  onFiles: (files: FileList | null) => void;
  multiple?: boolean;
  capture?: boolean;
  accept: string;
}) {
  return (
    <label className="flex min-h-11 flex-1 cursor-pointer items-center justify-center border border-rule text-[13px] tracking-wide text-ink">
      {label}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        capture={capture ? 'environment' : undefined}
        className="hidden"
        onChange={(e) => {
          const input = e.currentTarget;
          onFiles(input.files);
          input.value = '';
        }}
      />
    </label>
  );
}

function QueueCard({
  entry,
  onCategoryChange,
  onNameChange,
}: {
  entry: QueueEntry;
  onCategoryChange: (category: Category) => void;
  onNameChange: (name: string) => void;
}) {
  const url = useObjectUrl(entry.thumb);

  return (
    <li className="flex gap-3 border border-rule p-3">
      <div className="h-20 w-20 shrink-0 bg-sunken">
        {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {entry.status === 'processing' && (
          <p className="text-[13px] text-muted">Processing…</p>
        )}
        {entry.status === 'error' && (
          <p className="text-[13px] text-accent">{entry.error}</p>
        )}
        {entry.status === 'done' && (
          <>
            <input
              type="text"
              value={entry.name}
              onChange={(e) => onNameChange(e.target.value)}
              className="min-h-11 border-b border-rule bg-transparent text-[15px] text-ink outline-none focus:border-ink"
            />
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => onCategoryChange(category)}
                  className={`min-h-8 border px-2.5 text-[11px] tracking-[0.06em] uppercase ${
                    entry.category === category
                      ? 'border-ink text-ink'
                      : 'border-rule text-muted'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </li>
  );
}
