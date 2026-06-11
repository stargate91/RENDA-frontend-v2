import Dropdown from '../../../ui/Dropdown';
import Input from '../../../ui/Input';

export default function OverrideEpisodeFields({
  targetLanguage,
  setTargetLanguage,
  audioType,
  setAudioType,
  seasonNum,
  setSeasonNum,
  episodeNum,
  setEpisodeNum,
  LANGUAGE_OPTIONS,
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
        label={t('organizer.overrideModal.labels.audioType')}
        value={audioType}
        onChange={(e) => setAudioType(e.target.value)}
        options={AUDIO_TYPE_OPTIONS}
        hint={t('organizer.overrideModal.hints.audioType')}
      />
      <Input
        label={t('organizer.overrideModal.labels.seasonNumber')}
        type="number"
        value={seasonNum}
        onChange={(e) => setSeasonNum(e.target.value)}
        placeholder={t('organizer.overrideModal.placeholders.seasonNumber')}
        hint={t('organizer.overrideModal.hints.seasonNum')}
      />
      <Input
        label={t('organizer.overrideModal.labels.episodeNumber')}
        value={episodeNum}
        onChange={(e) => setEpisodeNum(e.target.value)}
        placeholder={t('organizer.overrideModal.placeholders.episodeNumber')}
        hint={t('organizer.overrideModal.hints.episodeNum')}
      />
    </>
  );
}
