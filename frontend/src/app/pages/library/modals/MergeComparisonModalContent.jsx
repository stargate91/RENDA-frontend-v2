import { useState, useEffect } from 'react';
import { useTranslation } from '@/providers/LanguageContext';
import { useUi } from '@/providers/UiProvider';
import { useLinkPersonSourceMutation } from '@/queries/libraryQueries';
import api from '@/lib/api';
import Button from '@/ui/Button';
import Spinner from '@/ui/Spinner';
import {
  Calendar,
  MapPin,
  Ruler,
  Eye,
  Palette,
  Globe,
  User,
  Check,
  Info,
  ChevronRight,
  Star,
  MessageSquare,
  Heart,
  Tag,
} from 'lucide-react';
import './MergeComparisonModalContent.css';

// Formatting Helpers
const toTitleCase = (str) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getGenderLabel = (val, t) => {
  if (val === 1 || val === '1') return t('library.details.female') || 'Female';
  if (val === 2 || val === '2') return t('library.details.male') || 'Male';
  if (val === 3 || val === '3') return t('library.details.nonBinary') || 'Non-binary';
  return t('common.unknown') || 'Unknown';
};

const formatValue = (field, val, t) => {
  if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
    return <span className="merge-compare__val-empty">Empty</span>;
  }
  if (field === 'gender') {
    return getGenderLabel(val, t);
  }
  if (field === 'height') {
    return `${val} cm`;
  }
  if (field === 'is_favorite') {
    return val ? 'Yes' : 'No';
  }
  if (field === 'custom_tags') {
    return Array.isArray(val) ? val.join(', ') : String(val);
  }
  if (['ethnicity', 'eye_color', 'hair_color'].includes(field)) {
    return toTitleCase(val);
  }
  return String(val);
};

const getFieldIcon = (field) => {
  switch (field) {
    case 'birthday':
      return Calendar;
    case 'place_of_birth':
      return MapPin;
    case 'height':
    case 'measurements':
      return Ruler;
    case 'ethnicity':
      return Globe;
    case 'eye_color':
      return Eye;
    case 'hair_color':
      return Palette;
    case 'user_rating':
      return Star;
    case 'user_comment':
      return MessageSquare;
    case 'is_favorite':
      return Heart;
    case 'custom_tags':
      return Tag;
    case 'name':
    case 'gender':
    default:
      return User;
  }
};

