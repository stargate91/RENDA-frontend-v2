import { CheckCircle } from 'lucide-react';
import { useTranslation } from '@/providers/LanguageContext';

export default function CompletionStep() {
  const { t } = useTranslation();

  return (
    <div className="onboarding-completion-step">
      <div className="success-icon-animation">
        <CheckCircle size={40} />
      </div>
      <h2>{t('onboarding.completion.title')}</h2>
      <p>{t('onboarding.completion.description')}</p>
    </div>
  );
}
