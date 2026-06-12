import Card from '@/ui/Card';
import Stack from '@/ui/Stack';
import Switch from '@/ui/Switch';
import Dropdown from '@/ui/Dropdown';
import Input from '@/ui/Input';
import { useTemplatePreview } from '../hooks';
import { FOLDER_COLLECTION_MODES } from '../settingsConstants.js';
import TemplateFieldSection from './TemplateFieldSection.jsx';
import { useSettingsFormContext } from '../SettingsFormContext.jsx';

export default function CollectionsTab({
  form,
  setForm,
  t,
  handleChange,
  insertTag,
  collectionModeOptions,
  formInputs
}) {
  const getPreview = useTemplatePreview(form);
  const { renderContext } = useSettingsFormContext();
  const isScanActive = Boolean(renderContext?.isBackgroundActive);
  const sortOptions = {
    enabled: form.folder_sort_by_type,
    moviesName: form.folder_movies_name,
    seriesName: form.folder_series_name
  };

  return (
    <Card
      title={t('settingsPage.sections.collections.title')}
      eyebrow={t('settingsPage.sections.collections.eyebrow')}
    >
      <Stack>
        <Switch
          id="folder_create_collection_dir"
          checked={form.folder_create_collection_dir}
          disabled={isScanActive}
          onChange={(e) => {
            const checked = e.target.checked;
            setForm(prev => {
              const next = { ...prev, folder_create_collection_dir: checked };
              if (
                checked &&
                (next.folder_collection_mode === FOLDER_COLLECTION_MODES.NEVER || !next.folder_collection_mode)
              ) {
                next.folder_collection_mode = FOLDER_COLLECTION_MODES.THRESHOLD;
              }
              return next;
            });
          }}
        >
          {t('settingsPage.sections.collections.createCollectionDir')}
        </Switch>
        <span className="ui-field__hint settings-hint--spaced">
          {t('settingsPage.sections.collections.createCollectionDirHint')}
        </span>

        {form.folder_create_collection_dir && (
          <>
            <Dropdown
              label={t('settingsPage.sections.collections.collectionMode')}
              value={form.folder_collection_mode}
              options={collectionModeOptions}
              disabled={isScanActive}
              onChange={handleChange('folder_collection_mode')}
              hint={t('settingsPage.sections.collections.collectionModeHint')}
            />

            {form.folder_collection_mode === FOLDER_COLLECTION_MODES.THRESHOLD && (
              <div className="settings-block-top">
                <Input
                  label={t('settingsPage.sections.collections.collectionThreshold')}
                  value={form.folder_collection_threshold}
                  disabled={isScanActive}
                  onChange={handleChange('folder_collection_threshold')}
                  placeholder="3"
                  type="number"
                  min="1"
                  hint={t('settingsPage.sections.collections.collectionThresholdHint')}
                />
              </div>
            )}

            <TemplateFieldSection
              t={t}
              inputRef={formInputs.folderCollection}
              label={t('settingsPage.sections.collections.collectionTemplate')}
              value={form.folder_collection_template}
              disabled={isScanActive}
              onChange={handleChange('folder_collection_template')}
              placeholder="{collection}"
              tags={['{collection}']}
              fieldKey="folder_collection_template"
              insertTag={insertTag}
              previewText={getPreview(form.folder_collection_template, 'collection', { isFile: false, sortOptions })}
              className="settings-block-top"
            />
          </>
        )}
      </Stack>
    </Card>
  );
}
