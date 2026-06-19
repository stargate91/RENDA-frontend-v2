import { useState } from 'react';
import { useTranslation } from '@/providers/LanguageContext';
import { useUi } from '@/providers/UiProvider';
import { useLinkPersonSourceMutation } from '@/queries/libraryQueries';
import api from '@/lib/api';
import Input from '@/ui/Input';
import Dropdown from '@/ui/Dropdown';
import Button from '@/ui/Button';
import IconButton from '@/ui/IconButton';
import Tooltip from '@/ui/Tooltip';
import EmptyState from '@/ui/EmptyState';
import { resolveMediaImageUrl } from '@/lib/imageUrls';
import { Search, Link as LinkIcon, User } from 'lucide-react';
import './LinkSourceModalContent.css';
import MergeComparisonModalContent from './MergeComparisonModalContent';

export default function LinkSourceModalContent({ personId, onClose }) {
  const { t } = useTranslation();
  const { toast } = useUi();
  const [source, setSource] = useState('stashdb');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedLinkTarget, setSelectedLinkTarget] = useState(null);

  const linkMutation = useLinkPersonSourceMutation();

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError('');
    try {
      const res = await api.people.searchTmdb(query.trim(), { adultOnly: true, source });
      setResults(res || []);
      setHasSearched(true);
    } catch (err) {
      setError(err.message || 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleLink = (externalId) => {
    // Strip source prefix if it exists in the result ID (e.g. stashdb:uuid -> uuid)
    let cleanId = externalId;
    if (typeof externalId === 'string' && externalId.includes(':')) {
      cleanId = externalId.split(':')[1] || externalId;
    }
    setSelectedLinkTarget(cleanId);
  };

  if (selectedLinkTarget) {
    return (
      <MergeComparisonModalContent
        personId={personId}
        source={source}
        externalId={selectedLinkTarget}
        onClose={onClose}
        onBack={() => setSelectedLinkTarget(null)}
      />
    );
  }

  return (
    <div className="link-source-modal">
      <form onSubmit={handleSearch} className="link-source-modal__search-form">
        <div className="link-source-modal__search-input-group">
          <div className="link-source-modal__search-source">
            <Dropdown
              className="add-people-dropdown"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              options={[
                { value: 'stashdb', label: 'StashDB' },
                { value: 'fansdb', label: 'FansDB' },
                { value: 'theporndb', label: 'THEPornDB' },
                { value: 'tmdb', label: 'TMDb' },
              ]}
            />
          </div>
          <div className="link-source-modal__form-input-wrapper">
            <Input
              type="text"
              placeholder={t('library.addPeople.adultTmdbSearchPlaceholder') || 'Search performer...'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <Tooltip content={isSearching ? 'Searching...' : 'Search'} side="top">
          <IconButton
            type="submit"
            variant="secondary"
            disabled={isSearching}
          >
            <Search size={16} />
          </IconButton>
        </Tooltip>
      </form>

      <div className="link-source-modal__results">
        {isSearching ? (
          <div className="link-source-modal__loading">Searching...</div>
        ) : error ? (
          <div className="link-source-modal__error">{error}</div>
        ) : results.length > 0 ? (
          <div className="link-source-modal__results-list">
            {results.map((item) => {
              const rawProfileUrl = item.profile_path || item.poster_path;
              const profileUrl = rawProfileUrl ? resolveMediaImageUrl(rawProfileUrl, 'personThumb') : null;
              return (
                <div key={item.id} className="link-source-modal__result-item">
                  <div className="link-source-modal__result-avatar">
                    {profileUrl ? (
                      <img src={profileUrl} alt={item.name} />
                    ) : (
                      <User size={20} />
                    )}
                  </div>
                  <div className="link-source-modal__result-info">
                    <div className="link-source-modal__result-name">{item.name}</div>
                    {item.disambiguation && (
                      <div className="link-source-modal__result-disambiguation">
                        {item.disambiguation}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleLink(item.id)}
                    disabled={linkMutation.isPending}
                    icon={LinkIcon}
                  >
                    Link
                  </Button>
                </div>
              );
            })}
          </div>
        ) : hasSearched ? (
          <EmptyState title="No performers found" />
        ) : (
          <div className="link-source-modal__placeholder">
            Select a database and type a performer's name to link their metadata.
          </div>
        )}
      </div>
    </div>
  );
}
