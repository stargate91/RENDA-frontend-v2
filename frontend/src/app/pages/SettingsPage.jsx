import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import Button from '@/ui/Button';
import Card from '@/ui/Card';
import Inline from '@/ui/Inline';
import Input from '@/ui/Input';
import Page from '@/ui/Page';
import Stack from '@/ui/Stack';
import Checkbox from '@/ui/Checkbox';
import { useSettingsQuery, useUpdateSettingsMutation, useClearDatabaseMutation } from '@/queries';
import { useUi } from '@/providers/UiProvider';
import { selectFile, selectFolder } from '@/lib/ipc';
import Spinner from '@/ui/Spinner';
import { useTranslation } from '@/providers/LanguageProvider';

const COLLISION_OPTIONS = [
  { value: 'keep_both', label: 'Keep Both' },
  { value: 'skip', label: 'Skip' },
  { value: 'replace_if_better', label: 'Replace If Better' },
  { value: 'replace', label: 'Replace Always' },
];

const EXTRA_ACTION_OPTIONS = [
  { value: 'rename', label: 'Rename' },
  { value: 'ignore', label: 'Skip' },
  { value: 'delete', label: 'Delete' },
];

const METADATA_LANGUAGE_OPTIONS = [
  { value: 'en-US', label: 'English (English)' },
  { value: 'hu-HU', label: 'Hungarian (Magyar)' },
  { value: 'de-DE', label: 'German (Deutsch)' },
  { value: 'fr-FR', label: 'French (Français)' },
  { value: 'es-ES', label: 'Spanish (Español)' },
  { value: 'it-IT', label: 'Italian (Italiano)' },
  { value: 'zh-CN', label: 'Chinese (中文)' },
  { value: 'ko-KR', label: 'Korean (한국어)' },
  { value: 'ru-RU', label: 'Russian (Русский)' },
  { value: 'ja-JP', label: 'Japanese (日本語)' },
  { value: 'pt-PT', label: 'Portuguese (Português)' },
  { value: 'pl-PL', label: 'Polish (Polski)' },
];

