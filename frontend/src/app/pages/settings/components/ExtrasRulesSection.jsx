import Card from '@/ui/Card';
import Stack from '@/ui/Stack';
import {
  EXTRA_VIDEO_TAGS,
  EXTRA_SUB_TAGS,
  EXTRA_AUDIO_TAGS,
  EXTRA_IMG_TAGS,
  EXTRA_META_TAGS
} from '../settingsTemplateTags.js';
import {
  useSettingsField,
  useSettingsFormContext,
  useSettingsInputRef,
  useSettingsViewContext,
} from '../SettingsFormContext.jsx';
import { useTemplatePreview } from '../hooks';
import TemplateRuleField from './TemplateRuleField.jsx';

export default function ExtrasRulesSection({ t }) {
  const { extraActionOptions } = useSettingsViewContext();
  const { actions } = useSettingsFormContext();
  const videoActionField = useSettingsField('extras_video_action');
  const subActionField = useSettingsField('extras_sub_action');
  const audioActionField = useSettingsField('extras_audio_action');
  const imageActionField = useSettingsField('extras_img_action');
  const metaActionField = useSettingsField('extras_meta_action');
  const videoTemplateField = useSettingsField('extras_video_template');
  const subTemplateField = useSettingsField('extras_sub_template');
  const audioTemplateField = useSettingsField('extras_audio_template');
  const imageTemplateField = useSettingsField('extras_img_template');
  const metaTemplateField = useSettingsField('extras_meta_template');
  const getPreview = useTemplatePreview({
    naming_filename_casing: useSettingsField('naming_filename_casing').value,
    naming_word_separator: useSettingsField('naming_word_separator').value,
    naming_custom_tag: useSettingsField('naming_custom_tag').value,
  });
  const extraVideoInputRef = useSettingsInputRef('extrasVideo');
  const extraSubInputRef = useSettingsInputRef('extrasSub');
  const extraAudioInputRef = useSettingsInputRef('extrasAudio');
  const extraImgInputRef = useSettingsInputRef('extrasImage');
  const extraMetaInputRef = useSettingsInputRef('extrasMeta');

  return (
    <Card
      title={t('settingsPage.sections.extras.rulesTitle')}
      eyebrow={t('settingsPage.sections.extras.rulesEyebrow')}
    >
      <Stack gap="xl">
        <div className="settings-section-stack">
          <h3 className="settings-section-heading">
            {t('settingsPage.sections.extras.commonExtrasTitle')}
          </h3>
          <Stack gap="xl">
            <TemplateRuleField
              t={t}
              actionFieldName="extras_video_action"
              actionLabel={t('settingsPage.sections.extras.extraVideoAction')}
              actionField={videoActionField}
              actionOptions={extraActionOptions}
              templateFieldName="extras_video_template"
              templateLabel={t('settingsPage.sections.extras.extraVideoTemplate')}
              templateField={videoTemplateField}
              templatePlaceholder="{parent_name}-{sub_category}"
              templateTags={EXTRA_VIDEO_TAGS}
              templateFieldKey="extras_video_template"
              inputRef={extraVideoInputRef}
              insertTag={actions.insertTag}
              previewText={getPreview(videoTemplateField.value, 'extraVideo')}
            />
            <TemplateRuleField
              t={t}
              actionFieldName="extras_sub_action"
              actionLabel={t('settingsPage.sections.extras.subtitleAction')}
              actionField={subActionField}
              actionOptions={extraActionOptions}
              templateFieldName="extras_sub_template"
              templateLabel={t('settingsPage.sections.extras.subtitleTemplate')}
              templateField={subTemplateField}
              templatePlaceholder="{parent_name}.{language}"
              templateTags={EXTRA_SUB_TAGS}
              templateFieldKey="extras_sub_template"
              inputRef={extraSubInputRef}
              insertTag={actions.insertTag}
              previewText={getPreview(subTemplateField.value, 'extraSub')}
            />
          </Stack>
        </div>
        <div className="settings-section-stack">
          <h3 className="settings-section-heading">
            {t('settingsPage.sections.extras.otherExtrasTitle')}
          </h3>
          <Stack gap="xl">
            <TemplateRuleField
              t={t}
              actionFieldName="extras_audio_action"
              actionLabel={t('settingsPage.sections.extras.audioAction')}
              actionField={audioActionField}
              actionOptions={extraActionOptions}
              templateFieldName="extras_audio_template"
              templateLabel={t('settingsPage.sections.extras.audioTemplate')}
              templateField={audioTemplateField}
              templatePlaceholder="{parent_name}.{language}"
              templateTags={EXTRA_AUDIO_TAGS}
              templateFieldKey="extras_audio_template"
              inputRef={extraAudioInputRef}
              insertTag={actions.insertTag}
              previewText={getPreview(audioTemplateField.value, 'extraAudio')}
            />
            <TemplateRuleField
              t={t}
              actionFieldName="extras_img_action"
              actionLabel={t('settingsPage.sections.extras.imageAction')}
              actionField={imageActionField}
              actionOptions={extraActionOptions}
              templateFieldName="extras_img_template"
              templateLabel={t('settingsPage.sections.extras.imageTemplate')}
              templateField={imageTemplateField}
              templatePlaceholder="{sub_category}"
              templateTags={EXTRA_IMG_TAGS}
              templateFieldKey="extras_img_template"
              inputRef={extraImgInputRef}
              insertTag={actions.insertTag}
              previewText={getPreview(imageTemplateField.value, 'extraImg')}
            />
            <TemplateRuleField
              t={t}
              actionFieldName="extras_meta_action"
              actionLabel={t('settingsPage.sections.extras.metadataAction')}
              actionField={metaActionField}
              actionOptions={extraActionOptions}
              templateFieldName="extras_meta_template"
              templateLabel={t('settingsPage.sections.extras.metadataTemplate')}
              templateField={metaTemplateField}
              templatePlaceholder="{parent_name}"
              templateTags={EXTRA_META_TAGS}
              templateFieldKey="extras_meta_template"
              inputRef={extraMetaInputRef}
              insertTag={actions.insertTag}
              previewText={getPreview(metaTemplateField.value, 'extraMeta')}
            />
          </Stack>
        </div>
      </Stack>
    </Card>
  );
}
