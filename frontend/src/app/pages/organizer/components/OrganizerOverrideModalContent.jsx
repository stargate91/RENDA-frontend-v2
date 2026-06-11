import { useState, useEffect } from 'react';
import Input from '../../../ui/Input';
import Button from '../../../ui/Button';
import Dropdown from '../../../ui/Dropdown';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateMediaMutation } from '../../../queries/organizerQueries';

const SUBCATEGORIES_BY_CATEGORY = {
  video: [
    { value: 'trailer', label: 'Trailer' },
    { value: 'sample', label: 'Sample' },
    { value: 'behind_the_scenes', label: 'Behind the Scenes' },
    { value: 'featurette', label: 'Featurette' },
    { value: 'deleted_scenes', label: 'Deleted Scenes' },
    { value: 'interview', label: 'Interview' },
    { value: 'scene_comparison', label: 'Scene Comparison' },
    { value: 'short', label: 'Short' },
    { value: 'promo', label: 'Promo' },
    { value: 'clip', label: 'Clip' },
    { value: 'other', label: 'Other' },
  ],
  image: [
    { value: 'poster', label: 'Poster' },
    { value: 'fanart', label: 'Fanart' },
    { value: 'disc', label: 'Disc' },
    { value: 'backdrop', label: 'Backdrop' },
    { value: 'banner', label: 'Banner' },
    { value: 'thumbnail', label: 'Thumbnail' },
    { value: 'logo', label: 'Logo' },
    { value: 'clearlogo', label: 'Clearlogo' },
    { value: 'character_art', label: 'Character Art' },
    { value: 'other', label: 'Other' },
  ],
  subtitle: [
    { value: 'full', label: 'Full' },
    { value: 'forced', label: 'Forced' },
    { value: 'sdh', label: 'SDH' },
    { value: 'hearing_impaired', label: 'Hearing Impaired' },
    { value: 'commentary_sub', label: 'Commentary Sub' },
    { value: 'lyrics', label: 'Lyrics' },
    { value: 'other', label: 'Other' },
  ],
  audio: [
    { value: 'dubbed', label: 'Dubbed' },
    { value: 'original', label: 'Original' },
    { value: 'commentary_audio', label: 'Commentary Audio' },
    { value: 'descriptive', label: 'Descriptive' },
    { value: 'isolated_score', label: 'Isolated Score' },
    { value: 'other', label: 'Other' },
  ],
  metadata: [
    { value: 'nfo', label: 'NFO' },
    { value: 'xml', label: 'XML' },
    { value: 'json', label: 'JSON' },
    { value: 'txt', label: 'TXT' },
    { value: 'url', label: 'URL' },
    { value: 'other', label: 'Other' },
  ],
};

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English (EN)' },
  { value: 'hu', label: 'Hungarian (HU)' },
  { value: 'de', label: 'German (DE)' },
  { value: 'fr', label: 'French (FR)' },
  { value: 'es', label: 'Spanish (ES)' },
  { value: 'it', label: 'Italian (IT)' },
  { value: 'zh', label: 'Chinese (ZH)' },
  { value: 'ko', label: 'Korean (KO)' },
  { value: 'ru', label: 'Russian (RU)' },
  { value: 'ja', label: 'Japanese (JA)' },
  { value: 'pt', label: 'Portuguese (PT)' },
  { value: 'pl', label: 'Polish (PL)' },
];

const SOURCE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'bluray', label: 'Blu-Ray' },
  { value: 'web', label: 'WEB-DL' },
  { value: 'dvd', label: 'DVD' },
  { value: 'tv', label: 'TV HDTV' },
  { value: 'cam', label: 'CAM' },
];

const EDITION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'theatrical', label: 'Theatrical Edition' },
  { value: 'directors_cut', label: "Director's Cut" },
  { value: 'extended', label: 'Extended Edition' },
  { value: 'unrated', label: 'Unrated' },
  { value: 'remastered', label: 'Remastered' },
  { value: 'special', label: 'Special Edition' },
  { value: 'ultimate', label: 'Ultimate' },
  { value: 'collectors', label: 'Collector\'s' },
  { value: 'fan_edit', label: 'Fan Edit' },
];

const AUDIO_TYPE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'mono', label: 'Mono' },
  { value: 'stereo', label: 'Stereo' },
  { value: 'surround', label: 'Surround Sound' },
  { value: 'dual_audio', label: 'Dual Audio' },
  { value: 'multi_audio', label: 'Multi Audio' },
];

