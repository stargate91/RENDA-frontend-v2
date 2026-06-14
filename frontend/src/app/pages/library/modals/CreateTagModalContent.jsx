import { useState, useEffect } from 'react';
import { useAllTagsQuery, useCreateTagMutation, useUpdateTagMutation } from '@/queries';
import Input from '@/ui/Input';
import Tooltip from '@/ui/Tooltip';
import Pill from '@/ui/Pill';
import { Paintbrush } from 'lucide-react';
import { API_BASE } from '@/lib/backend';

const PREDEFINED_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#ef4444', // Red
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#f59e0b', // Yellow
  '#6366f1', // Indigo
  '#14b8a6', // Teal
];

export default function CreateTagModalContent({ onClose, t, initialTag = null, mode = 'create', onSuccess, defaultColor = '#3b82f6', isAdult = false }) {
  const [name, setName] = useState(initialTag?.name || '');
  const [color, setColor] = useState(initialTag?.color || defaultColor);
  const [customImages, setCustomImages] = useState(
    (initialTag?.custom_images || []).map((img) =>
      typeof img === 'string' ? { path: img, position_x: 50, position_y: 50 } : { position_x: 50, position_y: 50, ...img }
    )
  );
  const [newUrl, setNewUrl] = useState('');
  const [error, setError] = useState('');

  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartPercentX, setDragStartPercentX] = useState(50);
  const [dragStartPercentY, setDragStartPercentY] = useState(50);

  const { data: tags = [] } = useAllTagsQuery(isAdult);
  const createTagMutation = useCreateTagMutation();
  const updateTagMutation = useUpdateTagMutation();
  const formId = mode === 'edit' ? 'edit-tag-form' : 'create-tag-form';

  useEffect(() => {
    const formElement = document.getElementById('create-tag-form');
    if (formElement) {
      const modalElement = formElement.closest('.ui-modal');
      if (modalElement) {
        modalElement.style.setProperty('--current-tag-color', color);
      }
    }
  }, [color]);

  const handleDragStart = (index, e) => {
    e.preventDefault();
    setDraggingIndex(index);
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setDragStartX(clientX);
    setDragStartY(clientY);
    const currentImg = customImages[index];
    setDragStartPercentX(currentImg.position_x ?? 50);
    setDragStartPercentY(currentImg.position_y ?? 50);
  };

  const handleDragMove = (e) => {
    if (draggingIndex === null) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaX = clientX - dragStartX;
    const deltaY = clientY - dragStartY;
    const containerSize = 80;
    const deltaPercentX = (deltaX / containerSize) * 100;
    const deltaPercentY = (deltaY / containerSize) * 100;
    const newPercentX = Math.max(0, Math.min(100, Math.round(dragStartPercentX - deltaPercentX)));
    const newPercentY = Math.max(0, Math.min(100, Math.round(dragStartPercentY - deltaPercentY)));

    setCustomImages((prev) =>
      prev.map((img, idx) => (idx === draggingIndex ? { ...img, position_x: newPercentX, position_y: newPercentY } : img))
    );
  };

  const handleDragEnd = () => {
    setDraggingIndex(null);
  };

  useEffect(() => {
    if (draggingIndex !== null) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove, { passive: false });
      window.addEventListener('touchend', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
        window.removeEventListener('touchmove', handleDragMove);
        window.removeEventListener('touchend', handleDragEnd);
      };
    }
  }, [draggingIndex, dragStartX, dragStartY, dragStartPercentX, dragStartPercentY]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (customImages.length >= 3) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setCustomImages([...customImages, { path: reader.result, position_x: 50, position_y: 50 }]);
    };
    reader.readAsDataURL(file);
  };

  const handleAddUrl = (e) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    if (customImages.length >= 3) return;
    setCustomImages([...customImages, { path: newUrl.trim(), position_x: 50, position_y: 50 }]);
    setNewUrl('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = name.strip ? name.strip() : name.trim();
    if (!trimmedName) {
      setError(t('library.tags.errorNameRequired') || 'Name is required');
      return;
    }

    // Case-insensitive uniqueness check
    const exists = tags.some(
      (tag) => tag.name.toLowerCase() === trimmedName.toLowerCase() && String(tag.id) !== String(initialTag?.id)
    );
    if (exists) {
      setError(t('library.tags.errorExists') || 'A tag with this name already exists');
      return;
    }

    try {
      if (mode === 'edit' && initialTag?.id != null) {
        await updateTagMutation.mutateAsync({ tagId: initialTag.id, payload: { name: trimmedName, color, custom_images: customImages } });
      } else {
        await createTagMutation.mutateAsync({ name: trimmedName, color, is_adult: isAdult, custom_images: customImages });
      }
      onSuccess?.({ id: initialTag?.id, name: trimmedName, color, custom_images: customImages });
      onClose();
    } catch (err) {
      setError(err.message || (mode === 'edit' ? 'Failed to update tag' : 'Failed to create tag'));
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="create-tag-form">

      <Input
        label={t('library.tags.nameLabel') || 'Tag Name'}
        placeholder={t('library.tags.namePlaceholder') || 'Enter tag name...'}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError('');
        }}
        error={error}
        autoFocus
      />

      <div className="create-tag-form__field-group">
        <span className="ui-field__label">{t('library.tags.customImagesLabel') || 'Custom Images (Max 3)'}</span>
        
        {customImages.length > 0 && (
          <div className="create-tag-form__image-list">
            {customImages.map((img, idx) => {
              const imgObj = typeof img === 'string' ? { path: img, position_y: 50 } : img;
              const imageUrl = imgObj.path.startsWith('data:') || imgObj.path.startsWith('http')
                ? imgObj.path
                : `${API_BASE}${imgObj.path}`;
              return (
                <div key={idx} className="create-tag-form__image-preview-wrapper">
                  <div
                    className="create-tag-form__image-preview"
                    style={{
                      backgroundImage: `url(${imageUrl})`,
                      backgroundPosition: `${imgObj.position_x ?? 50}% ${imgObj.position_y ?? 50}%`,
                    }}
                    onMouseDown={(e) => handleDragStart(idx, e)}
                    onTouchStart={(e) => handleDragStart(idx, e)}
                    title={t('library.tags.dragToReposition') || 'Drag to reposition'}
                  />
                  <button
                    type="button"
                    onClick={() => setCustomImages(customImages.filter((_, i) => i !== idx))}
                    className="create-tag-form__remove-image-btn"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {customImages.length < 3 && (
          <div className="create-tag-form__add-image-row">
            <Input
              placeholder={t('library.tags.imageUrlPlaceholder') || 'Paste image URL...'}
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="create-tag-form__input-wrapper"
            />
            <button
              type="button"
              onClick={handleAddUrl}
              className="ui-button ui-button--secondary ui-button--md create-tag-form__action-btn"
            >
              {t('library.tags.addImageUrl') || 'Add URL'}
            </button>
            <label
              className="ui-button ui-button--secondary ui-button--md create-tag-form__action-btn create-tag-form__action-btn--upload"
            >
              {t('library.tags.uploadImage') || 'Upload'}
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="create-tag-form__file-input"
              />
            </label>
          </div>
        )}

        <div className="create-tag-form__help-text">
          {customImages.length <= 1 ? (
            <div>• {t('library.tags.aspectRatioOne') || 'Ideal aspect ratio is 16:9 (landscape/backdrop)'}</div>
          ) : (
            <div>• {t('library.tags.aspectRatioMultiple') || 'Ideal aspect ratio is 2:3 (portrait/poster)'}</div>
          )}
        </div>
      </div>

      <div className="create-tag-form__field-group">
        <span className="ui-field__label">{t('library.tags.colorLabel') || 'Select Color'}</span>
        
        <div className="create-tag-form__color-list">
          {PREDEFINED_COLORS.map((c) => {
            const isSelected = color === c;
            return (
              <Tooltip key={c} content={c} side="top">
                <button
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className="create-tag-form__color-btn"
                  style={{
                    backgroundColor: c,
                    border: isSelected ? '2px solid var(--color-accent-blue, #1493ff)' : '2px solid transparent',
                    transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                    boxShadow: isSelected ? '0 0 8px rgba(20, 147, 255, 0.4)' : 'none',
                  }}
                />
              </Tooltip>
            );
          })}

          {/* Custom Color Selector */}
          <label
            className={`create-tag-form__custom-color-label ${!PREDEFINED_COLORS.includes(color) ? 'is-active' : ''}`.trim()}
            style={{
              background: !PREDEFINED_COLORS.includes(color)
                ? color
                : 'var(--color-surface-glass-strong, rgba(255, 255, 255, 0.08))',
              border: !PREDEFINED_COLORS.includes(color)
                ? '2px solid var(--color-accent-blue, #1493ff)'
                : '1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.05))',
              boxShadow: !PREDEFINED_COLORS.includes(color) ? '0 0 8px rgba(20, 147, 255, 0.4)' : 'none',
            }}
          >
            <Paintbrush
              size={12}
              className="create-tag-form__paintbrush"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              tabIndex={-1}
              aria-label={t('library.tags.customColor') || 'Custom Color'}
              className="create-tag-form__color-input"
            />
          </label>

          {/* Hex Display Pill */}
          <Pill
            variant="default"
            className="create-tag-form__color-hex-pill"
            style={{
              borderColor: color,
              borderWidth: '1px',
              borderStyle: 'solid',
              color: color,
              background: `color-mix(in srgb, ${color} 12%, var(--color-bg-elevated))`
            }}
          >
            {String(color).toUpperCase()}
          </Pill>
        </div>
      </div>
    </form>
  );
}
