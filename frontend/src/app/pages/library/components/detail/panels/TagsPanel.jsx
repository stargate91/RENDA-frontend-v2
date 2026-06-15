import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import Pill from '@/ui/Pill';
import { useAllTagsQuery, useCreateTagMutation } from '@/queries/libraryQueries';
import { useMediaDetailContext } from '../MediaDetailContext';
import './PanelsCommon.css';
import './TagsPanel.css';


export default function TagsPanel() {
  const { state, mutations, type, t } = useMediaDetailContext();
  const {
    item,
    cleanId,
    effectiveId
  } = state;

  const {
    updateStatusMutation
  } = mutations;

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [newTagError, setNewTagError] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const { data: allTags = [] } = useAllTagsQuery(item?.is_adult);
  const createTagMutation = useCreateTagMutation();

  const currentTags = item?.custom_tags || [];
  const PREDEFINED_COLORS = [
    '#3b82f6', '#10b981', '#ef4444', '#8b5cf6',
    '#ec4899', '#f59e0b', '#6366f1', '#14b8a6'
  ];

  const handleToggleTag = (tagName) => {
    const isAssigned = currentTags.includes(tagName);
    const nextTags = isAssigned
      ? currentTags.filter(name => name !== tagName)
      : [...currentTags, tagName];

    updateStatusMutation.mutate({
      itemId: effectiveId,
      seriesId: cleanId,
      payload: {
        custom_tags: nextTags,
        media_type: type
      }
    });
  };


  const handleCreateTag = async (e) => {
    e.preventDefault();
    const trimmedName = newTagName.trim();
    if (!trimmedName) return;

    const exists = allTags.some(t => t.name.toLowerCase() === trimmedName.toLowerCase());
    if (exists) {
      setNewTagError(t('library.tags.errorExists') || 'A tag with this name already exists');
      return;
    }

    try {
      await createTagMutation.mutateAsync({
        name: trimmedName,
        color: newTagColor,
        is_adult: item?.is_adult || false
      });

      await updateStatusMutation.mutateAsync({
        itemId: effectiveId,
        seriesId: cleanId,
        payload: {
          custom_tags: [...currentTags, trimmedName],
          media_type: type
        }
      });

      setNewTagName('');
      setNewTagColor('#3b82f6');
      setNewTagError('');
    } catch (err) {
      setNewTagError(err.message || 'Failed to create tag');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="tags-panel">
      <h4 className="details-panel__section-title">
        {t('library.details.tagger') || 'Tagger'}
      </h4>

      {/* Currently Assigned Tags */}
      <div className="tags-panel__assigned-section">
        <span className="tags-panel__section-subtitle">
          {t('library.tags.assignedTitle') || 'Assigned'}
        </span>
        <div className="tags-panel__assigned-list">
          {currentTags.map(tagName => {
            const tagObj = allTags.find(t => t.name === tagName);
            const color = tagObj?.color || '#3b82f6';
            return (
              <Pill
                key={tagName}
                variant="tag"
                className="tags-panel__assigned-pill"
                customStyle={{ '--pill-tag-color': color }}
              >
                <span>{tagName}</span>
                <button
                  type="button"
                  onClick={() => handleToggleTag(tagName)}
                  className="tags-panel__assigned-pill-remove"
                  title={t('common.remove') || 'Remove'}
                >
                  {String.fromCharCode(0x2715)}
                </button>
              </Pill>
            );
          })}
          {currentTags.length === 0 && (
            <div className="tags-panel__no-tags">
              {t('library.tags.noTagsAssigned') || 'No tags assigned.'}
            </div>
          )}
        </div>
      </div>

      {/* Add Tag Dropdown */}
      <div className="tags-panel__select-section" ref={dropdownRef}>
        <span className="tags-panel__section-subtitle">
          {t('library.tags.addTagLabel') || 'Add Tag'}
        </span>
        <button
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="tags-panel__select-trigger"
        >
          <span>{t('library.tags.addTagPlaceholder') || 'Add Tag...'}</span>
          <ChevronDown size={16} />
        </button>

        {isDropdownOpen && (
          <div className="tags-panel__select-dropdown">
            {allTags
              .filter(tag => !currentTags.includes(tag.name))
              .map(tag => {
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleToggleTag(tag.name)}
                    className="tags-panel__dropdown-item"
                  >
                    {/* eslint-disable-next-line react/forbid-dom-props */}
                    <div className="tags-panel__dropdown-item-color" style={{ backgroundColor: tag.color }} />
                    <span className="tags-panel__dropdown-item-name">{tag.name}</span>
                  </button>
                );
              })}
            {allTags.length === 0 && (
              <div className="tags-panel__dropdown-empty">
                {t('library.emptyStates.tags.description') || 'No tags created yet.'}
              </div>
            )}
            {allTags.length > 0 && allTags.filter(tag => !currentTags.includes(tag.name)).length === 0 && (
              <div className="tags-panel__dropdown-empty">
                {t('library.tags.allTagsAssigned') || 'All tags assigned.'}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="tags-panel__divider" />

      <form onSubmit={handleCreateTag} className="tags-panel__create-form">
        <h5 className="tags-panel__create-title">
          {t('library.tags.modalTitle') || 'Create Tag'}
        </h5>

        <div className="tags-panel__input-row">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => {
              setNewTagName(e.target.value);
              setNewTagError('');
            }}
            placeholder={t('library.tags.namePlaceholder') || 'Enter tag name...'}
            className="tags-panel__input"
          />
          <button
            type="submit"
            disabled={!newTagName.trim() || createTagMutation.isPending}
            className="tags-panel__submit-btn"
          >
            {String.fromCharCode(0x002B)}
          </button>
        </div>

        {newTagError && (
          <span className="tags-panel__error">
            {newTagError}
          </span>
        )}

        <div className="tags-panel__color-row">
          {PREDEFINED_COLORS.map(c => {
            const isSelected = newTagColor === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setNewTagColor(c)}
                className={`tags-panel__color-btn ${isSelected ? 'tags-panel__color-btn--selected' : ''}`}
                /* eslint-disable-next-line react/forbid-dom-props */
                style={{
                  backgroundColor: c,
                  outlineColor: c
                }}
              />
            );
          })}
        </div>
      </form>
    </div>
  );
}