export default function MergeComparisonModalContent({ personId, source, externalId, onClose, onBack }) {
  const { t } = useTranslation();
  const { toast, updateModal } = useUi();
  const [previewData, setPreviewData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selections, setSelections] = useState({});

  const linkMutation = useLinkPersonSourceMutation();

  const handleConfirmLink = async () => {
    try {
      const overrides = {};
      Object.keys(selections).forEach((key) => {
        if (selections[key] === 'external') {
          overrides[key] = previewData.external[key];
        } else {
          overrides[key] = previewData.local[key];
        }
      });

      await linkMutation.mutateAsync({
        personId,
        source,
        externalId,
        overrides,
      });

      toast(t('library.details.sourceLinked') || 'Source linked successfully!', 'success');
      onClose();
    } catch (err) {
      toast(err.message || 'Failed to link source', 'danger');
    }
  };

  useEffect(() => {
    async function fetchPreview() {
      try {
        const res = await api.people.linkSourcePreview(personId, source, externalId);
        setPreviewData(res);

        const initial = {};
        const fields = [
          'name',
          'biography',
          'birthday',
          'place_of_birth',
          'gender',
          'height',
          'measurements',
          'ethnicity',
          'eye_color',
          'hair_color',
          'user_rating',
          'user_comment',
          'is_favorite',
          'custom_tags',
        ];
        fields.forEach((field) => {
          const localVal = res.local?.[field];
          const extVal = res.external?.[field];
          const isLocalEmpty = localVal === undefined || localVal === null || String(localVal).trim() === '';
          const isExtPopulated = extVal !== undefined && extVal !== null && String(extVal).trim() !== '';
          if (isLocalEmpty && isExtPopulated) {
            initial[field] = 'external';
          } else {
            initial[field] = 'local';
          }
        });
        setSelections(initial);
      } catch (err) {
        setError(err.message || 'Failed to load merge preview.');
      } finally {
        setIsLoading(false);
      }
    }
    fetchPreview();
  }, [personId, source, externalId]);

  useEffect(() => {
    if (!isLoading && previewData) {
      updateModal({
        footer: (
          <div className="merge-compare__footer-actions" style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <Button variant="secondary" onClick={onBack || onClose} disabled={linkMutation.isPending}>
              {onBack ? 'Back' : 'Cancel'}
            </Button>
            <Button variant="primary" onClick={handleConfirmLink} disabled={linkMutation.isPending}>
              Confirm Link
            </Button>
          </div>
        )
      });
    }
    return () => {
      updateModal({ footer: undefined });
    };
  }, [isLoading, previewData, selections, linkMutation.isPending, handleConfirmLink, onClose, onBack, updateModal]);

  if (isLoading) {
    return (
      <div className="merge-compare__loading">
        <Spinner size="lg" />
        <div>Fetching external metadata...</div>
      </div>
    );
  }

  if (error) {
    return <div className="merge-compare__error">{error}</div>;
  }

  const fields = [
    { key: 'name', label: 'Name' },
    { key: 'gender', label: 'Gender' },
    { key: 'birthday', label: 'Birthday' },
    { key: 'place_of_birth', label: 'Place of Birth' },
    { key: 'height', label: 'Height' },
    { key: 'measurements', label: 'Measurements' },
    { key: 'ethnicity', label: 'Ethnicity' },
    { key: 'eye_color', label: 'Eye Color' },
    { key: 'hair_color', label: 'Hair Color' },
    { key: 'biography', label: 'Biography' },
    { key: 'user_rating', label: 'Rating' },
    { key: 'user_comment', label: 'Comment' },
    { key: 'is_favorite', label: 'Favorite' },
    { key: 'custom_tags', label: 'Tags' },
  ];

  const diffFields = fields.filter((f) => {
    const localVal = previewData.local?.[f.key];
    const extVal = previewData.external?.[f.key];
    const isLocalEmpty = localVal === undefined || localVal === null || (Array.isArray(localVal) ? localVal.length === 0 : String(localVal).trim() === '');
    const isExtEmpty = extVal === undefined || extVal === null || (Array.isArray(extVal) ? extVal.length === 0 : String(extVal).trim() === '');

    if (isLocalEmpty && isExtEmpty) return false;

    const normLocal = Array.isArray(localVal) ? [...localVal].sort().join(',').toLowerCase().trim() : String(localVal || '').toLowerCase().trim();
    const normExt = Array.isArray(extVal) ? [...extVal].sort().join(',').toLowerCase().trim() : String(extVal || '').toLowerCase().trim();
    return normLocal !== normExt;
  });

  const aliasesCount = previewData.external?.aliases?.length || 0;
  const imagesCount = previewData.external?.images_count || 0;

  return (
    <div className="merge-compare">
      <div className="merge-compare__info">
        <Info size={16} />
        <span>
          Select which values to keep. Identical values, aliases, and profile images will be merged automatically.
        </span>
      </div>

      <div className="merge-compare__list">
        {diffFields.map((f) => {
          const Icon = getFieldIcon(f.key);
          const localSelected = selections[f.key] === 'local';
          const extSelected = selections[f.key] === 'external';

          return (
            <div key={f.key} className="merge-compare__row">
              <div className="merge-compare__field-header">
                <Icon size={14} className="merge-compare__field-icon" />
                <span className="merge-compare__field-label">{f.label}</span>
              </div>
              <div className="merge-compare__choices">
                <button
                  type="button"
                  className={`merge-compare__card ${localSelected ? 'is-active' : ''}`}
                  onClick={() => setSelections((prev) => ({ ...prev, [f.key]: 'local' }))}
                >
                  <div className="merge-compare__card-source">Keep Local</div>
                  <div className="merge-compare__card-value">{formatValue(f.key, previewData.local?.[f.key], t)}</div>
                  {localSelected && <Check size={14} className="merge-compare__card-check" />}
                </button>

                <button
                  type="button"
                  className={`merge-compare__card ${extSelected ? 'is-active' : ''}`}
                  onClick={() => setSelections((prev) => ({ ...prev, [f.key]: 'external' }))}
                >
                  <div className="merge-compare__card-source">Take from {source.toUpperCase()}</div>
                  <div className="merge-compare__card-value">{formatValue(f.key, previewData.external?.[f.key], t)}</div>
                  {extSelected && <Check size={14} className="merge-compare__card-check" />}
                </button>
              </div>
            </div>
          );
        })}

        {diffFields.length === 0 && (
          <div className="merge-compare__empty">
            No conflicting core metadata fields found.
          </div>
        )}
      </div>

      {(aliasesCount > 0 || imagesCount > 0) && (
        <div className="merge-compare__auto-merged">
          <div className="merge-compare__auto-title">Automatically Merging:</div>
          <div className="merge-compare__auto-items">
            {aliasesCount > 0 && (
              <span className="merge-compare__auto-pill">
                +{aliasesCount} Alias{aliasesCount > 1 ? 'es' : ''}
              </span>
            )}
            {imagesCount > 0 && (
              <span className="merge-compare__auto-pill">
                +{imagesCount} Image{imagesCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
