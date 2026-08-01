# Phase 1 UI/UX Redesign Specification

**Status**: Design Phase  
**Target**: Sci-fi, futuristic, engaging, research-backed  
**Variants**: Desktop (spacious, analyst-focused) + Mobile (thumb-friendly, simplified)  

---

## Design Research

### Sci-Fi UI Principles (from contemporary research)
1. **Glassmorphism** - frosted glass effect with blur/transparency
2. **Neon Accents** - glowing borders, text, highlights (purples, cyans, magentas)
3. **Grid Systems** - visible grid overlay, clean geometric hierarchy
4. **Motion Design** - subtle animations (loading pulse, transition fade, micro-interactions)
5. **Data Visualization** - pseudo-holographic charts, linear progress indicators
6. **Typography** - monospace accents for data, sans-serif for body
7. **Dark Mode First** - OLED-friendly, reduces eye strain for research work

### Target Aesthetic
- **Interface**: Dark navy/charcoal base (#0a0e27) with cyan/purple accents (#00d4ff, #a855f7)
- **Elevation**: Depth via blur layers, not traditional shadows
- **Feedback**: Loading spinners with gradient animation, glowing status indicators
- **Microinteractions**: Pulse on hover, subtle scale, smooth easing

### User Research Context
- Users: PhD scholars, academic researchers — long research sessions
- Pain points: 
  - Current UI doesn't signal processing (feels stuck)
  - Desktop workspace cramped for large documents
  - Mobile version doesn't exist (responsive broken)
  - Phase navigation unclear (A-I system not visually distinct)

---

## Desktop Redesign (Primary)

### Layout System
```
┌─────────────────────────────────────────────────────┐
│ Phase Indicator (A-I) │ App Logo │ User + Menu      │  Header
├─────────────────────────────────────────────────────┤
│  Dashboard    │  Phase Workspace                      │
│  (projects)   │  ┌──────────────────────────────────┤
│               │  │ Workspace Area (Glassmorphism)    │
│               │  │ • Sections (left sidebar) ╱╱     │
│               │  │ • Main Editor (center)   ╱╱      │
│               │  │ • AI Tools (right panel) ╱╱      │
│               │  └──────────────────────────────────┤
└─────────────────────────────────────────────────────┘
```

### Color Palette
- **Base**: `#0a0e27` (dark navy)
- **Surface**: `#1a1f3a` (elevated cards)
- **Accent Primary**: `#00d4ff` (cyan) - active, progress
- **Accent Secondary**: `#a855f7` (purple) - highlights, links
- **Text Primary**: `#e5e7eb` (light gray)
- **Text Secondary**: `#9ca3af` (muted)
- **Success**: `#10b981` (green)
- **Warning**: `#f59e0b` (amber)
- **Error**: `#ef4444` (red)

### Component Changes

#### Phase Indicator
- Currently: text badge "Phase A"
- New: **Animated progress ring** with glow
  - Ring color matches phase (cyan for intake, purple for grounding, etc.)
  - Pulsing animation on phase entry
  - Click to show phase details (transitions, requirements)
  - Visual distinction between completed vs current vs future phases

#### Workspace Container
- Currently: plain div with standard shadows
- New: **Glassmorphic card** with:
  - `backdrop-filter: blur(10px)`
  - `border: 1px solid rgba(0, 212, 255, 0.2)`
  - Subtle glow on hover: `box-shadow: 0 0 20px rgba(0, 212, 255, 0.15)`
  - Smoother corners (border-radius 12px)

#### Editor Panels
- Left (sections): collapsible, sticky top
  - Neon accent on active section
  - Icons before labels (visual chunking)
- Center (content): spacious, monospace for code blocks
  - Line-height increased (1.8 vs 1.5) for readability
  - Contrast boosted for accessibility
- Right (AI tools): floating on desktop, dockable
  - Toggle visibility (save space)
  - Glowing indicator when ready

#### Loading States
- **Spinner**: 3-circle gradient pulse (cyan→purple→cyan)
  - Size: 32px, subtle
  - Message: "Grounding research..." / "Analyzing compliance..." (task-specific)
- **Progress Bar**: Linear gradient, neon glow
  - Bottom of active panel
  - Color changes per phase (visual continuity)
- **Pulsing Dot**: Status indicator
  - Green (ready) → Yellow (processing) → Green (done)
  - Subtle scale pulse 1.0 → 1.2 → 1.0 (200ms ease-in-out)

---

## Mobile Redesign (Secondary)

### Constraints
- Single-column layout only
- Thumb-friendly touch targets (44px minimum)
- Simplified toolbar (hide non-essential)
- Phase selector as bottom sheet or modal

### Layout System
```
┌──────────────────────┐
│ Phase A  │  Menu [≡]  │  Header (compact)
├──────────────────────┤
│ Section Tabs (horiz) │
├──────────────────────┤
│ Main Content Area    │
│ (full width)         │
├──────────────────────┤
│ [AI Tools] [Save] .. │  Floating action buttons
└──────────────────────┘
```

### Changes
- **Header**: Remove avatar, condense breadcrumb
- **Sections**: Horizontal scrollable tabs instead of sidebar
- **Content**: Full width, larger touch targets for buttons
- **Modals**: Bottom sheets for dialogs (more mobile-natural)
- **Gesture**: Swipe to navigate phases (left/right)
- **Loading**: Same spinner, but centered + message below

### Touch Optimizations
- Button padding: `14px 16px` (44px tall)
- Input height: `48px`
- Slider height: `48px`
- Icon size: `24px` (centered in 44px touch area)

---

## Animation Library (Tailwind + Custom CSS)

### Keyframes

#### Pulse Spinner
```css
@keyframes spinnerPulse {
  0% { transform: scale(1) rotate(0deg); opacity: 0.8; }
  50% { transform: scale(1.1) rotate(180deg); opacity: 1; }
  100% { transform: scale(1) rotate(360deg); opacity: 0.8; }
}
```

#### Glow Pulse
```css
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 10px rgba(0, 212, 255, 0.3); }
  50% { box-shadow: 0 0 20px rgba(0, 212, 255, 0.6); }
}
```

#### Shimmer Loading
```css
@keyframes shimmer {
  0% { background-position: -1000px 0; }
  100% { background-position: 1000px 0; }
}
```

---

## Implementation Roadmap

### Week 1 (Desktop Base)
1. Color palette integration (Tailwind config override)
2. Glassmorphic card components
3. Phase indicator redesign
4. Workspace container refactor
5. Editor panel styling

### Week 1.5 (Loading States)
6. Spinner component with animations
7. Progress bar for long operations
8. Status pulse indicators
9. Toast notifications (contextual feedback)

### Week 2 (Mobile)
10. Mobile-first layout (rebuild layout)
11. Touch optimizations
12. Bottom sheet modals
13. Gesture navigation (phase swipe)

### Week 2.5 (Polish)
14. Micro-interactions (hover, focus states)
15. Dark mode verification
16. Accessibility audit (contrast, focus order)
17. Testing across browsers/devices

---

## Success Metrics

- [ ] Users perceive "something is happening" during 2+ second operations (loading animation)
- [ ] Mobile users can complete phase flow without horizontal scrolling
- [ ] Contrast ratio ≥ 4.5:1 for all text (WCAG AA)
- [ ] No layout shift during phase transitions
- [ ] Touch targets ≥ 44x44px on mobile
- [ ] 60 FPS on typical hardware during animations

---

## Accessibility Checklist

- [ ] Color not sole indicator (use icons + text)
- [ ] Animations respect `prefers-reduced-motion`
- [ ] Focus outline visible (cyan, 2px)
- [ ] Keyboard navigation works (Tab order logical)
- [ ] ARIA labels for spinners/progress
- [ ] High contrast mode compatible

