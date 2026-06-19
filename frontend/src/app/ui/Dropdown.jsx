import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from '../providers/LanguageContext';
import './Dropdown.css';

const CHEVRON_TEXT = '▼';


function DropdownMenu({
  isOpen,
  menuCoords,
  options,
  value,
  onOptionClick,
  searchable,
  variant,
  className = '',
}) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!menuRef.current || !menuCoords) return;
    menuRef.current.style.setProperty('--dropdown-menu-top', `${menuCoords.top}px`);
    menuRef.current.style.setProperty('--dropdown-menu-left', `${menuCoords.left}px`);
    menuRef.current.style.setProperty('--dropdown-menu-width', `${menuCoords.width}px`);
  }, [menuCoords]);

  if (!isOpen) {
    return null;
  }

  const filteredOptions = options.filter((opt) =>
    String(opt.label || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return createPortal(
    <div
      ref={menuRef}
      className={`ui-dropdown__menu ${searchable ? 'has-search' : ''} ${menuCoords.openUpwards ? 'is-upwards' : ''} ${variant === 'sorter' ? 'ui-dropdown__menu--sorter' : ''} ${className}`.trim()}
    >
      {searchable ? (
        <div className="ui-dropdown__search-container">
          <input
            ref={searchInputRef}
            type="text"
            className="ui-dropdown__search-input"
            placeholder={t('dropdown.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
      <div className="ui-dropdown__items-wrapper">
        {filteredOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`ui-dropdown__item ${opt.value === value ? 'is-active' : ''}`}
            onClick={() => onOptionClick(opt.value)}
            title={opt.label}
          >
            {opt.label}
          </button>
        ))}
        {filteredOptions.length === 0 ? (
          <div className="ui-dropdown__no-results">
            {t('dropdown.noResults')}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

export default function Dropdown({
  label,
  options = [],
  value,
  onChange,
  hint,
  className = '',
  placeholder,
  searchable = false,
  disabled = false,
  variant = 'default',
  sortDirection = 'asc',
  onSortDirectionToggle,
  menuClassName = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0, width: 0 });

  const { t } = useTranslation();
  const displayPlaceholder = placeholder ?? t('dropdown.placeholder');
  const selectedOption = options.find((opt) => opt.value === value);
  const isSorter = variant === 'sorter';

  const updateMenuCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const threshold = 280; // height threshold of our dropdown menu
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpwards = spaceBelow < threshold && rect.top > spaceBelow;

      setMenuCoords({
        top: openUpwards
          ? rect.top + window.scrollY - 6
          : rect.bottom + window.scrollY + 6,
        left: rect.left + window.scrollX,
        width: rect.width,
        openUpwards,
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updateMenuCoords();
      window.addEventListener('scroll', updateMenuCoords, true);
      window.addEventListener('resize', updateMenuCoords);
    }
    return () => {
      window.removeEventListener('scroll', updateMenuCoords, true);
      window.removeEventListener('resize', updateMenuCoords);
    };
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        if (event.target.closest('.ui-dropdown__menu')) return;
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, []);

  const handleOptionClick = (val) => {
    if (onChange) {
      onChange({ target: { value: val } });
    }
    setIsOpen(false);
  };

  return (
    <div className={`ui-field ${isSorter ? 'ui-field--sorter' : ''} ${className}`.trim()} ref={containerRef}>
      {label ? <span className="ui-field__label">{label}</span> : null}
      {hint ? <span className="ui-field__hint">{hint}</span> : null}
      <div className={`ui-dropdown ${isSorter ? 'ui-dropdown--sorter' : ''}`}>
        <div className="ui-dropdown__sorter-wrapper">
          <button
            ref={triggerRef}
            type="button"
            className={`ui-dropdown__trigger ${isSorter ? 'ui-dropdown__trigger--sorter' : ''} ${disabled ? 'is-disabled' : ''}`.trim()}
            onClick={() => !disabled && setIsOpen(!isOpen)}
            disabled={disabled}
          >
            <span className="ui-dropdown__trigger-text">
              {selectedOption ? selectedOption.label : displayPlaceholder}
            </span>
            {!isSorter && <span className={`ui-dropdown__chevron ${isOpen ? 'is-open' : ''}`}><ChevronDown size={12} /></span>}
          </button>

          {isSorter && onSortDirectionToggle && (
            <button
              type="button"
              className="ui-dropdown__direction-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (onSortDirectionToggle) onSortDirectionToggle();
              }}
              title={sortDirection === 'asc' ? t('dropdown.ascending') : t('dropdown.descending')}
            >
              {sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>

        <DropdownMenu
          isOpen={isOpen}
          menuCoords={menuCoords}
          options={options}
          value={value}
          onOptionClick={handleOptionClick}
          searchable={searchable}
          variant={variant}
          className={menuClassName}
        />
      </div>
    </div>
  );
}
