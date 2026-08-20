/** Revealed by a toggle rather than pinned open (spec §7.2 as amended). Matches against name and notes. */
export function SearchBar({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoFocus={autoFocus}
      placeholder="search your wardrobe"
      className="min-h-11 w-full border-b border-rule bg-transparent px-1 text-[15px] text-ink outline-none placeholder:text-muted focus:border-ink"
    />
  );
}
