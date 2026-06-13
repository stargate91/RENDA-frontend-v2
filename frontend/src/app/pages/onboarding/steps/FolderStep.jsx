import { FolderOpen, CheckCircle } from 'lucide-react';
import Button from '@/ui/Button';
import OnboardingInfoCard from '../OnboardingInfoCard';
import OnboardingPanelCard from '../OnboardingPanelCard';
import OnboardingOrbitHero from '../OnboardingOrbitHero';

export default function FolderStep({
  scanDir,
  setScanDir,
  pickScanDir,
  libraryPath,
  setLibraryPath,
  pickLibraryPath,
  validateDirs,
  isValidatingFolders,
  folderValidation,
}) {
  return (
    <div className="onboarding-split-layout">
      <OnboardingInfoCard
        visual={(
          <OnboardingOrbitHero
            icon={FolderOpen}
            chips={[
              { label: 'Scan folder' },
              { label: 'Library' },
              { label: 'Organize' },
            ]}
          />
        )}
        kicker="Library paths"
        title="Choose where RENDA should work."
        description="Set the source folder RENDA watches and, if you want, the clean library destination it should build into."
        items={[
          {
            icon: FolderOpen,
            title: 'Step 5 of 6',
            description: 'This tells RENDA where your unorganized files live and where finished media can go.',
          },
          {
            icon: CheckCircle,
            title: 'Validate before continuing',
            description: 'RENDA checks the folders now so the first scan does not fail later.',
          },
        ]}
      />

      <OnboardingPanelCard
        eyebrow="Step 5"
        title="Set your library folders"
        meta={<div className="welcome-lang-pill">Paths required</div>}
        description="Pick the folders RENDA should read from and organize into."
        footerLabel="Required to continue"
        footerValue="Validate the folder setup first"
      >
        <div className="onboarding-form-group">
          <label>Scan Source Directory (Optional)</label>
          <div className="onboarding-input-wrapper">
            <input 
              type="text" 
              value={scanDir}
              onChange={(e) => setScanDir(e.target.value)}
              placeholder="Select source folder (optional)"
            />
            <Button variant="secondary" onClick={pickScanDir}>Browse</Button>
          </div>
        </div>
        <div className="onboarding-form-group">
          <label>Target Library Directory</label>
          <div className="onboarding-input-wrapper">
            <input 
              type="text" 
              value={libraryPath}
              onChange={(e) => setLibraryPath(e.target.value)}
              placeholder="Select target library folder"
            />
            <Button variant="secondary" onClick={pickLibraryPath}>Browse</Button>
          </div>
        </div>
        <Button 
          variant="secondary" 
          onClick={validateDirs}
          disabled={isValidatingFolders}
        >
          {isValidatingFolders ? 'Validating...' : 'Validate Folders'}
        </Button>
        {folderValidation.valid !== null && (
          <div className={`onboarding-validation-status ${folderValidation.valid ? 'success' : 'error'}`}>
            {folderValidation.message}
          </div>
        )}
      </OnboardingPanelCard>
    </div>
  );
}
