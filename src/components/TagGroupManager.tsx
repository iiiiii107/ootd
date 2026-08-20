import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { useCustomTags } from '../db/hooks';
import { addTagValue, createTagValue, deleteTagGroup, deleteTagValue, mergeTagValues, renameTagValue, tagUsageCount } from '../db/tags';
import type { CustomTag } from '../db/types';

/**
 * Create group, add/rename/delete values, merge two values, usage count per
 * tag (spec §4.2) — "the answer to 'I'm worried I forgot a tag.'" Any group
 * created here shows up in both the filter bar and the item editor with no
 * code changes, because both already render generically over `useGroups()`
 * (spec §15); this is the one piece that was still missing to prove it.
 */
export function TagGroupManager() {
  const tags = useCustomTags() ?? [];
  const [newGroupOpen, setNewGroupOpen] = useState(false);

  const groups = new Map<string, CustomTag[]>();
  for (const tag of tags) {
    const rows = groups.get(tag.groupName) ?? [];
    rows.push(tag);
    groups.set(tag.groupName, rows);
  }

  return (
    <div className="flex flex-col gap-4">
      {[...groups.entries()].map(([groupName, values]) => (
        <TagGroupCard key={groupName} groupName={groupName} values={values} />
      ))}

      {newGroupOpen ? (
        <NewGroupForm onDone={() => setNewGroupOpen(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setNewGroupOpen(true)}
          className="min-h-11 w-fit border border-rule px-3 text-[13px] text-ink"
        >
          + new tag group
        </button>
      )}
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
    <div className="border border-rule p-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold text-ink">{groupName}</p>
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
          <button type="button" onClick={() => void handleAddValue()} className="min-h-9 border border-rule px-2.5 text-[12px] text-ink">
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
            className="min-h-8 border border-rule bg-paper text-[11px] text-ink"
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
    <div className="flex flex-col gap-2 border border-rule p-3">
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
        className={`min-h-8 w-fit border px-2.5 text-[11px] ${multiSelect ? 'border-ink bg-ink text-paper' : 'border-rule text-muted'}`}
      >
        {multiSelect ? 'items can have several values' : 'items can only have one value'}
      </button>
      <div className="flex gap-2">
        <button type="button" onClick={() => void handleCreate()} className="min-h-9 flex-1 border border-ink text-[13px] text-ink">
          create
        </button>
        <button type="button" onClick={onDone} className="min-h-9 border border-rule px-3 text-[13px] text-muted">
          cancel
        </button>
      </div>
    </div>
  );
}
