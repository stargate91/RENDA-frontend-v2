import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const TOOLTIP_GAP = 10;

const getPosition = (rect, side) => {
  const centerX = rect.left + (rect.width / 2);
  const centerY = rect.top + (rect.height / 2);

  if (side === 'bottom') {
    return { left: centerX, top: rect.bottom + TOOLTIP_GAP };
  }

  if (side === 'left') {
    return { left: rect.left - TOOLTIP_GAP, top: centerY };
  }

  if (side === 'right') {
    return { left: rect.right + TOOLTIP_GAP, top: centerY };
  }

  return { left: centerX, top: rect.top - TOOLTIP_GAP };
};

export default function Tooltip({
  content,
  className = '',
  side = 'top',
  delay = 800,
  children,
}) {
  const triggerRef = useRef(null);
  const timeoutRef = useRef(null);
  const tooltipId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState(null);

  const showTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setPosition(getPosition(rect, side));
        setIsOpen(true);
      }
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(false);
    setPosition(null);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition(getPosition(rect, side));
    };

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, side]);

  if (!content) return children;

  return (
    <>
      <span
        ref={triggerRef}
        className="ui-tooltip"
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        onMouseDown={hideTooltip}
        aria-describedby={isOpen ? tooltipId : undefined}
      >
        {children}
      </span>
      {isOpen && position ? createPortal(
        <span
          id={tooltipId}
          role="tooltip"
          className={`ui-tooltip__content ui-tooltip__content--portal ${className}`.trim()}
          data-side={side}
          style={{ left: `${position.left}px`, top: `${position.top}px` }}
        >
          {content}
        </span>,
        document.body,
      ) : null}
    </>
  );
}
