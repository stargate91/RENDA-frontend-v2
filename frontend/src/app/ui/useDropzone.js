import { useEffect, useRef, useState } from 'react';
import { webUtils } from '../lib/electron';

const getDroppedPaths = (dataTransfer) => {
  const files = Array.from(dataTransfer?.files || []);

  const paths = files
    .map((file) => {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        try {
          return webUtils.getPathForFile(file);
        } catch {
          // Fallback to legacy path
        }
      }
      return file?.path;
    })
    .filter(Boolean);
  return [...new Set(paths)];
};

export function useDropzone({ disabled = false, onDropPaths }) {
  const [isDropActive, setIsDropActive] = useState(false);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    const preventDefault = (event) => event.preventDefault();
    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);
    return () => {
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
    };
  }, []);

  const handleDragEnter = (event) => {
    if (disabled) {
      return;
    }
    const types = Array.from(event.dataTransfer?.types || []);
    if (!types.includes('Files')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDropActive(true);
  };

  const handleDragOver = (event) => {
    if (disabled) {
      return;
    }
    const types = Array.from(event.dataTransfer?.types || []);
    if (!types.includes('Files')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (event) => {
    if (disabled) {
      return;
    }
    const types = Array.from(event.dataTransfer?.types || []);
    if (!types.includes('Files')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDropActive(false);
    }
  };

  const handleDrop = async (event) => {
    if (disabled) {
      return;
    }
    const types = Array.from(event.dataTransfer?.types || []);
    if (!types.includes('Files')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDropActive(false);
 
    const paths = getDroppedPaths(event.dataTransfer);
    if (paths.length === 0) {
      return;
    }

    await onDropPaths?.(paths);
  };

  return {
    dropzoneProps: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
    isDropActive,
  };
}
