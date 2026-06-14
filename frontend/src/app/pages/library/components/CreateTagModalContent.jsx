import { useState, useEffect } from 'react';
import { useAllTagsQuery, useCreateTagMutation, useUpdateTagMutation } from '@/queries';
import Input from '@/ui/Input';
import Tooltip from '@/ui/Tooltip';
import { Paintbrush } from 'lucide-react';

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

export default function CreateTagModalContent({ onClose, t, initialTag = null, mode = 'create', onSuccess, defaultColor = '#3b82f6' }) {
  const [name, setName] = useState(initialTag?.name || '');
  const [color, setColor] = useState(initialTag?.color || defaultColor);
  const [error, setError] = useState('');

  const { data: tags = [] } = useAllTagsQuery();
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
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
        await updateTagMutation.mutateAsync({ tagId: initialTag.id, payload: { name: trimmedName, color } });
      } else {
        await createTagMutation.mutateAsync({ name: trimmedName, color });
      }
      onSuccess?.({ id: initialTag?.id, name: trimmedName, color });
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
    </form>
  );
}
