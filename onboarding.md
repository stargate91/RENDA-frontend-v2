# Onboarding (First Launch Wizard) Implementation Plan

Design and implementation structure for the application's first-time startup wizard, prioritizing premium aesthetics, clear step-by-step guidance, and real-time validation.

## Proposed Steps

1. **Step 1: Language Selection & Welcome**
   - Clean layout, locale selectors, immediate language switch.
2. **Step 2: Configuration Choice**
   - Dual cards: "Configure New" vs "Import Settings".
   - Drag-and-drop zone for config JSON import.
3. **Step 3: TMDB API Setup**
   - Split layout: Left panel showing screenshots and instructions, right panel with API input and validation status.
4. **Step 4: OMDB API Setup**
   - Same split layout style tailored for OMDB.
5. **Step 5: Folders Setup**
   - Directory path inputs (Scan & Target) with system/browser picker trigger and validation (existence/write access).
6. **Step 6: Completion**
   - Success state animation, saves configurations, and routes to `/organizer`.

## Proposed Files to Create/Modify

### [NEW] `frontend/src/app/pages/onboarding/OnboardingWizard.jsx`
A new full-screen container with layout switches for each step.

### [NEW] `frontend/src/app/pages/onboarding/OnboardingWizard.css`
Styles for the onboarding wizard (glassmorphism overlays, premium transitions, animated progress bar).
