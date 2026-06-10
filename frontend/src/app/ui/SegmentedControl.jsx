import './SegmentedControl.css';

export default function SegmentedControl({ options, value, onChange, ariaLabel, className = '' }) {
  return (
    <div
      className={`ui-segmented-control ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`ui-segmented-control__option${isActive ? ' is-active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
