import Page from '@/ui/Page';
import SelectableCard from '@/ui/SelectableCard';
import { Eye, Flame } from 'lucide-react';

export default function LibraryModeChooser({ onSelectMode, t }) {
  return (
    <Page className="library-page library-page--chooser">
      <div className="library-chooser-container">
        <div className="library-chooser-header">
          <h1 className="library-chooser-title">{t('library.chooser.title') || 'Select Library Mode'}</h1>
          <p className="library-chooser-subtitle">{t('library.chooser.subtitle') || 'Choose how you want to browse your media library in this session.'}</p>
        </div>
        <div className="library-chooser-options">
          <SelectableCard
            variant="chooser"
            className="library-chooser-card library-chooser-card--sfw"
            onClick={() => onSelectMode('sfw')}
          >
            <div className="library-chooser-card__icon-wrapper">
              <Eye size={40} className="library-chooser-card__icon" />
            </div>
            <div className="library-chooser-card__content">
              <h2 className="library-chooser-card__title">{t('library.chooser.sfwTitle') || 'Normal Mode (SFW)'}</h2>
              <p className="library-chooser-card__description">{t('library.chooser.sfwDesc') || 'Browse your general movies, TV shows, and cast lists.'}</p>
            </div>
          </SelectableCard>
          <SelectableCard
            variant="chooser"
            className="library-chooser-card library-chooser-card--nsfw"
            onClick={() => onSelectMode('nsfw')}
          >
            <div className="library-chooser-card__icon-wrapper">
              <Flame size={40} className="library-chooser-card__icon" />
            </div>
            <div className="library-chooser-card__content">
              <h2 className="library-chooser-card__title">{t('library.chooser.nsfwTitle') || 'Adult Mode (NSFW)'}</h2>
              <p className="library-chooser-card__description">{t('library.chooser.nsfwDesc') || 'Browse adult content library, specialized collections, and stars.'}</p>
            </div>
          </SelectableCard>
        </div>
      </div>
    </Page>
  );
}
