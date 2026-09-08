import { createOutfitFromMembers } from '../db/items';
import { WardrobePicker } from './WardrobePicker';

/**
 * Build an outfit from garments already in the wardrobe (spec §7.3).
 *
 * Nothing is photographed and nothing is copied: the outfit is a list of
 * member ids, and what it looks like is composed from their existing thumbs
 * when it is shown. Costs a few dozen bytes rather than a second picture of
 * clothes the database already holds.
 *
 * The picking itself lives in `WardrobePicker`, which the calendar also uses —
 * this is just the "and save it as an outfit" half.
 */
export function OutfitBuilder({
  initialIds = [],
  onClose,
  onCreated,
}: {
  initialIds?: string[];
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  return (
    <WardrobePicker
      initialIds={initialIds}
      heading="pick some pieces"
      onClose={onClose}
      onSave={async (members) => {
        const outfit = await createOutfitFromMembers(members);
        onCreated?.(outfit.id);
      }}
    />
  );
}