const TARGET_LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English (English)' },
  { value: 'hu', label: 'Hungarian (Magyar)' },
  { value: 'de', label: 'German (Deutsch)' },
  { value: 'fr', label: 'French (Français)' },
  { value: 'es', label: 'Spanish (Español)' },
  { value: 'it', label: 'Italian (Italiano)' },
  { value: 'zh', label: 'Chinese (中文)' },
  { value: 'ko', label: 'Korean (한국어)' },
  { value: 'ru', label: 'Russian (Русский)' },
  { value: 'ja', label: 'Japanese (日本語)' },
  { value: 'pt', label: 'Portuguese (Português)' },
  { value: 'pl', label: 'Polish (Polski)' },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const settingsQuery = useSettingsQuery();
  const settings = settingsQuery.data;
  const queryClient = useQueryClient();
  const { toast, openModal, closeModal } = useUi();
  const [isSaving, setIsSaving] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const updateSettingsMutation = useUpdateSettingsMutation();
  const clearDbMutation = useClearDatabaseMutation();
  const [form, setForm] = useState({
    default_scan_dir: '',
    folder_library_path: '',
    collision_strategy: 'keep_both',
    collision_duration_tolerance_seconds: '10',
    extras_video_action: 'rename',
    extras_sub_action: 'rename',
    extras_audio_action: 'rename',
    extras_img_action: 'rename',
    extras_meta_action: 'rename',
    vlc_path: '',
    mpc_path: '',
    tmdb_api_key: '',
    tmdb_bearer_token: '',
    omdb_api_key: '',
    ui_language: 'en',
    metadata_follows_ui: true,
    target_follows_ui: true,
    primary_metadata_language: 'en-US',
    default_target_language: 'en',
  });

  useEffect(() => {
    if (settings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        default_scan_dir: settings.default_scan_dir || '',
        folder_library_path: settings.folder_library_path || '',
        collision_strategy: settings.collision_strategy || 'keep_both',
        collision_duration_tolerance_seconds: String(settings.collision_duration_tolerance_seconds || '10'),
        extras_video_action: settings.extras_video_action || 'rename',
        extras_sub_action: settings.extras_sub_action || 'rename',
        extras_audio_action: settings.extras_audio_action || 'rename',
        extras_img_action: settings.extras_img_action || 'rename',
        extras_meta_action: settings.extras_meta_action || 'rename',
        vlc_path: settings.vlc_path || '',
        mpc_path: settings.mpc_path || '',
        tmdb_api_key: settings.tmdb_api_key || '',
        tmdb_bearer_token: settings.tmdb_bearer_token || '',
        omdb_api_key: settings.omdb_api_key || '',
        ui_language: settings.ui_language || 'en',
        metadata_follows_ui: settings.metadata_follows_ui !== undefined ? settings.metadata_follows_ui : true,
        target_follows_ui: settings.target_follows_ui !== undefined ? settings.target_follows_ui : true,
        primary_metadata_language: settings.primary_metadata_language || 'en-US',
        default_target_language: settings.default_target_language || 'en',
      });
    }
  }, [settings]);

  if (settingsQuery.isLoading) {
    return (
      <Page title={t('sidebar.settings')} description={t('settingsPage.loading')}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <Spinner label={t('settingsPage.loading')} />
          </div>
        </Card>
      </Page>
    );
  }

  if (settingsQuery.isError) {
    return (
      <Page title={t('sidebar.settings')} description={t('settingsPage.errorTitle')}>
        <Card title={t('settingsPage.errorTitle')}>
          <Stack>
            <span className="ui-field__hint">
              {t('settingsPage.errorText')}
            </span>
            <Inline>
              <Button variant="primary" onClick={() => settingsQuery.refetch()}>
                {t('settingsPage.retry')}
              </Button>
            </Inline>
          </Stack>
        </Card>
      </Page>
    );
  }

  const handleChange = (key) => (event) => {
    setForm((current) => ({
      ...current,
      [key]: event.target.value,
    }));
  };

  const handleCheckboxChange = (key) => (event) => {
    setForm((current) => ({
      ...current,
      [key]: event.target.checked,
    }));
  };

  const handlePickFolder = (key) => async () => {
    const selectedPath = await selectFolder(form[key]);
    if (!selectedPath) {
      return;
    }

    setForm((current) => ({
      ...current,
      [key]: selectedPath,
    }));
  };

  const handlePickFile = (key) => async () => {
    const selectedPath = await selectFile(form[key]);
    if (!selectedPath) {
      return;
    }

    setForm((current) => ({
      ...current,
      [key]: selectedPath,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        default_scan_dir: form.default_scan_dir.trim(),
        folder_library_path: form.folder_library_path.trim(),
        collision_strategy: form.collision_strategy,
        collision_duration_tolerance_seconds: String(form.collision_duration_tolerance_seconds || '10').trim(),
        extras_video_action: form.extras_video_action,
        extras_sub_action: form.extras_sub_action,
        extras_audio_action: form.extras_audio_action,
        extras_img_action: form.extras_img_action,
        extras_meta_action: form.extras_meta_action,
        vlc_path: form.vlc_path.trim(),
        mpc_path: form.mpc_path.trim(),
        tmdb_api_key: form.tmdb_api_key.trim(),
        tmdb_bearer_token: form.tmdb_bearer_token.trim(),
        omdb_api_key: form.omdb_api_key.trim(),
        ui_language: form.ui_language,
        metadata_follows_ui: form.metadata_follows_ui,
        target_follows_ui: form.target_follows_ui,
        primary_metadata_language: form.metadata_follows_ui
          ? (form.ui_language === 'en' ? 'en-US' : form.ui_language)
          : form.primary_metadata_language,
        default_target_language: form.target_follows_ui
          ? form.ui_language
          : form.default_target_language,
      };

      await updateSettingsMutation.mutateAsync(payload);

      await queryClient.refetchQueries({ queryKey: ['discovery'] });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['discovery-count'] });
      await queryClient.invalidateQueries({ queryKey: ['stats'] });
      toast('Settings saved', 'success');
    } catch (error) {
      toast(error.message || 'Failed to save settings', 'danger');
    } finally {
      setIsSaving(false);
    }
  };

  const handleWipeDatabase = () => {
    openModal({
      title: t('settingsPage.dangerZone.confirmTitle'),
      icon: AlertTriangle,
      variant: 'danger',
      content: (
        <p className="ui-modal__body-text">
          {t('settingsPage.dangerZone.confirm')}
        </p>
      ),
      footer: (
        <Inline gap="md">
          <Button variant="secondary-neutral" onClick={closeModal}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              closeModal();
              setIsWiping(true);
              try {
                await clearDbMutation.mutateAsync({ wipe: true });
                await queryClient.resetQueries();
                toast(t('settingsPage.dangerZone.success'), 'success');
              } catch (error) {
                toast(error.message || t('settingsPage.dangerZone.failed'), 'danger');
              } finally {
                setIsWiping(false);
              }
            }}
          >
            {t('settingsPage.dangerZone.button')}
          </Button>
        </Inline>
      ),
    });
  };

  return (
    <Page title="Settings" description="Quick API key entry for scan prerequisites.">
      <Card title="Language" eyebrow="Application">
        <Stack>
          <label className="ui-field">
            <span className="ui-field__label">App Language</span>
            <select className="ui-select" value={form.ui_language} onChange={handleChange('ui_language')}>
              <option value="en">English (Angol)</option>
            </select>
            <span className="ui-field__hint">RENDA uses English by default. More languages are coming soon!</span>
          </label>
          <Checkbox
            checked={form.metadata_follows_ui}
            onChange={handleCheckboxChange('metadata_follows_ui')}
          >
            Metadata should follow the App Language
          </Checkbox>
          <span className="ui-field__hint" style={{ marginTop: '-8px', marginBottom: '8px' }}>
            If checked, RENDA will fetch movie/episode titles and descriptions matching your App Language (e.g. English details from TMDB).
          </span>
          {!form.metadata_follows_ui && (
            <label className="ui-field" style={{ marginLeft: '24px', marginBottom: '12px' }}>
              <span className="ui-field__label">Metadata Language</span>
              <select className="ui-select" value={form.primary_metadata_language} onChange={handleChange('primary_metadata_language')}>
                {METADATA_LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{t(`languages.${o.value}`) || o.label}</option>
                ))}
              </select>
              <span className="ui-field__hint">Choose which language to query TMDB and OMDb metadata in.</span>
            </label>
          )}
          <Checkbox
            checked={form.target_follows_ui}
            onChange={handleCheckboxChange('target_follows_ui')}
          >
            Target Language should follow the App Language
          </Checkbox>
          <span className="ui-field__hint" style={{ marginTop: '-8px', marginBottom: '8px' }}>
            If checked, the final renamed files and folders on your disk will be formatted in your App Language.
          </span>
          {!form.target_follows_ui && (
            <label className="ui-field" style={{ marginLeft: '24px' }}>
              <span className="ui-field__label">Target Language (Renaming)</span>
              <select className="ui-select" value={form.default_target_language} onChange={handleChange('default_target_language')}>
                {TARGET_LANGUAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{t(`languages.${o.value}`) || o.label}</option>
                ))}
              </select>
              <span className="ui-field__hint">Choose which language to rename physical files and folders in.</span>
            </label>
          )}
        </Stack>
      </Card>
      <Card title="Folders" eyebrow="Organizer">
        <Stack>
          <Input
            label="Scan Folder"
            value={form.default_scan_dir}
            onChange={handleChange('default_scan_dir')}
            placeholder="Default scan source folder"
          />
          <Inline>
            <Button variant="secondary" onClick={handlePickFolder('default_scan_dir')} disabled={isSaving}>
              Browse Scan Folder
            </Button>
          </Inline>
          <Input
            label="Target Folder"
            value={form.folder_library_path}
            onChange={handleChange('folder_library_path')}
            placeholder="Library target folder"
          />
          <Inline>
            <Button variant="secondary" onClick={handlePickFolder('folder_library_path')} disabled={isSaving}>
              Browse Target Folder
            </Button>
          </Inline>
        </Stack>
      </Card>
      <Card title="Collision & Extras" eyebrow="Organizer Rules">
        <Stack>
          <label className="ui-field">
            <span className="ui-field__label">Collision Strategy</span>
            <select className="ui-select" value={form.collision_strategy} onChange={handleChange('collision_strategy')}>
              {COLLISION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <Input
            label="Replace If Better Duration Tolerance (seconds)"
            value={form.collision_duration_tolerance_seconds}
            onChange={handleChange('collision_duration_tolerance_seconds')}
            placeholder="10"
            type="number"
            min="0"
          />
          <label className="ui-field">
            <span className="ui-field__label">Extra Video Action</span>
            <select className="ui-select" value={form.extras_video_action} onChange={handleChange('extras_video_action')}>
              {EXTRA_ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="ui-field">
            <span className="ui-field__label">Subtitle Action</span>
            <select className="ui-select" value={form.extras_sub_action} onChange={handleChange('extras_sub_action')}>
              {EXTRA_ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="ui-field">
            <span className="ui-field__label">Audio Track Action</span>
            <select className="ui-select" value={form.extras_audio_action} onChange={handleChange('extras_audio_action')}>
              {EXTRA_ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="ui-field">
            <span className="ui-field__label">Image Action</span>
            <select className="ui-select" value={form.extras_img_action} onChange={handleChange('extras_img_action')}>
              {EXTRA_ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="ui-field">
            <span className="ui-field__label">Metadata Action</span>
            <select className="ui-select" value={form.extras_meta_action} onChange={handleChange('extras_meta_action')}>
              {EXTRA_ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </Stack>
      </Card>
      <Card title="Playback" eyebrow="Media Players">
        <Stack>
          <Input
            label="VLC Path"
            value={form.vlc_path}
            onChange={handleChange('vlc_path')}
            placeholder="Auto-detected if available"
          />
          <Inline>
            <Button variant="secondary" onClick={handlePickFile('vlc_path')} disabled={isSaving}>
              Browse VLC
            </Button>
          </Inline>
          <Input
            label="MPC-HC Path"
            value={form.mpc_path}
            onChange={handleChange('mpc_path')}
            placeholder="Auto-detected if available"
          />
          <Inline>
            <Button variant="secondary" onClick={handlePickFile('mpc_path')} disabled={isSaving}>
              Browse MPC-HC
            </Button>
          </Inline>
        </Stack>
      </Card>
      <Card title="API Keys" eyebrow="Database-backed">
        <Stack>
          <Input
            label="TMDB API Key"
            value={form.tmdb_api_key}
            onChange={handleChange('tmdb_api_key')}
            placeholder="TMDB v3 API key"
          />
          <Input
            label="TMDB Read Access Token"
            value={form.tmdb_bearer_token}
            onChange={handleChange('tmdb_bearer_token')}
            placeholder="TMDB v4 bearer token"
          />
          <Input
            label="OMDb API Key"
            value={form.omdb_api_key}
            onChange={handleChange('omdb_api_key')}
            placeholder="OMDb API key"
          />
          <Inline>
            <Button variant="primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Settings'}
            </Button>
          </Inline>
        </Stack>
      </Card>
      <Card title={t('settingsPage.dangerZone.title')} eyebrow={t('settingsPage.dangerZone.eyebrow')}>
        <Stack>
          <span className="ui-field__hint">
            {t('settingsPage.dangerZone.desc')}
          </span>
          <Inline>
            <Button variant="danger" onClick={handleWipeDatabase} disabled={isWiping || isSaving}>
              {isWiping ? t('settingsPage.dangerZone.buttonWiping') : t('settingsPage.dangerZone.button')}
            </Button>
          </Inline>
        </Stack>
      </Card>
    </Page>
  );
}
