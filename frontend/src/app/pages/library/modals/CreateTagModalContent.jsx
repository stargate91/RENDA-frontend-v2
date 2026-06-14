import { useState, useEffect } from 'react';
import { useAllTagsQuery, useCreateTagMutation, useUpdateTagMutation } from '@/queries';
import Input from '@/ui/Input';
import Tooltip from '@/ui/Tooltip';
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
  const [customImages, setCustomImages] = useState(initialTag?.custom_images || []);
  const [newUrl, setNewUrl] = useState('');
  const [error, setError] = useState('');

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

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (customImages.length >= 3) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setCustomImages([...customImages, reader.result]);
    };
    reader.readAsDataURL(file);
  };

  const handleAddUrl = (e) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    if (customImages.length >= 3) return;
    setCustomImages([...customImages, newUrl.trim()]);
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
      (tag) => tag.name.toLowerCase() === trimmedName.toLowerCase() && tag.id !== initialTag?.id
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
    <form id={formId} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span className="ui-field__label">{t('library.tags.colorLabel') || 'Select Color'}</span>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {PREDEFINED_COLORS.map((c) => {
            const isSelected = color === c;
            return (
              <Tooltip key={c} content={c} side="top">
                <button
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: c,
                    border: isSelected ? '2px solid var(--color-accent-blue, #1493ff)' : '2px solid transparent',
                    outline: 'none',
                    cursor: 'pointer',
                    transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 0 8px rgba(20, 147, 255, 0.4)' : 'none',
                  }}
                />
              </Tooltip>
            );
          })}

          {/* Custom Color Selector */}
          <Tooltip content={t('library.tags.customColor') || 'Custom Color'} side="top">
            <label
              style={{
                position: 'relative',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: !PREDEFINED_COLORS.includes(color)
                  ? color
                  : 'linear-gradient(45deg, #ff0055, #00ff55, #0055ff)',
                border: !PREDEFINED_COLORS.includes(color)
                  ? '2px solid var(--color-accent-blue, #1493ff)'
                  : '2px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: !PREDEFINED_COLORS.includes(color) ? 'scale(1.1)' : 'scale(1)',
                transition: 'all 0.15s ease',
                boxShadow: !PREDEFINED_COLORS.includes(color) ? '0 0 8px rgba(20, 147, 255, 0.4)' : 'none',
              }}
            >
              <Paintbrush
                size={12}
                style={{
                  color: '#ffffff',
                  mixBlendMode: 'difference',
                }}
              />
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label={t('library.tags.customColor') || 'Custom Color'}
                style={{
                  position: 'absolute',
                  opacity: 0,
                  width: '100%',
                  height: '100%',
                  cursor: 'pointer',
                  }}
                />
              </label>
            </Tooltip>
          </div>
        </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span className="ui-field__label">{t('library.tags.customImagesLabel') || 'Custom Images (Max 3)'}</span>
        
        {customImages.length > 0 && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {customImages.map((img, idx) => (
              <div key={idx} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '6px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                <img
                  src={img.startsWith('data:') || img.startsWith('http') ? img : `${API_BASE}${img}`}
                  alt={`Custom Preview ${idx + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <button
                  type="button"
                  onClick={() => setCustomImages(customImages.filter((_, i) => i !== idx))}
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {customImages.length < 3 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Input
              placeholder={t('library.tags.imageUrlPlaceholder') || 'Paste image URL...'}
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={handleAddUrl}
              className="ui-button ui-button--secondary ui-button--md"
              style={{ height: 'var(--ui-control-height-md)', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {t('library.tags.addImageUrl') || 'Add URL'}
            </button>
            <label
              className="ui-button ui-button--secondary ui-button--md"
              style={{ height: 'var(--ui-control-height-md)', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {t('library.tags.uploadImage') || 'Upload'}
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        )}

        <div style={{ fontSize: 'var(--font-size-xs, 11px)', color: 'var(--color-text-muted, #8a9cae)', marginTop: '4px', lineHeight: 1.4 }}>
          {customImages.length <= 1 ? (
            <div>• {t('library.tags.aspectRatioOne') || 'Ideal aspect ratio is 16:9 (landscape/backdrop)'}</div>
          ) : (
            <div>• {t('library.tags.aspectRatioMultiple') || 'Ideal aspect ratio is 2:3 (portrait/poster)'}</div>
          )}
        </div>
      </div>
    </form>
  );
}
