import { archiveItem, outfitsReferencing, toggleFavorite, toggleWash, trashItem, updateItem } from '../db/items';
import { useItem } from '../db/hooks';
import { useGroups } from '../tags/useGroups';
import { useObjectUrl } from '../lib/useObjectUrl';
import { TagChipRow } from './TagChipRow';

function formatLastWorn(lastWornAt: number | null): string {
  if (lastWornAt == null) return 'never';
  return new Date(lastWornAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Full item detail (spec §7.2): image, editable name, every tag group as
 * chips, favourite, wash toggle, wear log, notes, archive, delete. Delete
 * runs the outfit-breakage check (spec §4.4) before trashing anything.
 */
export function DetailSheet({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const item = useItem(itemId);
  const groups = useGroups();
  const imageUrl = useObjectUrl(item?.image);

  if (!item) return null;

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
        <div className="max-h-[50vh] bg-sunken">
          {imageUrl && <img src={imageUrl} alt={item.name} className="mx-auto max-h-[50vh] object-contain" />}
        </div>

        <input
          type="text"
          value={item.name}
          onChange={(e) => void updateItem(item.id, { name: e.target.value })}
          className="min-h-11 border-b border-rule bg-transparent text-[20px] text-ink outline-none focus:border-ink"
        />

        <button
          type="button"
          onClick={() => void toggleWash(item.id)}
          aria-pressed={item.inWash}
          className={`min-h-8 w-fit border px-2.5 text-[11px] tracking-[0.08em] uppercase ${
            item.inWash ? 'border-ink bg-ink text-paper' : 'border-rule text-muted'
          }`}
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
            <p className="text-[11px] tracking-[0.08em] text-muted uppercase">Where</p>
            <input
              type="text"
              value={item.elsewhereNote}
              onChange={(e) => void updateItem(item.id, { elsewhereNote: e.target.value })}
              placeholder="e.g. at my parents'"
              className="min-h-11 border-b border-rule bg-transparent text-[14px] text-ink outline-none placeholder:text-muted focus:border-ink"
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] tracking-[0.08em] text-muted uppercase">Notes</p>
          <textarea
            value={item.notes}
            onChange={(e) => void updateItem(item.id, { notes: e.target.value })}
            rows={3}
            className="border border-rule bg-transparent p-2 text-[14px] text-ink outline-none focus:border-ink"
          />
        </div>

        <p className="text-[12px] text-muted">
          worn {item.wearCount}× · last {formatLastWorn(item.lastWornAt)}
        </p>

        <div className="flex gap-3 border-t border-rule pt-5">
          <button
            type="button"
            onClick={() => void archiveItem(item.id, !item.archived)}
            className="min-h-11 flex-1 border border-rule text-[13px] tracking-wide text-ink"
          >
            {item.archived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="min-h-11 flex-1 border border-rule text-[13px] tracking-wide text-accent"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
