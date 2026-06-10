import { ChevronDown, ChevronUp } from 'lucide-react';

export default function SortButton({
  isActive,
  label,
  onToggle,
  sortDirection,
}) {
  return (
    <button
      type="button"
      className={`ui-sort-button${isActive ? ' is-active' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <span>{label}</span>
      {isActive ? (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
    </button>
  );
}
