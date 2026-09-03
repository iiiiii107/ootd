import { useEffect, useRef, useState } from 'react';

import { ScreenTitle } from '../components/ScreenTitle';
import { TagGroupManager } from '../components/TagGroupManager';
import { updateAppearance } from '../db/appearance';
import { exportBackup, importBackup } from '../db/backup';
import {
  useAppearance,
  useArchivedItems,
  useAutoDetectEnabled,
  useCutoutEnabled,
  useTrashedItems,
} from '../db/hooks';
import { archiveItem, deleteEverything, emptyTrash, hardDeleteItem, restoreItem } from '../db/items';
import { setMeta } from '../db/meta';
import {
  currentColour,
  DENSITIES,
  FACE_LABELS,
  FACES,
  PALETTE_KEYS,
  paletteKeyFor,
  PRESETS,
  resolveScheme,
  TAG_KEYS,
  type Appearance,
  type FaceId,
} from '../design/theme';
import { useObjectUrl } from '../lib/useObjectUrl';

/**
 * Settings (spec §7.5): tag groups, export/import backup, storage used,
 * background-removal toggle, trash, archived items, delete everything.
 * Reached from the gear icon in the app shell (src/components/Layout.tsx) —
 * it isn't one of the four main tabs.
 */
export default function Settings() {
  return (
    <div className="flex flex-col gap-8 px-4 pb-10">
      <ScreenTitle>settings</ScreenTitle>

      <AppearanceSection />
      <StorageSection />
      <CutoutSection />
      <BackupSection />

      <Section title="Tag groups">
        <TagGroupManager />
      </Section>

      <ArchivedSection />
      <TrashSection />
      <DangerZone />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[15px] font-display font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function StorageSection() {
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);

  useEffect(() => {
    if (!navigator.storage?.estimate) return;
    void navigator.storage.estimate().then((estimate) => {
      setUsage({ used: estimate.usage ?? 0, quota: estimate.quota ?? 0 });
    });
  }, []);

  return (
    <Section title="Storage">
      <p className="text-[13px] text-muted">
        {usage
          ? `${formatBytes(usage.used)} used${usage.quota ? ` of ${formatBytes(usage.quota)} available` : ''}`
          : 'Not available in this browser.'}
      </p>
    </Section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CutoutSection() {
  const cutout = useCutoutEnabled();
  const detect = useAutoDetectEnabled();

  return (
    <Section title="Photos">
      <Toggle
        on={detect}
        onLabel="Finding clothes automatically"
        offLabel="Automatic detection off"
        onClick={() => void setMeta('autoDetectEnabled', !detect)}
      />
      <p className="text-[12px] leading-relaxed text-muted">
        Draws the crop box around the garment for you when you add a photo. You can always drag it
        yourself, or turn this off to start from the whole frame every time.
      </p>

      <Toggle
        on={cutout}
        onLabel="Removing backgrounds automatically"
        offLabel="Background removal off"
        onClick={() => void setMeta('backgroundRemovalEnabled', !cutout)}
      />
      <p className="text-[12px] leading-relaxed text-muted">
        Both of these run entirely on this device, and share the same work — having both on is no
        slower than one.{' '}
        {cutout || detect
          ? 'The first photo downloads a one-time ~40MB model file.'
          : 'With both off, no model is downloaded at all.'}
      </p>
    </Section>
  );
}

/**
 * Appearance (the family's own settings pattern, shared with cookbook and the
 * two spare apps): every choice here is written onto `<html>` as a custom
 * property or a data attribute, and nothing in the app reads these settings
 * for styling. That is what makes "pick your own colours" one small module
 * rather than a special case in every component — any token can be overridden
 * and every rule using it follows, including ones written later.
 */
function AppearanceSection() {
  const appearance = useAppearance();
  const set = (patch: Partial<Appearance>) => void updateAppearance(patch);

  // Colours are stored per scheme, so the swatches edit whichever one is
  // actually on screen. Editing in the dark and having a daylight colour
  // change instead would be indistinguishable from the control being broken.
  const key = paletteKeyFor(appearance.theme);
  const palette = appearance[key];
  const scheme = resolveScheme(appearance.theme);

  const swatches = (keys: readonly { id: string; label: string; hint?: string }[]) => (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {keys.map(({ id, label, hint }) => (
        <label key={id} className="flex min-h-11 items-center gap-2.5 text-[13px] text-ink">
          <input
            type="color"
            aria-label={label}
            value={palette[id] ?? currentColour(id)}
            onChange={(e) => set({ [key]: { ...palette, [id]: e.target.value } })}
            className="h-7 w-7 shrink-0 cursor-pointer rounded-full border border-rule bg-transparent p-0"
          />
          <span className="min-w-0">
            {label}
            {hint && <span className="block text-[11px] text-muted">{hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );

  return (
    <Section title="Appearance">
      <Segmented
        label="Theme"
        options={[
          { id: 'system', label: 'Auto' },
          { id: 'light', label: 'Light' },
          { id: 'dark', label: 'Dark' },
        ]}
        value={appearance.theme}
        onChange={(id) => set({ theme: id as Appearance['theme'] })}
      />
      <p className="text-[12px] leading-relaxed text-muted">
        Auto follows your phone. The other two override it, so a light wardrobe stays light on a
        phone that has gone dark for the evening.
      </p>

      <p className="pt-1 text-[12px] leading-relaxed text-muted">
        A palette sets both a daylight and a night version, so a choice made now still reads when
        the phone goes dark. The swatches below edit the {scheme === 'dark' ? 'night' : 'daylight'}{' '}
        one, which is the set you are looking at.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(PRESETS).map(([id, preset]) => (
          <button
            key={id}
            type="button"
            onClick={() => set({ palette: { ...preset.light }, paletteDark: { ...preset.dark } })}
            className="rounded-chip min-h-9 border border-rule px-3 text-[12px] text-ink"
          >
            {preset.label}
          </button>
        ))}
      </div>
      {swatches(PALETTE_KEYS)}

      <p className="pt-1 text-[12px] leading-relaxed text-muted">
        The six colours a tag group can own. A group wears its colour on its label and on the chips
        you have selected, which is what tells season from formality at a glance.
      </p>
      {swatches(TAG_KEYS)}

      <button
        type="button"
        onClick={() => set({ palette: {}, paletteDark: {} })}
        className="min-h-9 w-fit text-[12px] text-muted underline underline-offset-4"
      >
        Back to the original colours
      </button>

      <Segmented
        label="Headings"
        options={faceOptions()}
        value={appearance.fontDisplay}
        onChange={(id) => set({ fontDisplay: id as FaceId })}
      />
      <Segmented
        label="Body"
        options={faceOptions()}
        value={appearance.fontBody}
        onChange={(id) => set({ fontBody: id as FaceId })}
      />
      <Segmented
        label="Garment size"
        options={DENSITIES.map((d) => ({ id: String(d.id), label: d.label }))}
        value={String(appearance.density)}
        onChange={(id) => set({ density: Number(id) })}
      />
      <p className="text-[12px] leading-relaxed text-muted">
        How many garments sit across the wardrobe grid on a phone. On a wider screen the screen
        decides instead.
      </p>
    </Section>
  );
}

function faceOptions() {
  return (Object.keys(FACES) as FaceId[]).map((id) => ({ id, label: FACE_LABELS[id] }));
}

/** One row of mutually exclusive choices — the shape every appearance control takes. */
function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              aria-pressed={active}
              className="rounded-chip min-h-9 border px-3 text-[13px]"
              style={
                active
                  ? {
                      backgroundColor: 'var(--color-on)',
                      borderColor: 'var(--color-on)',
                      color: 'var(--color-on-tag)',
                    }
                  : { borderColor: 'var(--color-rule)', color: 'var(--color-ink)' }
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({
  on,
  onLabel,
  offLabel,
  onClick,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="rounded-chip min-h-11 w-fit border px-3 text-[13px]"
      style={
        on
          ? {
              backgroundColor: 'var(--color-on)',
              borderColor: 'var(--color-on)',
              color: 'var(--color-on-tag)',
            }
          : { borderColor: 'var(--color-rule)', color: 'var(--color-ink)' }
      }
    >
      {on ? onLabel : offLabel}
    </button>
  );
}

function BackupSection() {
  const [status, setStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setStatus('Exporting…');
    try {
      const blob = await exportBackup();
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ootd-backup-${date}.ootd`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Exported ✓ — save it somewhere like iCloud Drive.');
    } catch {
      setStatus('Export failed. Try again.');
    }
  }

  async function handleImportFile(file: File) {
    setStatus('Importing…');
    try {
      const summary = await importBackup(file);
      setStatus(`Imported ${summary.itemCount} item${summary.itemCount === 1 ? '' : 's'} and ${summary.tagCount} tag${summary.tagCount === 1 ? '' : 's'}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'That file could not be read as an ootd backup.');
    }
  }

  return (
    <Section title="Backup">
      <p className="text-[12px] leading-relaxed text-muted">
        Your wardrobe lives only on this device. Export a backup regularly and keep it somewhere
        safe — re-photographing everything is not a fun afternoon.
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={() => void handleExport()} className="min-h-11 flex-1 rounded-chip border border-ink text-[13px] text-ink">
          Export backup
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="min-h-11 flex-1 rounded-chip border border-rule text-[13px] text-ink"
        >
          Import backup
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ootd,.zip"
          className="hidden"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (file) void handleImportFile(file);
          }}
        />
      </div>
      {status && <p className="text-[12px] text-muted">{status}</p>}
    </Section>
  );
}

function ArchivedSection() {
  const items = useArchivedItems() ?? [];

  return (
    <Section title={`Archived${items.length > 0 ? ` (${items.length})` : ''}`}>
      {items.length === 0 ? (
        <p className="text-[13px] text-muted">Nothing archived.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-chip border border-rule p-2">
              <MiniThumb blob={item.thumb} name={item.name} />
              <p className="flex-1 truncate text-[13px] text-ink">{item.name}</p>
              <button
                type="button"
                onClick={() => void archiveItem(item.id, false)}
                className="min-h-9 rounded-chip border border-rule px-2.5 text-[11px] text-ink"
              >
                unarchive
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function TrashSection() {
  const items = useTrashedItems() ?? [];

  async function handleEmptyTrash() {
    if (!window.confirm(`Permanently delete all ${items.length} trashed item${items.length === 1 ? '' : 's'} now? This can't be undone.`)) return;
    await emptyTrash();
  }

  async function handleDeleteNow(id: string, name: string) {
    if (!window.confirm(`Permanently delete "${name}" now, instead of waiting out the 30 days? This can't be undone.`)) return;
    await hardDeleteItem(id);
  }

  return (
    <Section title={`Trash${items.length > 0 ? ` (${items.length})` : ''}`}>
      {items.length === 0 ? (
        <p className="text-[13px] text-muted">Empty. Deleted items wait here 30 days before they're gone for good.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 rounded-chip border border-rule p-2">
                <MiniThumb blob={item.thumb} name={item.name} />
                <p className="flex-1 truncate text-[13px] text-ink">{item.name}</p>
                <button
                  type="button"
                  onClick={() => void restoreItem(item.id)}
                  className="min-h-9 rounded-chip border border-rule px-2.5 text-[11px] text-ink"
                >
                  restore
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteNow(item.id, item.name)}
                  className="min-h-9 rounded-chip border border-rule px-2.5 text-[11px] text-accent"
                >
                  delete now
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => void handleEmptyTrash()} className="min-h-9 w-fit text-[12px] text-accent underline underline-offset-4">
            empty trash
          </button>
        </>
      )}
    </Section>
  );
}

function DangerZone() {
  const [confirmText, setConfirmText] = useState('');

  async function handleDeleteEverything() {
    await deleteEverything();
    setConfirmText('');
  }

  return (
    <Section title="Delete everything">
      <p className="text-[12px] leading-relaxed text-muted">
        Removes every item and every custom tag, permanently, right now — not even the 30-day
        trash applies. Type DELETE to enable this.
      </p>
      <div className="flex gap-3">
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          className="min-h-11 flex-1 border-b border-rule bg-transparent px-1 text-[13px] text-ink outline-none focus:border-ink"
        />
        <button
          type="button"
          disabled={confirmText !== 'DELETE'}
          onClick={() => void handleDeleteEverything()}
          className="min-h-11 rounded-chip border border-accent px-3 text-[13px] text-accent disabled:opacity-40"
        >
          Delete everything
        </button>
      </div>
    </Section>
  );
}

function MiniThumb({ blob, name }: { blob: Blob | null; name: string }) {
  const url = useObjectUrl(blob);
  return (
    <div className="h-12 w-12 shrink-0 bg-paper">
      {url && <img src={url} alt={name} className="h-full w-full object-cover" />}
    </div>
  );
}
