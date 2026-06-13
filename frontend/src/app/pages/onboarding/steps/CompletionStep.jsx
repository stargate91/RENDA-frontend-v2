import { CheckCircle } from 'lucide-react';

export default function CompletionStep() {
  return (
    <div className="onboarding-completion-step">
      <div className="success-icon-animation">
        <CheckCircle size={40} />
      </div>
      <h2>Setup Complete!</h2>
      <p>RENDA is now configured and ready to organize your media files. Click Finish to save and open your dashboard.</p>
    </div>
  );
}
