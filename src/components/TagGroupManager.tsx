import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { useCustomTags, useEnabledGroups } from '../db/hooks';
import { isAlwaysOn, setGroupEnabled } from '../db/groupSettings';
import { BUILTIN_GROUPS, type TagGroup } from '../tags/groups';
import { addTagValue, createTagValue, deleteTagGroup, deleteTagValue, mergeTagValues, renameTagValue, tagUsageCount } from '../db/tags';
import type { CustomTag } from '../db/types';

/**
 * Every way this wardrobe can be sorted, in one list.
 *
 * Built-in and home-made groups sit together and are presented as the same
 * kind of thing, because to the person using the app they are: a name, some
 * values, and clothes tagged with them. Both show up in the filter bar, the
 * item editor, the randomizer's filter rows and the analytics breakdowns,
 * and none of those name a group directly (spec §15).
 *
 * The difference that remains is about values, not status. A built-in's
 * values are fixed because the randomizer's pairing rules are keyed to them
 * — `winter`, `plain`, `loose` mean something to `pickOutfit`, and a renamed
 * `winter` would quietly stop matching. A custom group's values are free
 * text precisely because nothing depends on them.
 *
 * Removing a built-in hides it rather than erasing it: the tags stay on the
 * clothes, so bringing it back is one tap and costs nothing. Deleting a
 * custom group really does delete its values, which is why that one asks.
 */
