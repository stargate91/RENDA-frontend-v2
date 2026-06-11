import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Dropdown.css';

export default function Dropdown({ label, options = [], value, onChange, hint, className = '', placeholder = 'Select...' }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0, width: 0 });

  const selectedOption = options.find((opt) => opt.value === value);

  const updateMenuCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuCoords({
        top: rect.bottom + window.scrollY + 6,
        left: rect.left + window.scrollX,
        width: rect.width,
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
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOptionClick = (val) => {
    if (onChange) {
      onChange({ target: { value: val } });
    }
    setIsOpen(false);
  };

  return (
    <div className={`ui-field ${className}`.trim()} ref={containerRef}>
      {label ? <span className="ui-field__label">{label}</span> : null}
      {hint ? <span className="ui-field__hint">{hint}</span> : null}
      <div className="ui-dropdown">
        <button
          ref={triggerRef}
          type="button"
          className="ui-dropdown__trigger"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="ui-dropdown__trigger-text">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <span className={`ui-dropdown__chevron ${isOpen ? 'is-open' : ''}`}>▼</span>
        </button>

        {isOpen &&
          createPortal(
            <div
              className="ui-dropdown__menu"
              style={{
                position: 'absolute',
                top: `${menuCoords.top}px`,
                left: `${menuCoords.left}px`,
                width: `${menuCoords.width}px`,
              }}
            >
              {options.map((opt) => (
                <button
                   key={opt.value}
                  type="button"
                  className={`ui-dropdown__item ${opt.value === value ? 'is-active' : ''}`}
                  onClick={() => handleOptionClick(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>,
            document.body
          )}
      </div>
    </div>
  );
}
