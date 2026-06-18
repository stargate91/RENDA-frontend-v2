import { useEffect, useRef, useState } from 'react';
import { Plus, Tag } from 'lucide-react';
import Pill from '@/ui/Pill';
import { useAllTagsQuery, useCreateTagMutation } from '@/queries/libraryQueries';

const PREDEFINED_COLORS = [
  '#3b82f6', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#f59e0b', '#6366f1', '#14b8a6',
];

export default function PeopleTagPopover({ item, t, updatePersonStatusMutation }) {
  const [isOpen, setIsOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [newTagError, setNewTagError] = useState('');
  const popoverRef = useRef(null);
  const { data: allTags = [] } = useAllTagsQuery(item?.is_adult);
  const createTagMutation = useCreateTagMutation();
  const currentTags = item?.custom_tags || [];
  const availableTags = allTags.filter((tag) => !currentTags.includes(tag.name));
  const isBusy = updatePersonStatusMutation.isPending || createTagMutation.isPending;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggleTag = (tagName) => {
    if (!item?.id || !tagName) {
      return;
    }

    const isAssigned = currentTags.includes(tagName);
    const nextTags = isAssigned
      ? currentTags.filter((name) => name !== tagName)
      : [...currentTags, tagName];

    updatePersonStatusMutation.mutate({
      personId: item.id,
      payload: {
        custom_tags: nextTags,
      },
    });
  };

  const handleCreateTag = async (event) => {
    event.preventDefault();
    const trimmedName = newTagName.trim();
    if (!item?.id || !trimmedName) {
      return;
    }

    const exists = allTags.some((tag) => tag.name.toLowerCase() === trimmedName.toLowerCase());
    if (exists) {
      setNewTagError(t('library.tags.errorExists') || 'A tag with this name already exists');
      return;
    }

    try {
      await createTagMutation.mutateAsync({
        name: trimmedName,
        color: newTagColor,
        is_adult: item?.is_adult || false,
      });

      await updatePersonStatusMutation.mutateAsync({
        personId: item.id,
        payload: {
          custom_tags: [...currentTags, trimmedName],
        },
      });

      setNewTagName('');
      setNewTagColor('#3b82f6');
      setNewTagError('');
    } catch (err) {
      setNewTagError(err.message || 'Failed to create tag');
    }
  };

  return (
    <div ref={popoverRef} className={`entity-detail-page__tag-popover-wrap${isOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="media-detail-page__side-nav-toggle"
        title={t('library.details.tagger') || 'Tagger'}
        aria-expanded={isOpen}
      >
        <Tag size={18} />
      </button>

      {isOpen ? (
        <div className="entity-detail-page__tag-popover">
          <div className="entity-detail-page__tag-popover-section">
            <span className="entity-detail-page__tag-popover-label">
              {t('library.tags.assignedTitle') || 'Assigned Tags'}
            </span>
            <div className="entity-detail-page__tag-popover-pills">
              {currentTags.length > 0 ? currentTags.map((tagName) => {
                const tagObj = allTags.find((tag) => tag.name === tagName);
                return (
                  <Pill
                    key={tagName}
                    variant="tag"
                    className="entity-detail-page__tag-pill"
                    customStyle={{ '--pill-tag-color': tagObj?.color || '#3b82f6' }}
                  >
                    <span>{tagName}</span>
                    <button
                      type="button"
                      className="entity-detail-page__tag-pill-remove"
                      onClick={() => handleToggleTag(tagName)}
                      disabled={isBusy}
                      title={t('common.remove') || 'Remove'}
                    >
                      {String.fromCharCode(0x2715)}
                    </button>
                  </Pill>
                );
              }) : (
                <span className="entity-detail-page__tag-popover-empty">
                  {t('library.tags.noTagsAssigned') || 'No tags assigned.'}
                </span>
              )}
            </div>
          </div>

          <div className="entity-detail-page__tag-popover-section">
            <span className="entity-detail-page__tag-popover-label">
              {t('library.tags.addTagLabel') || 'Add Tag'}
            </span>
            <div className="entity-detail-page__tag-popover-pills entity-detail-page__tag-popover-pills--available">
              {availableTags.length > 0 ? availableTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className="entity-detail-page__tag-suggestion"
                  onClick={() => handleToggleTag(tag.name)}
                  disabled={isBusy}
                >
                  <span
                    className="entity-detail-page__tag-suggestion-dot"
                    // eslint-disable-next-line react/forbid-dom-props
                    style={{ backgroundColor: tag.color }}
                  />
                  <span>{tag.name}</span>
                </button>
              )) : (
                <span className="entity-detail-page__tag-popover-empty">
                  {allTags.length === 0
                    ? (t('library.emptyStates.tags.description') || 'No tags created yet.')
                    : (t('library.tags.allTagsAssigned') || 'All tags assigned.')}
                </span>
              )}
            </div>
          </div>

          <form onSubmit={handleCreateTag} className="entity-detail-page__tag-create-form">
            <input
              type="text"
              value={newTagName}
              onChange={(event) => {
                setNewTagName(event.target.value);
                setNewTagError('');
              }}
              placeholder={t('library.tags.namePlaceholder') || 'Enter tag name...'}
              className="entity-detail-page__tag-create-input"
            />
            <div className="entity-detail-page__tag-color-row">
              {PREDEFINED_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewTagColor(color)}
                  className={`entity-detail-page__tag-color-btn${newTagColor === color ? ' is-selected' : ''}`}
                  // eslint-disable-next-line react/forbid-dom-props
                  style={{ backgroundColor: color }}
                  aria-label={color}
                />
              ))}
            </div>
            <button
              type="submit"
              className="entity-detail-page__tag-create-submit"
              disabled={!newTagName.trim() || isBusy}
            >
              <Plus size={16} />
            </button>
          </form>

          {newTagError ? (
            <span className="entity-detail-page__tag-create-error">{newTagError}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
