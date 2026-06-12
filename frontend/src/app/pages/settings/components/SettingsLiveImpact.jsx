import Card from '@/ui/Card';
import StructurePreviewPanel from './StructurePreviewPanel.jsx';

export default function SettingsLiveImpact({
  form,
  t,
  title,
  eyebrow,
  hint,
}) {
  return (
    <Card title={title} eyebrow={eyebrow}>
      <div className="settings-preview-stack">
        <span className="ui-field__hint">
          {hint}
        </span>
        <StructurePreviewPanel form={form} t={t} />
      </div>
    </Card>
  );
}
