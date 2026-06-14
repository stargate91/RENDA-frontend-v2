import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function UtilityBarPortal({ children, enabled = true }) {
  const [targetEl, setTargetEl] = useState(null);

  useEffect(() => {
    if (enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTargetEl(document.querySelector('.shell__utility-bar-left'));
    } else {
      setTargetEl(null);
    }
  }, [enabled]);

  if (!targetEl) return null;

  return createPortal(children, targetEl);
}
