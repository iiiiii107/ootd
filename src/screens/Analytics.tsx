import { useMemo, useState } from 'react';

import { DetailSheet } from '../components/DetailSheet';
import { ItemImage } from '../components/ItemImage';
import { ScreenTitle } from '../components/ScreenTitle';
import { useWardrobeItems, useWears } from '../db/hooks';
import type { Item } from '../db/types';
import { localDateKey } from '../db/wears';
import {
  colourPairings,
  leastWorn,
  monthsAgoKey,
  mostWorn,
  neverWorn,
  tagBreakdown,
  tallyWears,
  wardrobeUsage,
  wearsPerMonth,
  type WearTally,
} from '../logic/stats';
import { useGroups } from '../tags/useGroups';

/**
 * What your wearing habits actually look like.
 *
 * Reached from both Wardrobe and Outfits rather than living in a tab: it is
 * something you open on purpose now and then, not daily, and the bottom bar is
 * already tight on a phone.
 *
 * Every number here is computed from the wear log by `src/logic/stats.ts`,
 * which is pure and tested. This file only arranges them.
 */
export default function Analytics() {
  const items = useWardrobeItems();
  const wears = useWears();
  const groups = useGroups();
  const todayKey = localDateKey();
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!items || !wears) return null;
    const tallies = tallyWears(items, wears, todayKey);
    return {
      tallies,
      most: mostWorn(tallies),
      least: leastWorn(tallies),
      never: neverWorn(tallies),
      month: wardrobeUsage(items, wears, monthsAgoKey(todayKey, 1), todayKey),
      season: wardrobeUsage(items, wears, monthsAgoKey(todayKey, 3), todayKey),
      months: wearsPerMonth(wears, todayKey),
      pairings: colourPairings(items, wears, todayKey),
    };
  }, [items, wears, todayKey]);

  if (!stats) return null; // first read; avoids a flash of empty sections

  const loggedDays = stats.months.reduce((n, m) => n + m.days, 0);
  const busiest = Math.max(1, ...stats.months.map((m) => m.days));

  return (
    <div className="flex flex-col gap-8 px-4 pb-10">
      <ScreenTitle>habits</ScreenTitle>

      {loggedDays === 0 ? (
        <p className="py-16 text-center text-[13px] leading-relaxed text-muted">
          Nothing to count yet. Log a few days from the ootds calendar and this
          fills in.
        </p>
      ) : (
        <>
          <Section title="In rotation">
            <div className="flex gap-6">
              <Fraction label="in the last month" {...stats.month} />
              <Fraction label="in the last three" {...stats.season} />
            </div>
            <p className="text-[12px] leading-relaxed text-muted">
              How much of the wardrobe you have actually reached for. Archived
              clothes are left out — what you no longer own should not count
              against you.
            </p>
          </Section>

          {stats.most.length > 0 && (
            <Section title="Worn most">
              <Ranking tallies={stats.most} onTap={setOpenItemId} />
            </Section>
          )}

          {stats.least.length > 0 && (
            <Section title="Worn least">
              <Ranking tallies={stats.least} onTap={setOpenItemId} />
              <p className="text-[12px] text-muted">
                Things you own and have worn — just not often. What you have
                never worn is below.
              </p>
            </Section>
          )}

          {stats.never.length > 0 && (
            <Section title={`Never worn · ${stats.never.length}`}>
              {/*
                Thumbnails rather than a list, because this is the section
                people act on — you decide what to do with a garment by looking
                at it, not by reading its name.
              */}
              <div className="wardrobe-grid grid gap-3">
                {stats.never.map(({ item }) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOpenItemId(item.id)}
                    className="tile relative aspect-[3/4]"
                  >
                    <ItemImage item={item} className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section title="Days logged">
            <div className="flex items-end gap-1">
              {stats.months.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-20 w-full items-end">
                    <div
                      className="w-full rounded-sm"
                      style={{
                        height: `${Math.max(2, (m.days / busiest) * 100)}%`,
                        backgroundColor:
                          m.days > 0 ? 'var(--color-tag-2)' : 'var(--color-rule)',
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-muted">{m.label}</p>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-muted">
              {loggedDays} {loggedDays === 1 ? 'day' : 'days'} logged in all.
            </p>
          </Section>

          {groups
            .filter((group) => group.id !== 'category')
            .map((group) => {
              const { shares, untagged } = tagBreakdown(
                items ?? [],
                wears ?? [],
                group.options,
                (item) => group.getValues(item),
                todayKey,
              );
              if (shares.every((s) => s.ownedShare === 0 && s.wornShare === 0)) return null;
              return (
                <Section key={group.id} title={`${group.label}: owned vs worn`}>
                  {shares.map((share) => (
                    <PairedBars key={share.value} share={share} hue={group.hue} />
                  ))}
                  {untagged > 0 && (
                    <p className="text-[12px] text-muted">
                      {untagged} {untagged === 1 ? 'garment is' : 'garments are'} untagged here, and
                      left out of both.
                    </p>
                  )}
                </Section>
              );
            })}

          {stats.pairings.length > 0 && (
            <Section title="Colours you put together">
              {stats.pairings.map((pair) => (
                <div key={pair.label} className="flex items-center gap-3">
                  <span className="flex shrink-0 gap-1">
                    <Dot family={pair.a} />
                    <Dot family={pair.b} />
                  </span>
                  <p className="flex-1 text-[13px] text-ink">{pair.label}</p>
                  <p className="text-[12px] text-muted">{pair.count}×</p>
                </div>
              ))}
            </Section>
          )}
        </>
      )}

      {openItemId && <DetailSheet itemId={openItemId} onClose={() => setOpenItemId(null)} />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-[15px] font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Fraction({ label, worn, total, share }: { label: string; worn: number; total: number; share: number }) {
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <p className="font-display text-[26px] leading-none text-ink">
        {worn}
        <span className="text-[16px] text-muted"> / {total}</span>
      </p>
      <div className="h-1.5 w-full rounded-sm bg-sunken">
        <div
          className="h-full rounded-sm"
          style={{ width: `${share * 100}%`, backgroundColor: 'var(--color-on)' }}
        />
      </div>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

function Ranking({ tallies, onTap }: { tallies: WearTally[]; onTap: (id: string) => void }) {
  const most = Math.max(...tallies.map((t) => t.wearCount), 1);
  return (
    <ul className="flex flex-col gap-2">
      {tallies.map(({ item, wearCount }) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onTap(item.id)}
            className="flex w-full items-center gap-3 text-left"
          >
            <span className="h-10 w-10 shrink-0">
              <ItemThumb item={item} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-ink">{item.name}</span>
              <span className="mt-1 block h-1.5 w-full rounded-sm bg-sunken">
                <span
                  className="block h-full rounded-sm"
                  style={{
                    width: `${(wearCount / most) * 100}%`,
                    backgroundColor: 'var(--color-tag-1)',
                  }}
                />
              </span>
            </span>
            <span className="shrink-0 text-[12px] text-muted">{wearCount}×</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ItemThumb({ item }: { item: Item }) {
  return <ItemImage item={item} className="h-full w-full object-contain" />;
}

/**
 * Owned above, worn below. The gap between the two bars is the whole point —
 * "I own mostly formal but wear mostly casual" is a shape, not a number.
 */
function PairedBars({
  share,
  hue,
}: {
  share: { label: string; ownedShare: number; wornShare: number };
  hue: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <p className="text-[12px] text-ink">{share.label}</p>
        <p className="text-[11px] text-muted">
          own {Math.round(share.ownedShare * 100)}% · wear {Math.round(share.wornShare * 100)}%
        </p>
      </div>
      <div className="h-1.5 w-full rounded-sm bg-sunken">
        <div
          className="h-full rounded-sm opacity-45"
          style={{ width: `${share.ownedShare * 100}%`, backgroundColor: `var(${hue})` }}
        />
      </div>
      <div className="h-1.5 w-full rounded-sm bg-sunken">
        <div
          className="h-full rounded-sm"
          style={{ width: `${share.wornShare * 100}%`, backgroundColor: `var(${hue})` }}
        />
      </div>
    </div>
  );
}

/** A colour family as a swatch. Approximate by design — it is naming a family, not a garment. */
const FAMILY_SWATCH: Record<string, string> = {
  black: '#1c1c1c', white: '#f4f3ef', grey: '#8d8d88', beige: '#d9cbb4', brown: '#6b5342',
  red: '#a83a2c', orange: '#c1743a', yellow: '#c8a63c', green: '#5f7d52', teal: '#3f7068',
  blue: '#3b5b8c', purple: '#7a5a85', pink: '#c2748c',
};

function Dot({ family }: { family: string }) {
  return (
    <span
      className="block h-4 w-4 rounded-full border border-rule"
      style={{ backgroundColor: FAMILY_SWATCH[family] ?? '#8d8d88' }}
    />
  );
}
