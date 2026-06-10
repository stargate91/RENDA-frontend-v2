import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Button from '@/ui/Button';
import Card from '@/ui/Card';
import Inline from '@/ui/Inline';
import Input from '@/ui/Input';
import Page from '@/ui/Page';
import Stack from '@/ui/Stack';
import { useSettingsQuery, useUpdateSettingsMutation } from '@/queries/appQueries';
import { useUi } from '@/providers/UiProvider';
import { selectFile, selectFolder } from '@/lib/ipc';

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

export default function SettingsPage() {
  const settingsQuery = useSettingsQuery();
  const settings = settingsQuery.data || {};
  const queryClient = useQueryClient();
  const { toast } = useUi();
  const [isSaving, setIsSaving] = useState(false);
  const updateSettingsMutation = useUpdateSettingsMutation();
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
  });

  const [prevSettings, setPrevSettings] = useState(settings);

  if (
    settings.collision_strategy !== prevSettings.collision_strategy ||
    settings.collision_duration_tolerance_seconds !== prevSettings.collision_duration_tolerance_seconds ||
    settings.default_scan_dir !== prevSettings.default_scan_dir ||
    settings.extras_audio_action !== prevSettings.extras_audio_action ||
    settings.extras_img_action !== prevSettings.extras_img_action ||
    settings.extras_meta_action !== prevSettings.extras_meta_action ||
    settings.extras_sub_action !== prevSettings.extras_sub_action ||
    settings.extras_video_action !== prevSettings.extras_video_action ||
    settings.folder_library_path !== prevSettings.folder_library_path ||
    settings.mpc_path !== prevSettings.mpc_path ||
    settings.omdb_api_key !== prevSettings.omdb_api_key ||
    settings.tmdb_api_key !== prevSettings.tmdb_api_key ||
    settings.tmdb_bearer_token !== prevSettings.tmdb_bearer_token ||
    settings.vlc_path !== prevSettings.vlc_path
  ) {
    setPrevSettings(settings);
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
    });
  }

  const handleChange = (key) => (event) => {
    setForm((current) => ({
      ...current,
      [key]: event.target.value,
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
      await updateSettingsMutation.mutateAsync({
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
      });

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

  return (
    <Page title="Settings" description="Quick API key entry for scan prerequisites.">
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
    </Page>
  );
}
