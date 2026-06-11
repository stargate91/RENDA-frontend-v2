import Dropdown from '../../../ui/Dropdown';

export default function OverrideMovieFields({
  targetLanguage,
  setTargetLanguage,
  source,
  setSource,
  edition,
  setEdition,
  audioType,
  setAudioType,
  LANGUAGE_OPTIONS,
  SOURCE_OPTIONS,
  EDITION_OPTIONS,
  AUDIO_TYPE_OPTIONS,
  t,
}) {
  return (
    <>
      <Dropdown
        label={t('organizer.overrideModal.labels.targetLanguage')}
        value={targetLanguage}
        onChange={(e) => setTargetLanguage(e.target.value)}
        options={LANGUAGE_OPTIONS}
        hint={t('organizer.overrideModal.hints.targetLanguage')}
      />
      <Dropdown
        label={t('organizer.overrideModal.labels.source')}
        value={source}
        onChange={(e) => setSource(e.target.value)}
        options={SOURCE_OPTIONS}
        hint={t('organizer.overrideModal.hints.source')}
      />
      <Dropdown
        label={t('organizer.overrideModal.labels.edition')}
        value={edition}
        onChange={(e) => setEdition(e.target.value)}
        options={EDITION_OPTIONS}
        hint={t('organizer.overrideModal.hints.edition')}
      />
      <Dropdown
        label={t('organizer.overrideModal.labels.audioType')}
        value={audioType}
        onChange={(e) => setAudioType(e.target.value)}
        options={AUDIO_TYPE_OPTIONS}
        hint={t('organizer.overrideModal.hints.audioType')}
      />
    </>
  );
}