const MAIN_TYPE_OPTIONS = [
  { value: 'movie', label: 'Movie' },
  { value: 'episode', label: 'Episode' },
  { value: 'bonus', label: 'Bonus Video' },
];

export default function OrganizerOverrideModalContent({ row, onClose, toast, api }) {
  const queryClient = useQueryClient();
  const isExtra = row.rawType === 'extra';
  const category = isExtra ? (row.rawPayload?.category || 'video') : 'video';
  const subcategoryList = SUBCATEGORIES_BY_CATEGORY[category] || [];

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

  const [mainType, setMainType] = useState(initialMainType);
  const [targetLanguage, setTargetLanguage] = useState(row.rawPayload?.target_language || 'en');
  const [source, setSource] = useState(row.rawPayload?.source || 'none');
  const [edition, setEdition] = useState(row.rawPayload?.edition || 'none');
  const [audioType, setAudioType] = useState(row.rawPayload?.audio_type || 'none');
  const [seasonNum, setSeasonNum] = useState(row.rawPayload?.fn_season || '');
  const [episodeNum, setEpisodeNum] = useState(row.rawPayload?.fn_episode || '');
  const [subcategory, setSubcategory] = useState(row.rawPayload?.subtype || 'other');
  const [language, setLanguage] = useState((row.rawPayload?.language || 'en').toLowerCase());
  const [parentId, setParentId] = useState(row.parent_id || (parentCandidates[0]?.value || ''));
  const updateMediaMutation = useUpdateMediaMutation();

  const handleSubmit = async (e) => {
    e.preventDefault();

    const updates = {};
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

  return (
    <form id="organizer-override-form" className="organizer-override-modal" style={{ overflowX: 'hidden' }} onSubmit={handleSubmit}>
      {/* 1. Main Category Choice */}
      {(!isExtra || category === 'video') && (
        <Dropdown
          label="Main Category"
          value={mainType}
          onChange={(e) => setMainType(e.target.value)}
          options={MAIN_TYPE_OPTIONS}
        />
      )}

      {/* 2. Parent Selection */}
      {(mainType === 'bonus' || (isExtra && mainType !== 'movie' && mainType !== 'episode')) && (
        <Dropdown
          label="Parent Item"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          options={parentCandidates}
        />
      )}

      {/* 3. Subcategory and Language for Extras / Bonus */}
      {(mainType === 'bonus' || (isExtra && mainType !== 'movie' && mainType !== 'episode')) && (
        <>
          {category !== 'metadata' && (
            <Dropdown
              label="Subcategory"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              options={subcategoryList}
            />
          )}

           {isExtra && (category === 'subtitle' || category === 'audio') && (
            <Dropdown
              label="Language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              options={LANGUAGE_OPTIONS}
            />
          )}
        </>
      )}

      {/* 4. Movie settings */}
      {mainType === 'movie' && (
        <>
          <Dropdown
            label="Target Language"
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            options={LANGUAGE_OPTIONS}
          />
          <Dropdown
            label="Source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            options={SOURCE_OPTIONS}
          />
          <Dropdown
            label="Edition"
            value={edition}
            onChange={(e) => setEdition(e.target.value)}
            options={EDITION_OPTIONS}
          />
          <Dropdown
            label="Audio Type"
            value={audioType}
            onChange={(e) => setAudioType(e.target.value)}
            options={AUDIO_TYPE_OPTIONS}
          />
        </>
      )}

      {/* 5. Episode settings */}
      {mainType === 'episode' && (
        <>
          <Dropdown
            label="Target Language"
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            options={LANGUAGE_OPTIONS}
          />
          <Dropdown
            label="Audio Type"
            value={audioType}
            onChange={(e) => setAudioType(e.target.value)}
            options={AUDIO_TYPE_OPTIONS}
          />
          <Input
            label="Season Number"
            type="number"
            value={seasonNum}
            onChange={(e) => setSeasonNum(e.target.value)}
            placeholder="e.g. 1"
          />
          <Input
            label="Episode Number"
            value={episodeNum}
            onChange={(e) => setEpisodeNum(e.target.value)}
            placeholder="e.g. 3 or 3-4"
          />
        </>
      )}
    </form>
  );
}
