import { useState } from 'react';

import { useItem } from '../db/hooks';
import {
  archiveItem,
  outfitsReferencing,
  toggleFavorite,
  toggleWash,
  trashItem,
  updateItem,
} from '../db/items';
import { logWearToday } from '../db/wears';
import { useItemImageUrl } from '../lib/useObjectUrl';
import { useOutfitComposite } from '../lib/useOutfitComposite';
import { useDebouncedText } from '../lib/useDebouncedText';
import { useGroups } from '../tags/useGroups';
import { TagChipRow } from './TagChipRow';

function formatLastWorn(lastWornAt: number | null): string {
  if (lastWornAt == null) return 'never';
  return new Date(lastWornAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Same calendar day, not "within 24 hours" — the button is answering "have I
 * already logged this today", and an outfit worn yesterday evening should
 * still read as un-logged this morning.
 */
function wornToday(lastWornAt: number | null): boolean {
  if (lastWornAt == null) return false;
  return new Date(lastWornAt).toDateString() === new Date().toDateString();
}

/**
 * Full item detail (spec §7.2): image, editable name, every tag group as
 * chips, favourite, wash toggle, wear log, notes, archive, delete. Delete
 * runs the outfit-breakage check (spec §4.4) before trashing anything.
 *
 * Doubles as the outfit detail view (spec §7.3) — an item with `memberIds`
 * gets a "made from" row of its member pieces. Tapping one opens a second
 * DetailSheet for that member, nested on top of this one; there's no
 * per-item route to navigate to instead, so the sheet just recurses.
 */
export function DetailSheet({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const item = useItem(itemId);
  const groups = useGroups();
  // An outfit assembled from wardrobe pieces has no picture of its own, so
  // this composes one from its members; a photographed item returns its own
  // image untouched. One call site, both kinds.
  const imageUrl = useOutfitComposite(item, 'image');
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null);

  // Text fields write on a pause rather than per keystroke — see
  // src/lib/useDebouncedText.ts for why that matters this much here.
  const [name, setName] = useDebouncedText(item?.name ?? '', (value) =>
    void updateItem(itemId, { name: value }),
  );
  const [notes, setNotes] = useDebouncedText(item?.notes ?? '', (value) =>
    void updateItem(itemId, { notes: value }),
  );
  const [elsewhereNote, setElsewhereNote] = useDebouncedText(item?.elsewhereNote ?? '', (value) =>
    void updateItem(itemId, { elsewhereNote: value }),
  );

  if (!item) return null;

  /**
   * Logging an outfit records its *pieces*, not the outfit — the log is about
   * garments, so "when did I last wear this skirt" stays answerable whether
   * the skirt was worn alone or as part of a saved look. The outfit is kept
   * alongside as the thing that was chosen.
   */
  function logWear() {
    if (!item) return;
    const isOutfit = item.memberIds.length > 0;
    return logWearToday(isOutfit ? item.memberIds : [item.id], isOutfit ? item.id : null);
  }

  async function handleDelete() {
    if (!item) return;
    const broken = await outfitsReferencing(item.id);
    const message =
      broken.length > 0
        ? `This is used in ${broken.length} saved outfit${broken.length === 1 ? '' : 's'}. Deleting it will remove ${broken.length === 1 ? 'that outfit' : 'those outfits'} too.`
        : `Delete "${item.name}"? It moves to trash for 30 days before it's gone for good.`;
    if (!window.confirm(message)) return;
    await trashItem(item.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-paper">
      <div className="flex items-center justify-between border-b border-rule px-5 py-3">
        <button
          type="button"
          onClick={() => void toggleFavorite(item.id)}
          aria-pressed={item.favorite}
          className={`min-h-11 px-1 text-[20px] ${item.favorite ? 'text-ink' : 'text-muted'}`}
          aria-label={item.favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {item.favorite ? '♥' : '♡'}
        </button>
        <button type="button" onClick={onClose} className="min-h-11 px-2 text-[13px] text-muted">
          close
        </button>
      </div>

      <div className="flex flex-col gap-5 px-5 py-5 pb-10">
        <div className="max-h-[50vh] bg-paper">
          {imageUrl && <img src={imageUrl} alt={item.name} className="mx-auto max-h-[50vh] object-contain" />}
        </div>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-h-11 border-b border-rule bg-transparent text-[20px] text-ink outline-none focus:border-ink"
        />

        {item.memberIds.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[12px] font-medium text-muted">Made from</p>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {item.memberIds.map((memberId) => (
                <MemberThumb key={memberId} id={memberId} onTap={() => setViewingMemberId(memberId)} />
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => void toggleWash(item.id)}
          aria-pressed={item.inWash}
          className="rounded-chip min-h-8 w-fit border px-2.5 text-[12px]"
          style={
            item.inWash
              ? {
                  backgroundColor: 'var(--color-accent)',
                  borderColor: 'var(--color-accent)',
                  color: 'var(--color-on-tag)',
                }
              : { borderColor: 'var(--color-rule)', color: 'var(--color-muted)' }
          }
        >
          {item.inWash ? 'in the wash' : 'clean'}
        </button>

        {groups.map((group) => (
          <TagChipRow
            key={group.id}
            group={group}
            selected={group.getValues(item)}
            onToggle={(value) => void updateItem(item.id, group.toggle(item, value))}
          />
        ))}

        {item.location === 'elsewhere' && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[12px] font-medium text-muted">Where</p>
            <input
              type="text"
              value={elsewhereNote}
              onChange={(e) => setElsewhereNote(e.target.value)}
              placeholder="e.g. at my parents'"
              className="min-h-11 border-b border-rule bg-transparent text-[14px] text-ink outline-none placeholder:text-muted focus:border-ink"
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <p className="text-[12px] font-medium text-muted">Notes</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="rounded-chip border border-rule bg-transparent p-2 text-[14px] text-ink outline-none focus:border-ink"
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-rule pt-5">
          <button
            type="button"
            onClick={() => void logWear()}
            className="min-h-11 rounded-chip border border-ink text-[13px] tracking-wide text-ink"
          >
            {wornToday(item.lastWornAt) ? 'Worn today ✓' : 'I wore this'}
          </button>
          <p className="text-[12px] text-muted">
            worn {item.wearCount}× · last {formatLastWorn(item.lastWornAt)}
            {item.memberIds.length > 0 && ' · counts for every piece in it'}
          </p>
        </div>

        <div className="flex gap-3 border-t border-rule pt-5">
          <button
            type="button"
            onClick={() => void archiveItem(item.id, !item.archived)}
            className="min-h-11 flex-1 rounded-chip border border-rule text-[13px] tracking-wide text-ink"
          >
            {item.archived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="min-h-11 flex-1 rounded-chip border border-rule text-[13px] tracking-wide text-accent"
          >
            Delete
          </button>
        </div>
      </div>

      {viewingMemberId && (
        <DetailSheet itemId={viewingMemberId} onClose={() => setViewingMemberId(null)} />
      )}
    </div>
  );
}

/** One "made from" thumbnail. A member can be trashed independently of the outfit that used it, hence the guard. */
function MemberThumb({ id, onTap }: { id: string; onTap: () => void }) {
  const member = useItem(id);
  const url = useItemImageUrl(id, member?.thumb);

  if (!member) {
    return <p className="shrink-0 self-center text-[11px] text-muted italic">removed piece</p>;
  }

  return (
    <button type="button" onClick={onTap} className="flex w-20 shrink-0 flex-col gap-1 text-left">
      <div className="aspect-square bg-paper">
        {url && <img src={url} alt={member.name} className="h-full w-full object-cover" />}
      </div>
      <p className="truncate text-[11px] text-muted">{member.name}</p>
    </button>
  );
}

