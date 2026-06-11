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
        label="Target Language"
        value={targetLanguage}
        onChange={(e) => setTargetLanguage(e.target.value)}
        options={LANGUAGE_OPTIONS}
        hint={t('organizer.overrideModal.hints.targetLanguage')}
      />
      <Dropdown
        label="Audio Type"
        value={audioType}
        onChange={(e) => setAudioType(e.target.value)}
        options={AUDIO_TYPE_OPTIONS}
        hint={t('organizer.overrideModal.hints.audioType')}
      />
      <Input
        label="Season Number"
        type="number"
        value={seasonNum}
        onChange={(e) => setSeasonNum(e.target.value)}
        placeholder="e.g. 1"
        hint={t('organizer.overrideModal.hints.seasonNum')}
      />
      <Input
        label="Episode Number"
        value={episodeNum}
        onChange={(e) => setEpisodeNum(e.target.value)}
        placeholder="e.g. 3 or 3-4"
        hint={t('organizer.overrideModal.hints.episodeNum')}
      />
    </>
  );
}
