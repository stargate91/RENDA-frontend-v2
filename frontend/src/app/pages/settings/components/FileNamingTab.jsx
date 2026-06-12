import Card from '@/ui/Card';
import Stack from '@/ui/Stack';
import Input from '@/ui/Input';
import Dropdown from '@/ui/Dropdown';
import { MOVIE_TAGS, EPISODE_TAGS } from '../settingsTemplateTags.js';
import { useTemplatePreview } from '../hooks';
import SettingsLiveImpact from './SettingsLiveImpact.jsx';
import TemplateFieldSection from './TemplateFieldSection.jsx';
import { useSettingsFormContext } from '../SettingsFormContext.jsx';

export default function FileNamingTab({
  form,
  t,
  handleChange,
  insertTag,
  casingOptions,
  separatorOptions,
  formInputs
}) {
  const getPreview = useTemplatePreview(form);
  const { renderContext } = useSettingsFormContext();
  const isScanActive = Boolean(renderContext?.isBackgroundActive);

  return (
    <Stack gap="xl">
      <Card
        title={t('settingsPage.sections.fileNaming.title')}
        eyebrow={t('settingsPage.sections.fileNaming.eyebrow')}
      >
        <Stack gap="xl">
          <div className="settings-section-stack">
            <h3 className="settings-section-heading">
              {t('settingsPage.sections.fileNaming.styleTitle')}
            </h3>
            <Stack gap="lg">
              <Dropdown
                label={t('settingsPage.sections.fileNaming.casingLabel')}
                hint={t('settingsPage.sections.fileNaming.casingHint')}
                value={form.naming_filename_casing}
                options={casingOptions}
                disabled={isScanActive}
                onChange={handleChange('naming_filename_casing')}
              />
              <Dropdown
                label={t('settingsPage.sections.fileNaming.separatorLabel')}
                hint={t('settingsPage.sections.fileNaming.separatorHint')}
                value={form.naming_word_separator}
                options={separatorOptions}
                disabled={isScanActive}
                onChange={handleChange('naming_word_separator')}
              />
            </Stack>
          </div>

          <div className="settings-section-stack">
            <h3 className="settings-section-heading">
              {t('settingsPage.sections.fileNaming.templatesTitle')}
            </h3>
            <Stack gap="lg">
              <Input
                label={t('settingsPage.sections.fileNaming.customTagLabel')}
                hint={t('settingsPage.sections.fileNaming.customTagHint')}
                value={form.naming_custom_tag}
                disabled={isScanActive}
                onChange={handleChange('naming_custom_tag')}
                placeholder={t('settingsPage.sections.fileNaming.defaultCustomTagPlaceholder')}
              />

              <TemplateFieldSection
                t={t}
                inputRef={formInputs.namingMovie}
                label={t('settingsPage.sections.fileNaming.movieTemplateLabel')}
                hint={t('settingsPage.sections.fileNaming.movieTemplateHint')}
                value={form.naming_movie_template}
                disabled={isScanActive}
                onChange={handleChange('naming_movie_template')}
                placeholder="{title} ({year}) {resolution}"
                tags={MOVIE_TAGS}
                fieldKey="naming_movie_template"
                insertTag={insertTag}
                previewText={getPreview(form.naming_movie_template, 'movie')}
              />

              <TemplateFieldSection
                t={t}
                inputRef={formInputs.namingEpisode}
                label={t('settingsPage.sections.fileNaming.episodeTemplateLabel')}
                hint={t('settingsPage.sections.fileNaming.episodeTemplateHint')}
                value={form.naming_episode_template}
                disabled={isScanActive}
                onChange={handleChange('naming_episode_template')}
                placeholder="{series_title} - S{season}E{episode} - {episode_title}"
                tags={EPISODE_TAGS}
                fieldKey="naming_episode_template"
                insertTag={insertTag}
                previewText={getPreview(form.naming_episode_template, 'episode')}
              />
            </Stack>
          </div>

          <div className="settings-section-stack">
            <h3 className="settings-section-heading">
              {t('settingsPage.sections.fileNaming.fileTypesTitle')}
            </h3>
            <Input
              label={t('settingsPage.sections.fileNaming.videoExtsLabel')}
              hint={t('settingsPage.sections.fileNaming.videoExtsHint')}
              value={form.naming_video_exts}
              disabled={isScanActive}
              onChange={handleChange('naming_video_exts')}
              placeholder=".mkv, .mp4, .avi, .m4v, .mov, .wmv, .mpg, .mpeg"
            />
          </div>
        </Stack>
      </Card>

      <SettingsLiveImpact
        form={form}
        t={t}
        title={t('settingsPage.sections.liveImpact.title')}
        eyebrow={t('settingsPage.sections.liveImpact.eyebrow')}
        hint={t('settingsPage.sections.liveImpact.fileNamingHint')}
      />
    </Stack>
  );
}
