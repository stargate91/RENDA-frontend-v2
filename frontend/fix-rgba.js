import fs from 'fs';
import path from 'path';

const files = [
  'src/app/ui/EmptyState.css',
  'src/app/ui/FloatingActionBar.css',
  'src/app/ui/Modal.css',
  'src/app/ui/NavButton.css',
  'src/app/ui/Pill.css',
  'src/app/ui/PosterCard.css',
  'src/app/ui/ProgressBar.css',
  'src/app/ui/SegmentedControl.css',
  'src/app/ui/SelectableCard.css',
  'src/app/ui/Switch.css',
  'src/app/ui/Table.css',
  'src/app/ui/TagButton.css',
  'src/app/pages/dashboard/DashboardPage.css',
  'src/app/pages/history/HistoryPage.css',
  'src/app/pages/library/LibraryPage.css',
  'src/app/styles/settings/forms.css',
  'src/app/pages/library/components/detail/MediaHeaderInfo.css',
  'src/app/pages/library/components/detail/MediaOverview.css',
  'src/app/pages/library/components/detail/UserRatingSection.css',
  'src/app/pages/library/components/entityDetail/EntityDetailHeroSection.css',
  'src/app/pages/library/components/entityDetail/PeopleTagPopover.css',
  'src/app/pages/library/components/entityDetail/PersonCreditsShared.css',
  'src/app/pages/library/components/detail/panels/BackdropsPanel.css',
  'src/app/pages/library/components/detail/panels/CastPanel.css',
  'src/app/pages/library/components/detail/panels/DetailsPanel.css',
  'src/app/pages/library/components/detail/panels/PanelsCommon.css',
  'src/app/pages/library/components/detail/panels/SeasonsPanel.css',
  'src/app/pages/library/components/detail/panels/TagsPanel.css',
  'src/app/pages/library/components/detail/panels/components/WatchedStats.css'
];

