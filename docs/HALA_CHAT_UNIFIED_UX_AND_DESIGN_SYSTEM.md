# HALA CHAT — UNIFIED UX AND DESIGN SYSTEM V1.0

**Document Class:** User Experience & Design System Specification  
**Author:** Lead UX Researcher & Design System Architect  
**Scope:** Design Tokens, Layout Patterns, Arabic RTL/English LTR Bidi, Accessibility & Mobile/Desktop Navigation  
**Status:** COMPLETE & ACCESSIBILITY-COMPLIANT  

---

## 1. DESIGN TOKENS & COLOR PALETTE

Hala Chat uses a modern, clean, high-contrast design system optimized for mobile OLED screens and desktop multi-pane displays:

```css
/* Tailwind CSS v4 Global Design Tokens */
@theme {
  --color-brand-primary: #00A884;       /* Emerald Emerald / WhatsApp-familiar green */
  --color-brand-secondary: #008069;     /* Deep Teal Accent */
  --color-brand-dark: #111B21;          /* Dark Mode Background */
  --color-brand-surface-dark: #202C33;  /* Dark Mode Surface Container */
  --color-brand-surface-light: #FFFFFF; /* Light Mode Background */
  
  --font-family-sans: 'Inter', 'Noto Sans Arabic', system-ui, sans-serif;
  --font-family-arabic: 'Cairo', 'Noto Sans Arabic', sans-serif;
}
```

---

## 2. ADAPTIVE LAYOUT ARCHITECTURE

```
+-----------------------------------------------------------------------------------+
|                        ADAPTIVE NAVIGATION BREAKPOINTS                            |
+-----------------------------------------------------------------------------------+
 1. Mobile Viewport (< 768px):
    - Bottom Navigation Bar (4 Primary Tabs: Chats, Communities, Feed, Profile)
    - Full-Screen Slide Viewport for active chat thread.
    - Floating Action Button (FAB) for quick message/recording initiation.

 2. Desktop Viewport (>= 768px):
    - Left Navigation Rail (6 Icon Toggles: Chats, Communities, Reels, Feed, AI, Settings)
    - Conversation List Drawer (320px width) with search filter header
    - Active Main Workspace Viewport (Flexible width)
    - Right Contextual Info Panel (300px collapsible drawer for Profile/Group Info)
+-----------------------------------------------------------------------------------+
```

---

## 3. NATIVE ARABIC (RTL) AND ENGLISH (LTR) BIDI SYSTEM

1. **HTML Root Direction Attribute:** Dynamic HTML attribute `<html dir="rtl" lang="ar">` or `<html dir="ltr" lang="en">` driven by `ThemeContext`.
2. **Tailwind Logical Properties:** Uses CSS logical properties (`ms-auto`, `me-2`, `ps-4`, `start-0`, `end-0`) instead of hardcoded `left`/`right` rules, ensuring layouts flip symmetrically in RTL mode.
3. **Typography Scaling:** Arabic text sizes are scaled +10% relative to English font sizes (`text-base` for English maps to `text-[17px]` for Arabic) to account for Arabic script height metrics.

---

## 4. ACCESSIBILITY & WCAG 2.1 AA COMPLIANCE

- **Contrast Ratios:** Text and icon elements maintain a minimum 4.5:1 contrast ratio against surface backgrounds.
- **Screen Reader Support:** Interactive buttons and media elements include explicit `aria-label` tags (e.g. `aria-label="Send voice note"`, `aria-label="تسجيل رسالة صوتية"`).
- **Keyboard Navigation:** Full keyboard navigation support (Tab focus outlines, Esc closes modals, Enter sends message).
