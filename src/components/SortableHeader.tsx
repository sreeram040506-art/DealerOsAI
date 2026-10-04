import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Table header that sorts when clicked. Keys default to `${field}Desc` / `${field}Asc`.
 * The first click uses `firstClick` (high-to-low for numbers and dates, A-Z for names), the
 * second click reverses it, and the third returns to `resetKey` (the page's default order).
 */
export default function SortableHeader<K extends string>({
  label,
  field,
  sortBy,
  onSort,
  title,
  descKey,
  ascKey,
  firstClick = 'desc',
  resetKey = 'newest' as K,
}: {
  label: string;
  field: string;
  sortBy: K;
  onSort: (next: NoInfer<K>) => void;
  title: string;
  descKey?: NoInfer<K>;
  ascKey?: NoInfer<K>;
  firstClick?: 'asc' | 'desc';
  resetKey?: NoInfer<K>;
}) {
  const desc = descKey ?? (`${field}Desc` as K);
  const asc = ascKey ?? (`${field}Asc` as K);
  const first = firstClick === 'asc' ? asc : desc;
  const second = firstClick === 'asc' ? desc : asc;
  const active = sortBy === desc || sortBy === asc;
  return (
    <th
      className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
      aria-sort={sortBy === desc ? 'descending' : sortBy === asc ? 'ascending' : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortBy === first ? second : sortBy === second ? resetKey : first)}
        className={cn('inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground', active && 'text-foreground')}
        title={title}
      >
        {label}
        {sortBy === desc ? <ArrowDown className="w-3 h-3" aria-hidden="true" />
          : sortBy === asc ? <ArrowUp className="w-3 h-3" aria-hidden="true" />
          : <ArrowUpDown className="w-3 h-3 opacity-50" aria-hidden="true" />}
      </button>
    </th>
  );
}
