# Implementation Plan - Bottom Tab Labels & Header-to-Footer Layout Fit

Ensure bottom navigation bar displays clear text labels under every tab icon, and optimize layout containers across all screens to fit seamlessly from header to footer using dynamic viewport height (`100dvh`) and safe area insets.

## User Preferences & Decisions
- **Tab Bar**: Display text labels under every tab icon (Chats, Status, Calls, Discover, Channels).
- **Screen Layout**: Full height layout using dynamic viewport height (`100dvh`) with safe area padding so content fits perfectly between header and footer without clipping.

---

## Proposed Changes

### 1. Bottom Navigation Bar Update (`src/components/ChatListScreen.tsx`)
- Update the bottom navigation bar buttons to render both icon and localized text label (Arabic & English) under every tab item:
  - Chats (`الدردشات` / `Chats`)
  - Status (`الحالات` / `Status`)
  - Calls (`المكالمات` / `Calls`)
  - Discover (`استكشف` / `Discover`)
  - Channels (`القنوات` / `Channels`)
- Adjust tab bar height, icon size (e.g. `w-5 h-5`), font size (`text-[10px]` or `text-xs`), and active/inactive color states (`#087F75` active vs `slate-400` inactive).
- Add `pb-safe` / `pb-2` to handle mobile notch / home indicator safe area.

### 2. Header-to-Footer Full Viewport Layout (`src/App.tsx` & Screen Containers)
- Ensure the main container wrapper in `src/App.tsx` uses `h-[100dvh]` and `flex flex-col justify-between` to lock headers to the top and footers to the bottom.
- Ensure `ConversationScreen.tsx`, `ChatListScreen.tsx`, and modal overlays fit seamlessly without overflow or unwanted vertical gaps.

---

## Verification Plan

### Automated Verification
1. Run `lint_applet` (`tsc --noEmit`) to verify zero TypeScript or syntax errors.
2. Run `compile_applet` (`npm run build`) to ensure Vite build completes successfully.

### Manual Verification
1. Inspect the bottom navigation bar in both Arabic and English modes to verify all 5 tabs display icons and text labels cleanly.
2. Verify full height fit from header to footer across screens.
