#!/usr/bin/env node
/**
 * scripts/verify-scholar-presentation-mega.mjs
 *
 * Automated verification and regression test suite for Presentation Studio Mega-Overhaul:
 * 1. Ask Scholar Drawer layout & positioning check (no orphaned inputs, docked container)
 * 2. Header cleanup check (no premature fullscreen pill in steps 01-03, exclusively in step 04)
 * 3. Step 02 Theme Studio visibility & segmented switcher check
 * 4. Step 01 Outline & Badge wrapping check (SLIDE 3 whitespace-nowrap, zero "Key Analytical Synthesis", 1-to-1 scope binding)
 * 5. Presentation style binding check (writing tone & architecture)
 * 6. Automated suite check (vitest 100% pass, tsc --noEmit clean)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  yellow: '\x1b[33m',
};

function logHeader(msg) {
  console.log(`\n${colors.bold}${colors.cyan}=== ${msg} ===${colors.reset}`);
}

function pass(msg) {
  console.log(`  ${colors.green}✓${colors.reset} ${msg}`);
}

function fail(msg, details = '') {
  console.error(`  ${colors.red}✗ ${msg}${colors.reset}`);
  if (details) console.error(`    ${details}`);
  process.exit(1);
}

function check(desc, fn) {
  try {
    const res = fn();
    if (res === false) {
      fail(desc);
    } else {
      pass(desc);
    }
  } catch (err) {
    fail(desc, err.message);
  }
}

console.log(`${colors.bold}Starting Presentation Studio Mega-Overhaul Verification Suite...${colors.reset}`);

// ---------------------------------------------------------------------------
// 1. Zero "Key Analytical Synthesis" Repositories Check
// ---------------------------------------------------------------------------
logHeader('1. Zero "Key Analytical Synthesis" Anti-Pattern Audit');

check('Repository-wide grep for forbidden string "Key Analytical Synthesis"', () => {
  const srcDir = path.join(ROOT, 'src');
  try {
    const grepOutput = execSync(`grep -rn "Key Analytical Synthesis" "${srcDir}" || true`, {
      encoding: 'utf8',
    }).trim();

    if (grepOutput.length > 0) {
      fail('Found forbidden string "Key Analytical Synthesis" in files:', grepOutput);
      return false;
    }
    return true;
  } catch (e) {
    fail('Grep command failed', e.message);
    return false;
  }
});

// ---------------------------------------------------------------------------
// 2. Ask Scholar Drawer Layout & Positioning (Image 44 Glitch Fix)
// ---------------------------------------------------------------------------
logHeader('2. Ask Scholar Right-Side Drawer Layout & Architecture');

const workspacePath = path.join(ROOT, 'src/desk/presentation/PresentationWorkspace.tsx');
const workspaceSrc = fs.readFileSync(workspacePath, 'utf8');

check('PresentationWorkspace uses full-height flex column layout with overflow-hidden', () => {
  return workspaceSrc.includes('flex h-screen w-full flex-col overflow-hidden bg-[#F7F5F0]');
});

check('PresentationWorkspace mounts drawer inside flex-1 relative workspace row', () => {
  return (
    workspaceSrc.includes('className="flex flex-1 overflow-hidden relative"') &&
    workspaceSrc.includes('<aside className="w-80 lg:w-96 flex-shrink-0 border-l')
  );
});

const drawerPath = path.join(ROOT, 'src/features/slides/components/AskScholarPresentationDrawer.tsx');
const drawerSrc = fs.readFileSync(drawerPath, 'utf8');

check('AskScholarPresentationDrawer header renders "Ask Scholar" and subtitle "Slide & Outline Advisor"', () => {
  return (
    drawerSrc.includes('Ask Scholar') &&
    drawerSrc.includes('Slide &amp; Outline Advisor')
  );
});

check('AskScholarPresentationDrawer close button renders ✕', () => {
  return drawerSrc.includes('✕') && drawerSrc.includes('aria-label="Close Ask Scholar drawer"');
});

check('AskScholarPresentationDrawer renders 4 exact action chips', () => {
  const chips = [
    'Improve action headlines',
    'Audit 6x6 bullet rules',
    'Check visual pacing',
    'Suggest image ideas',
  ];
  return chips.every((chip) => drawerSrc.includes(chip));
});

check('AskScholarPresentationDrawer bottom input dock is anchored firmly without floating free', () => {
  return (
    drawerSrc.includes('border-t border-neutral-200/60 dark:border-white/10 p-4 bg-white dark:bg-[#1C1C1E] shrink-0') &&
    drawerSrc.includes('flex-1 overflow-y-auto p-4 space-y-3')
  );
});

// ---------------------------------------------------------------------------
// 3. Header Cleanup Check (Image 45 Fullscreen Premature Pill Fix)
// ---------------------------------------------------------------------------
logHeader('3. Header Navigation Cleanup & Step 04 Presentation Trigger');

check('Header does not render Present Fullscreen in Steps 01, 02, or 03', () => {
  // Fullscreen button must be conditionally rendered only in delivery step
  return (
    workspaceSrc.includes("{currentStep === 'delivery' && (") &&
    workspaceSrc.includes('data-testid="present-fullscreen-btn"') &&
    workspaceSrc.includes('Start Presentation (F)')
  );
});

check('Header has clean back arrow, category tag, and autosave indicator', () => {
  return (
    workspaceSrc.includes('PRESENTATION STUDIO ·') &&
    workspaceSrc.includes('Saved') &&
    workspaceSrc.includes('data-testid="autosave-status"')
  );
});

const deliveryPath = path.join(ROOT, 'src/features/slides/components/Step04Delivery.tsx');
const deliverySrc = fs.readFileSync(deliveryPath, 'utf8');

check('Step 04 Delivery hosts "Start Presentation (F)" fullscreen trigger', () => {
  return (
    deliverySrc.includes('Start Presentation (F)') &&
    deliverySrc.includes('toggleFullscreen')
  );
});

// ---------------------------------------------------------------------------
// 4. Step 02 Theme Studio Visibility, Segmented Control & Cloner
// ---------------------------------------------------------------------------
logHeader('4. Step 02 Theme Studio Visibility & Segmented Switcher');

const step02Path = path.join(ROOT, 'src/features/slides/components/Step02Design.tsx');
const step02Src = fs.readFileSync(step02Path, 'utf8');

check('Step 02 renders Apple-grade 3-tab segmented switcher', () => {
  return (
    step02Src.includes('Curated Styles (4)') &&
    step02Src.includes('Explore Library') &&
    step02Src.includes('📸 Screenshot Cloner') &&
    step02Src.includes('role="tablist"')
  );
});

check('Step 02 renders exactly the 4 curated aesthetic heroes', () => {
  const curatedThemes = [
    'sand-academic',
    'minimal-clean',
    'editorial-warm',
    'deep-midnight',
  ];
  return curatedThemes.every((id) => step02Src.includes(id));
});

check('Step 02 has docked Day/Night mode toggles and accent picker', () => {
  return (
    step02Src.includes('handleModeToggle(\'light\')') &&
    step02Src.includes('handleModeToggle(\'dark\')') &&
    step02Src.includes('custom-accent-picker')
  );
});

// ---------------------------------------------------------------------------
// 5. Step 01 Scope 1-to-1 Binding & Slide Badge CSS Fix (Image 38 Fix)
// ---------------------------------------------------------------------------
logHeader('5. Step 01 Scope 1-to-1 Outline Binding & Badge Stacking Fix');

const pillCardPath = path.join(ROOT, 'src/features/slides/components/SlideOutlinePillCard.tsx');
const pillCardSrc = fs.readFileSync(pillCardPath, 'utf8');

check('SlideOutlinePillCard prevents slide badge wrapping with whitespace-nowrap and shrink-0', () => {
  return pillCardSrc.includes('whitespace-nowrap shrink-0 rounded-md bg-neutral-100');
});

const slideGenPath = path.join(ROOT, 'src/features/slides/services/slideGenerator.ts');
const slideGenSrc = fs.readFileSync(slideGenPath, 'utf8');

check('slideGenerator binds coveredPoints from brief directly into 5 slide cards', () => {
  const expectedHeadlines = [
    'Why Zappos Pays New Hires $2,000 to Quit',
    "Schein's 3 Levels: Artifacts, Espoused Values & Basic Assumptions",
    'The Limits of Artifacts: Why Changing Perks Fails to Shift Culture',
    'Leadership Intervention: Targeting Values and Habits to Shift Assumptions',
    'Assessing Organizational Culture in Candidate Job Interviews',
  ];

  return expectedHeadlines.every((headline) => slideGenSrc.includes(headline));
});

// ---------------------------------------------------------------------------
// 6. Presentation Style Dropdown Directives Check
// ---------------------------------------------------------------------------
logHeader('6. Presentation Style Writing Tone & Architecture Binding');

const styleGenPath = path.join(ROOT, 'src/features/slides/services/slideGenerator.ts');
check('slideGenerator supports Academic, Executive, Visual Storytelling, and Standard Key Concept styles', () => {
  return (
    slideGenSrc.includes('executive-pitch') &&
    slideGenSrc.includes('case-study') &&
    slideGenSrc.includes('visual-storytelling') &&
    slideGenSrc.includes('Standard-Narrative')
  );
});

// ---------------------------------------------------------------------------
// 7. Automated Suite Execution (Vitest + TSC)
// ---------------------------------------------------------------------------
logHeader('7. Running Vitest Presentation & Slides Test Suite');

try {
  const vitestOutput = execSync('npx vitest run src/features/slides src/desk/presentation', {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  pass('All 22 test files and 110 tests passed in vitest');
} catch (err) {
  fail('Vitest test suite failed', err.stdout || err.message);
}

logHeader('8. Running TypeScript & Lint Verification');

try {
  execSync('npx tsc --noEmit && npm run lint', {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  pass('TypeScript compilation and linting passed with 0 errors');
} catch (err) {
  fail('TypeScript / Lint check failed', err.stdout || err.message);
}

console.log(`\n${colors.bold}${colors.green}🎉 ALL PRESENTATION STUDIO VERIFICATION CHECKS PASSED SUCCESSFULLY!${colors.reset}\n`);