const replacer = (content) => {
  let result = content;

  const mapping = [
    // White glass / borders
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.01\)/g, 'var(--color-surface-glass-strong)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.012\)/g, 'color-mix(in srgb, var(--color-text-primary) 1.2%, transparent)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.015\)/g, 'var(--color-panel-soft)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.018\)/g, 'color-mix(in srgb, var(--color-text-primary) 1.8%, transparent)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.02\)/g, 'var(--color-surface-card)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.025\)/g, 'color-mix(in srgb, var(--color-text-primary) 2.5%, transparent)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.026\)/g, 'color-mix(in srgb, var(--color-text-primary) 2.6%, transparent)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.03\)/g, 'var(--color-surface-glass)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.035\)/g, 'color-mix(in srgb, var(--color-text-primary) 3.5%, transparent)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.04\)/g, 'var(--color-surface-glass)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.045\)/g, 'color-mix(in srgb, var(--color-text-primary) 4.5%, transparent)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.05\)/g, 'var(--color-border-subtle)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.06\)/g, 'var(--color-border-default)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.07\)/g, 'color-mix(in srgb, var(--color-text-primary) 7%, transparent)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.08\)/g, 'var(--color-border-default)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.09\)/g, 'color-mix(in srgb, var(--color-text-primary) 9%, transparent)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.1\)/g, 'color-mix(in srgb, var(--color-text-primary) 10%, transparent)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.12\)/g, 'var(--color-border-heavy)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.14\)/g, 'var(--color-border-heavy)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.16\)/g, 'var(--color-border-heavy)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.18\)/g, 'color-mix(in srgb, var(--color-text-primary) 18%, transparent)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.34\)/g, 'color-mix(in srgb, var(--color-text-primary) 34%, transparent)'],
    
    // Blacks / Shadows
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.1\)/g, 'color-mix(in srgb, black 10%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.12\)/g, 'color-mix(in srgb, black 12%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.15\)/g, 'color-mix(in srgb, black 15%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.18\)/g, 'color-mix(in srgb, black 18%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.2\)/g, 'color-mix(in srgb, black 20%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.22\)/g, 'color-mix(in srgb, black 22%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.24\)/g, 'color-mix(in srgb, black 24%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.25\)/g, 'color-mix(in srgb, black 25%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.28\)/g, 'color-mix(in srgb, black 28%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.3\)/g, 'color-mix(in srgb, black 30%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.35\)/g, 'color-mix(in srgb, black 35%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.38\)/g, 'color-mix(in srgb, black 38%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.4\)/g, 'color-mix(in srgb, black 40%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.5\)/g, 'color-mix(in srgb, black 50%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.66\)/g, 'color-mix(in srgb, black 66%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.75\)/g, 'color-mix(in srgb, black 75%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.76\)/g, 'color-mix(in srgb, black 76%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.8\)/g, 'color-mix(in srgb, black 80%, transparent)'],

    // Spefific layouts / colors
    [/rgba\(\s*7,\s*9,\s*12,\s*0\.96\)/g, 'var(--color-surface-overlay-heavy)'],
    [/rgba\(\s*7,\s*9,\s*12,\s*0\.58\)/g, 'var(--color-surface-overlay-strong)'],
    [/rgba\(\s*12,\s*16,\s*24,\s*0\.92\)/g, 'var(--color-surface-overlay-heavy)'],
    [/rgba\(\s*6,\s*8,\s*12,\s*0\.62\)/g, 'var(--color-surface-overlay-strong)'],
    [/rgba\(\s*16,\s*20,\s*26,\s*0\.96\)/g, 'var(--color-surface-overlay-heavy)'],
    [/rgba\(\s*20,\s*8,\s*11,\s*0\.62\)/g, 'color-mix(in srgb, var(--color-text-inverse) 62%, transparent)'],
    [/rgba\(\s*22,\s*8,\s*12,\s*0\.72\)/g, 'color-mix(in srgb, var(--color-text-inverse) 72%, transparent)'],
    [/rgba\(\s*11,\s*18,\s*28,\s*0\.92\)/g, 'color-mix(in srgb, var(--color-text-inverse) 92%, transparent)'],
    [/rgba\(\s*7,\s*12,\s*20,\s*0\.98\)/g, 'color-mix(in srgb, var(--color-text-inverse) 98%, transparent)'],
    [/rgba\(\s*14,\s*24,\s*37,\s*0\.96\)/g, 'color-mix(in srgb, var(--color-text-inverse) 96%, transparent)'],
    [/rgba\(\s*9,\s*15,\s*24,\s*1\)/g, 'var(--color-text-inverse)'],
    [/rgba\(\s*15,\s*74,\s*122,\s*0\.28\)/g, 'color-mix(in srgb, var(--button-secondary-border) 82%, transparent)'],
    [/rgba\(\s*10,\s*40,\s*69,\s*0\.34\)/g, 'color-mix(in srgb, var(--button-secondary-border) 98%, transparent)'],
    [/rgba\(\s*18,\s*86,\s*143,\s*0\.34\)/g, 'color-mix(in srgb, var(--button-secondary-border) 98%, transparent)'],
    [/rgba\(\s*11,\s*47,\s*80,\s*0\.4\)/g, 'color-mix(in srgb, var(--button-secondary-border) 98%, transparent)'],
    [/rgba\(\s*34,\s*42,\s*54,\s*0\.24\)/g, 'color-mix(in srgb, var(--color-text-secondary) 24%, transparent)'],
    [/rgba\(\s*59,\s*130,\s*246,\s*0\.08\)/g, 'color-mix(in srgb, var(--color-accent-blue) 8%, transparent)'],
    [/rgba\(\s*0,\s*136,\s*255,\s*0\.08\)/g, 'color-mix(in srgb, var(--color-accent-blue) 8%, transparent)'],
    [/rgba\(\s*0,\s*136,\s*255,\s*0\.4\)/g, 'color-mix(in srgb, var(--color-accent-blue) 40%, transparent)'],
    [/rgba\(\s*0,\s*136,\s*255,\s*0\.18\)/g, 'color-mix(in srgb, var(--color-accent-blue) 18%, transparent)'],
    [/rgba\(\s*245,\s*197,\s*24,\s*0\.05\)/g, 'color-mix(in srgb, var(--color-accent-yellow) 5%, transparent)'],
    [/rgba\(\s*1,\s*180,\s*228,\s*0\.05\)/g, 'color-mix(in srgb, var(--color-accent-blue) 5%, transparent)'],
    [/rgba\(\s*22,\s*24,\s*31,\s*0\.92\)/g, 'color-mix(in srgb, var(--color-text-inverse) 92%, transparent)'],
    [/rgba\(\s*10,\s*12,\s*18,\s*0\.9\)/g, 'color-mix(in srgb, var(--color-text-inverse) 90%, transparent)'],
    [/rgba\(\s*0,\s*168,\s*255,\s*0\.32\)/g, 'color-mix(in srgb, var(--color-accent-blue) 32%, transparent)'],
    [/rgba\(\s*20,\s*14,\s*18,\s*0\.88\)/g, 'color-mix(in srgb, var(--color-text-inverse) 88%, transparent)'],
    [/rgba\(\s*12,\s*10,\s*13,\s*0\.82\)/g, 'color-mix(in srgb, var(--color-text-inverse) 82%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.62\)/g, 'color-mix(in srgb, black 62%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.34\)/g, 'color-mix(in srgb, black 34%, transparent)'],
    [/rgba\(\s*0,\s*0,\s*0,\s*0\.6\)/g, 'color-mix(in srgb, black 60%, transparent)'],
    [/rgba\(\s*255,\s*255,\s*255,\s*0\.9\)/g, 'color-mix(in srgb, white 90%, transparent)'],
    
    // Fix custom syntax errors like "0:10px 24px" to "0 10px 24px"
    [/0:10px 24px/g, '0 10px 24px']
  ];

  for (const [regex, replacement] of mapping) {
    result = result.replace(regex, replacement);
  }

  return result;
};

for (const file of files) {
  const absolutePath = path.resolve(file);
  if (fs.existsSync(absolutePath)) {
    const content = fs.readFileSync(absolutePath, 'utf8');
    const updated = replacer(content);
    if (content !== updated) {
      fs.writeFileSync(absolutePath, updated, 'utf8');
      console.log(`Updated: ${file}`);
    }
  }
}