export function TagGroupManager() {
  const tags = useCustomTags() ?? [];
  const enabled = useEnabledGroups();
  const [newGroupOpen, setNewGroupOpen] = useState(false);

  const groups = new Map<string, CustomTag[]>();
  for (const tag of tags) {
    const rows = groups.get(tag.groupName) ?? [];
    rows.push(tag);
    groups.set(tag.groupName, rows);
  }

  const inUse = BUILTIN_GROUPS.filter((g) => isAlwaysOn(g.id) || enabled[g.id] !== false);
  const removed = BUILTIN_GROUPS.filter((g) => !isAlwaysOn(g.id) && enabled[g.id] === false);

  return (
    <div className="flex flex-col gap-4">
      {inUse.map((group) => (
        <BuiltinGroupCard key={group.id} group={group} />
      ))}

      {[...groups.entries()].map(([groupName, values]) => (
        <TagGroupCard key={groupName} groupName={groupName} values={values} />
      ))}

      {newGroupOpen ? (
        <NewGroupForm onDone={() => setNewGroupOpen(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setNewGroupOpen(true)}
          className="min-h-11 w-fit rounded-chip border border-rule px-3 text-[13px] text-ink"
        >
          + new tag group
        </button>
      )}

      {removed.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-rule pt-4">
          <p className="text-[12px] text-muted">
            Removed. Your clothes kept these tags, so bringing one back restores everything it
            had.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {removed.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => void setGroupEnabled(group.id, true)}
                className="rounded-chip min-h-8 border border-rule px-2.5 text-[12px] text-muted"
              >
                + {group.label.toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A built-in group. Its values are shown but not editable — see the note on
 * `TagGroupManager` for why that is about pairing rather than about built-ins
 * being privileged.
 */
function BuiltinGroupCard({ group }: { group: TagGroup }) {
  const alwaysOn = isAlwaysOn(group.id);

  async function handleRemove() {
    const message =
      `Remove "${group.label}"? It disappears from the filters, the randomizer and ` +
      `tagging. Your clothes keep the tags, and you can bring it back any time.`;
    if (!window.confirm(message)) return;
    await setGroupEnabled(group.id, false);
  }

  return (
    <div className="rounded-chip border border-rule p-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium" style={{ color: `var(${group.hue})` }}>
          {group.label}
        </p>
        {alwaysOn ? (
          <span className="px-2 text-[11px] text-muted">always on</span>
        ) : (
          <button
            type="button"
            onClick={() => void handleRemove()}
            className="min-h-8 px-2 text-[11px] text-accent"
          >
            remove
          </button>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-muted">
        {alwaysOn
          ? 'every garment needs one'
          : 'built in — the randomizer matches on these, so the values are fixed'}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {group.options.map((option) => (
          <span
            key={option.value}
            className="rounded-chip border border-rule px-2.5 py-1 text-[12px] text-muted"
          >
            {option.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function TagGroupCard({ groupName, values }: { groupName: string; values: CustomTag[] }) {
  const [addingValue, setAddingValue] = useState(false);
  const [newValue, setNewValue] = useState('');

  async function handleAddValue() {
    const label = newValue.trim();
    if (!label) return;
    await addTagValue(groupName, label);
    setNewValue('');
    setAddingValue(false);
  }

  async function handleDeleteGroup() {
    if (!window.confirm(`Delete the whole "${groupName}" group and all its values? Items keep their other tags.`)) return;
    await deleteTagGroup(groupName);
  }

  return (
    <div className="rounded-chip border border-rule p-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-ink">{groupName}</p>
        <button type="button" onClick={() => void handleDeleteGroup()} className="min-h-8 px-2 text-[11px] text-accent">
          delete group
        </button>
      </div>
      <p className="mt-0.5 text-[11px] text-muted">{values[0]?.multiSelect ? 'multi-select' : 'single-select'}</p>

      <ul className="mt-3 flex flex-col gap-2">
        {values
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((tag) => (
            <TagValueRow key={tag.id} tag={tag} siblings={values.filter((v) => v.id !== tag.id)} />
          ))}
      </ul>

      {addingValue ? (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            autoFocus
            placeholder="new value"
            className="min-h-9 flex-1 border-b border-rule bg-transparent px-1 text-[13px] text-ink outline-none focus:border-ink"
          />
          <button type="button" onClick={() => void handleAddValue()} className="min-h-9 rounded-chip border border-rule px-2.5 text-[12px] text-ink">
            add
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingValue(true)}
          className="mt-3 min-h-8 text-[12px] text-muted underline underline-offset-4"
        >
          + add value
        </button>
      )}
    </div>
  );
}

function TagValueRow({ tag, siblings }: { tag: CustomTag; siblings: CustomTag[] }) {
  const usage = useLiveQuery(() => tagUsageCount(tag.id), [tag.id]);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(tag.label);
  const [merging, setMerging] = useState(false);

  async function handleRename() {
    const trimmed = label.trim();
    if (trimmed && trimmed !== tag.label) await renameTagValue(tag.id, trimmed);
    setEditing(false);
  }

  async function handleDelete() {
    const count = usage ?? 0;
    const message =
      count > 0
        ? `Delete "${tag.label}"? It'll be removed from ${count} item${count === 1 ? '' : 's'}.`
        : `Delete "${tag.label}"?`;
    if (!window.confirm(message)) return;
    await deleteTagValue(tag.id);
  }

  async function handleMergeInto(targetId: string) {
    await mergeTagValues(tag.id, targetId);
    setMerging(false);
  }

  return (
    <li className="flex items-center gap-2 text-[13px]">
      {editing ? (
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => void handleRename()}
          onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          autoFocus
          className="min-h-8 flex-1 border-b border-rule bg-transparent px-1 text-ink outline-none focus:border-ink"
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="min-h-8 flex-1 text-left text-ink">
          {tag.label}
        </button>
      )}

      <span className="text-[11px] text-muted">{usage ?? '…'} item{usage === 1 ? '' : 's'}</span>

      {siblings.length > 0 &&
        (merging ? (
          <select
            autoFocus
            onChange={(e) => e.target.value && void handleMergeInto(e.target.value)}
            onBlur={() => setMerging(false)}
            className="min-h-8 rounded-chip border border-rule bg-paper text-[11px] text-ink"
            defaultValue=""
          >
            <option value="" disabled>
              merge into…
            </option>
            {siblings.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        ) : (
          <button type="button" onClick={() => setMerging(true)} className="min-h-8 px-1 text-[11px] text-muted underline underline-offset-4">
            merge
          </button>
        ))}

      <button type="button" onClick={() => void handleDelete()} className="min-h-8 px-1 text-[11px] text-accent">
        delete
      </button>
    </li>
  );
}

function NewGroupForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [firstValue, setFirstValue] = useState('');
  const [multiSelect, setMultiSelect] = useState(true);

  async function handleCreate() {
    const groupName = name.trim();
    const label = firstValue.trim();
    if (!groupName || !label) return;
    await createTagValue(groupName, label, multiSelect);
    onDone();
  }

  return (
    <div className="flex flex-col gap-2 rounded-chip border border-rule p-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        placeholder="group name, e.g. Fabric"
        className="min-h-9 border-b border-rule bg-transparent px-1 text-[13px] text-ink outline-none focus:border-ink"
      />
      <input
        type="text"
        value={firstValue}
        onChange={(e) => setFirstValue(e.target.value)}
        placeholder="first value, e.g. wool"
        className="min-h-9 border-b border-rule bg-transparent px-1 text-[13px] text-ink outline-none focus:border-ink"
      />
      <button
        type="button"
        onClick={() => setMultiSelect(!multiSelect)}
        aria-pressed={multiSelect}
        className="rounded-chip min-h-8 w-fit border px-2.5 text-[11px]"
        style={
          multiSelect
            ? {
                backgroundColor: 'var(--color-on)',
                borderColor: 'var(--color-on)',
                color: 'var(--color-on-tag)',
              }
            : { borderColor: 'var(--color-rule)', color: 'var(--color-muted)' }
        }
      >
        {multiSelect ? 'items can have several values' : 'items can only have one value'}
      </button>
      <div className="flex gap-2">
        <button type="button" onClick={() => void handleCreate()} className="min-h-9 flex-1 rounded-chip border border-ink text-[13px] text-ink">
          create
        </button>
        <button type="button" onClick={onDone} className="min-h-9 rounded-chip border border-rule px-3 text-[13px] text-muted">
          cancel
        </button>
      </div>
    </div>
  );
}
