import { useState, useMemo } from 'react';
import Dropdown from '../../../ui/Dropdown';
import { useTranslation } from '../../../providers/LanguageProvider';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateMediaMutation } from '../../../queries';
import OverrideMovieFields from './OverrideMovieFields';
import OverrideEpisodeFields from './OverrideEpisodeFields';
import OverrideExtraFields from './OverrideExtraFields';

import {
  SUBCATEGORIES_BY_CATEGORY,
  LANGUAGE_OPTIONS,
  SOURCE_OPTIONS,
  EDITION_OPTIONS,
  AUDIO_TYPE_OPTIONS,
  MAIN_TYPE_OPTIONS,
} from './overrideConstants';

export default function OrganizerOverrideModalContent({ row, onClose, toast }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const translatedLanguageOptions = useMemo(() =>
    LANGUAGE_OPTIONS.map((opt) => ({
      ...opt,
      label: t(`languages.${opt.value}`) || opt.label,
    })),
    [t]
  );
  const isExtra = row.rawType === 'extra';
  const category = isExtra ? (row.rawPayload?.category || 'video') : 'video';

  const translatedSubcategoriesByCategory = useMemo(() => {
    const result = {};
    Object.keys(SUBCATEGORIES_BY_CATEGORY).forEach((catKey) => {
      result[catKey] = SUBCATEGORIES_BY_CATEGORY[catKey].map((opt) => ({
        ...opt,
        label: t(`organizer.overrideModal.options.subcategories.${opt.value}`) || opt.label,
      }));
    });
    return result;
  }, [t]);

  const translatedSourceOptions = useMemo(() =>
    SOURCE_OPTIONS.map((opt) => ({
      ...opt,
      label: t(`organizer.overrideModal.options.sources.${opt.value}`) || opt.label,
    })),
    [t]
  );

  const translatedEditionOptions = useMemo(() =>
    EDITION_OPTIONS.map((opt) => ({
      ...opt,
      label: t(`organizer.overrideModal.options.editions.${opt.value}`) || opt.label,
    })),
    [t]
  );

  const translatedAudioTypeOptions = useMemo(() =>
    AUDIO_TYPE_OPTIONS.map((opt) => ({
      ...opt,
      label: t(`organizer.overrideModal.options.audioTypes.${opt.value}`) || opt.label,
    })),
    [t]
  );

  const translatedMainTypeOptions = useMemo(() =>
    MAIN_TYPE_OPTIONS.map((opt) => ({
      ...opt,
      label: t(`organizer.overrideModal.options.mainTypes.${opt.value}`) || opt.label,
    })),
    [t]
  );

  // Get parent candidates (movies + series) from cache
  const discovery = queryClient.getQueryData(['discovery']) || {};
  const movies = discovery.movies || [];
  const series = discovery.series || [];
  const parentCandidates = [...movies, ...series].map((item) => ({
    value: item.id,
    label: item.filename || item.current_path || `ID: ${item.id}`,
  }));

  // Initial values setup
  const initialMainType = isExtra
    ? (category === 'video' ? 'bonus' : 'extra')
    : row.rawType;

  const initialSeason = useMemo(() => row.rawPayload?.season ?? row.rawPayload?.fn_season ?? row.rawPayload?.fd_season ?? row.rawPayload?.it_season ?? '', [row.rawPayload]);
  const initialEpisode = useMemo(() => row.rawPayload?.episode ?? row.rawPayload?.fn_episode ?? row.rawPayload?.fd_episode ?? row.rawPayload?.it_episode ?? '', [row.rawPayload]);

  const [mainType, setMainType] = useState(initialMainType);

  const subcategoryList = translatedSubcategoriesByCategory[mainType === 'bonus' ? 'video' : category] || [];

  const [targetLanguage, setTargetLanguage] = useState(row.rawPayload?.target_language || 'en');
  const [source, setSource] = useState(row.rawPayload?.source || 'none');
  const [edition, setEdition] = useState(row.rawPayload?.edition || 'none');
  const [audioType, setAudioType] = useState(row.rawPayload?.audio_type || 'none');
  const [seasonNum, setSeasonNum] = useState(initialSeason);
  const [episodeNum, setEpisodeNum] = useState(initialEpisode);
  const [subcategory, setSubcategory] = useState(row.rawPayload?.subtype || 'other');
  const [language, setLanguage] = useState((row.rawPayload?.language || 'en').toLowerCase());
  const [parentId, setParentId] = useState(row.parent_id || (parentCandidates[0]?.value || ''));
  const [matchAction, setMatchAction] = useState('keep');
  const updateMediaMutation = useUpdateMediaMutation();

  const isMatchedEpisode = row.rawType === 'episode' && row.rawStatus === 'matched';
  const isSeasonModified = String(seasonNum) !== String(initialSeason);
  const isEpisodeModified = String(episodeNum) !== String(initialEpisode);
  const showSelector = isMatchedEpisode && (isSeasonModified || isEpisodeModified);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (mainType === 'episode') {
      const isSeasonEmpty = !String(seasonNum ?? '').trim();
      const isEpisodeEmpty = !String(episodeNum ?? '').trim();
      if (isSeasonEmpty || isEpisodeEmpty) {
        toast('Season and Episode numbers are required for episodes', 'danger');
        return;
      }
    }

    const updates = {};
    if (showSelector && matchAction === 'reset') {
      updates.reset_match = true;
    }

    if (!isExtra) {
      // Media updates
      updates.main_type = mainType;
      if (mainType === 'bonus') {
        updates.parent_id = parentId;
      } else {
        updates.target_language = targetLanguage;
        updates.audio_type = audioType;
        if (mainType === 'movie') {
          updates.source = source;
          updates.edition = edition;
        } else if (mainType === 'episode') {
          updates.season = seasonNum;
          updates.episode = episodeNum;
        }
      }
    } else {
      // Extra updates
      updates.main_type = mainType; // could trigger convert to movie/episode
      if (mainType === 'movie' || mainType === 'episode') {
        updates.parent_id = parentId; // not strictly needed for media but useful
        if (mainType === 'episode') {
          updates.season = seasonNum;
          updates.episode = episodeNum;
        }
      } else {
        updates.parent_id = parentId;
        if (category !== 'metadata') {
          updates.subtype = subcategory;
        }
        if (category === 'subtitle' || category === 'audio') {
          updates.language = language;
        }
      }
    }

    try {
      await updateMediaMutation.mutateAsync({
        id: row.itemId,
        type: isExtra ? 'extra' : 'media',
        updates,
      });
      toast('Overrides saved successfully', 'success');
      onClose();
    } catch (err) {
      toast(err.message || 'Failed to save overrides', 'danger');
    }
  };

  const renderFormFields = () => (
    <>
      {/* 1. Main Category Choice */}
      {(!isExtra || category === 'video') && (
        <Dropdown
          label="Main Category"
          value={mainType}
          onChange={(e) => setMainType(e.target.value)}
          options={translatedMainTypeOptions}
          hint={t('organizer.overrideModal.hints.mainType')}
        />
      )}

      {/* 2. Extra/Bonus Selection */}
      {(mainType === 'bonus' || (isExtra && mainType !== 'movie' && mainType !== 'episode')) && (
        <OverrideExtraFields
          parentId={parentId}
          setParentId={setParentId}
          subcategory={subcategory}
          setSubcategory={setSubcategory}
          language={language}
          setLanguage={setLanguage}
          parentCandidates={parentCandidates}
          category={category}
          subcategoryList={subcategoryList}
          isExtra={isExtra}
          LANGUAGE_OPTIONS={translatedLanguageOptions}
          t={t}
        />
      )}

      {/* 3. Movie settings */}
      {mainType === 'movie' && (
        <OverrideMovieFields
          targetLanguage={targetLanguage}
          setTargetLanguage={setTargetLanguage}
          source={source}
          setSource={setSource}
          edition={edition}
          setEdition={setEdition}
          audioType={audioType}
          setAudioType={setAudioType}
          LANGUAGE_OPTIONS={translatedLanguageOptions}
          SOURCE_OPTIONS={translatedSourceOptions}
          EDITION_OPTIONS={translatedEditionOptions}
          AUDIO_TYPE_OPTIONS={translatedAudioTypeOptions}
          t={t}
        />
      )}

      {/* 4. Episode settings */}
      {mainType === 'episode' && (
        <OverrideEpisodeFields
          targetLanguage={targetLanguage}
          setTargetLanguage={setTargetLanguage}
          audioType={audioType}
          setAudioType={setAudioType}
          seasonNum={seasonNum}
          setSeasonNum={setSeasonNum}
          episodeNum={episodeNum}
          setEpisodeNum={setEpisodeNum}
          LANGUAGE_OPTIONS={translatedLanguageOptions}
          AUDIO_TYPE_OPTIONS={translatedAudioTypeOptions}
          t={t}
        />
      )}
    </>
  );

  return (
    <form id="organizer-override-form" className="organizer-override-modal" style={{ overflowX: 'hidden' }} onSubmit={handleSubmit}>
      {showSelector ? (
        <div className="single-override-layout">
          <div className="single-override-layout__side-panel">
            <h4 className="organizer-override-modal__section-title">
              {t('organizer.overrideModal.matchAction.title') || 'Match Action'}
            </h4>
            <p className="organizer-override-field__label-text" style={{ fontSize: '12px', lineHeight: '1.4', marginBottom: 'var(--space-2)' }}>
              {t('organizer.overrideModal.matchAction.description') || 'Choose what to do with the current series match since season or episode changed:'}
            </p>
            
            <div
              className={`match-action-option ${matchAction === 'keep' ? 'is-selected' : ''}`}
              onClick={() => setMatchAction('keep')}
            >
              <label className="match-action-option__radio-label">
                <input
                  type="radio"
                  name="matchAction"
                  checked={matchAction === 'keep'}
                  onChange={() => setMatchAction('keep')}
                  style={{ cursor: 'pointer' }}
                />
                {t('organizer.overrideModal.matchAction.keep') || 'Keep current series match'}
              </label>
              <span className="match-action-option__description">
                {t('organizer.overrideModal.matchAction.keepDesc') || 'Update season/episode under the series.'}
              </span>
            </div>

            <div
              className={`match-action-option ${matchAction === 'reset' ? 'is-selected' : ''}`}
              onClick={() => setMatchAction('reset')}
            >
              <label className="match-action-option__radio-label">
                <input
                  type="radio"
                  name="matchAction"
                  checked={matchAction === 'reset'}
                  onChange={() => setMatchAction('reset')}
                  style={{ cursor: 'pointer' }}
                />
                {t('organizer.overrideModal.matchAction.reset') || 'Reset match (Pending)'}
              </label>
              <span className="match-action-option__description">
                {t('organizer.overrideModal.matchAction.resetDesc') || 'Remove match and return to Review Needed.'}
              </span>
            </div>
          </div>
          <div className="single-override-layout__form">
            {renderFormFields()}
          </div>
        </div>
      ) : (
        renderFormFields()
      )}
    </form>
  );
}
