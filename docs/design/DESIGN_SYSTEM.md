# CareOS — Design System

**Version:** 1.0.0-draft  
**Status:** Approved for Implementation  
**Last Updated:** 2026-11-14

---

## 1. Design Direction

CareOS adopts a **clean operational SaaS** aesthetic: confident, structured, and information-dense without being cluttered. The visual language is built for **daily professional use** — it must reduce cognitive load during high-volume dispatching and customer interaction, while remaining approachable on mobile for field technicians and customers.

**Design keywords:** Trustworthy · Efficient · Clear · Responsive · RTL-ready

---

## 2. Colour Palette

### 2.1 Brand Colours

| Token | Hex | Usage |
|---|---|---|
| `color-primary-500` | `#2563EB` | Primary actions, links, active nav items |
| `color-primary-600` | `#1D4ED8` | Primary button hover |
| `color-primary-700` | `#1E40AF` | Primary button active/pressed |
| `color-primary-100` | `#DBEAFE` | Light primary backgrounds, chips |
| `color-accent-500` | `#0EA5E9` | Accents, icons, secondary highlights |
| `color-accent-100` | `#E0F2FE` | Accent chip backgrounds |

### 2.2 Neutral Palette

| Token | Hex | Usage |
|---|---|---|
| `color-neutral-900` | `#111827` | Primary text, headings |
| `color-neutral-700` | `#374151` | Secondary text, labels |
| `color-neutral-500` | `#6B7280` | Placeholder, hint text |
| `color-neutral-300` | `#D1D5DB` | Borders, dividers |
| `color-neutral-100` | `#F3F4F6` | Subtle backgrounds, alternate rows |
| `color-neutral-50` | `#F9FAFB` | Page background |
| `color-white` | `#FFFFFF` | Card backgrounds, input fills |

### 2.3 Semantic / Status Colours

These are used for status badges, alert banners, and form validation states.

| State | Background | Border | Text | Token Prefix |
|---|---|---|---|---|
| Success | `#D1FAE5` | `#34D399` | `#065F46` | `color-success-*` |
| Warning | `#FEF3C7` | `#FBBF24` | `#92400E` | `color-warning-*` |
| Error / Danger | `#FEE2E2` | `#F87171` | `#991B1B` | `color-error-*` |
| Info | `#DBEAFE` | `#60A5FA` | `#1E3A8A` | `color-info-*` |
| Neutral / Muted | `#F3F4F6` | `#D1D5DB` | `#374151` | (neutral palette) |

### 2.4 Ticket Status Colours

| Status | Badge Colour |
|---|---|
| `draft` | Neutral grey |
| `open` | Blue (`color-info-*`) |
| `triaged` | Blue-purple |
| `scheduled` | Indigo |
| `in_progress` | Amber (`color-warning-*`) |
| `awaiting_customer` | Orange |
| `awaiting_parts` | Orange |
| `awaiting_payment` | Yellow |
| `resolved` | Green (`color-success-*`) |
| `closed` | Neutral grey |
| `reopened` | Red (`color-error-*`) |

Work order status colours follow the same logic (pending=grey, completed=green, etc.).

---

## 3. Typography

### 3.1 Font Family

| Use | Font | Fallback Stack |
|---|---|---|
| Latin (LTR) | **Inter** | system-ui, sans-serif |
| Arabic (RTL) | **IBM Plex Sans Arabic** | Noto Sans Arabic, sans-serif |

Both fonts loaded via `@fontsource` packages (self-hosted, no Google Fonts CDN dependency).

### 3.2 Type Scale

| Token | Size | Line Height | Weight | Usage |
|---|---|---|---|---|
| `text-xs` | 11px | 1.5 | 400 | Timestamps, metadata labels |
| `text-sm` | 13px | 1.5 | 400 | Table cell content, form hints |
| `text-base` | 15px | 1.6 | 400 | Body text, descriptions |
| `text-md` | 16px | 1.5 | 500 | Input values, card body |
| `text-lg` | 18px | 1.4 | 600 | Card titles, section heads |
| `text-xl` | 20px | 1.3 | 600 | Page sub-headings |
| `text-2xl` | 24px | 1.2 | 700 | Page titles |
| `text-3xl` | 30px | 1.2 | 700 | Dashboard KPI numbers |

### 3.3 RTL Typography Rules

- Use `dir="rtl"` on the `<html>` element when language is Arabic
- CSS `logical` properties (`margin-inline-start`, `padding-inline-end`) everywhere — no hardcoded `left`/`right` in component styles
- Mirrored icons: use CSS `transform: scaleX(-1)` on directional icons (back arrows, chevrons)
- Number sequences, ticket IDs, and phone numbers remain LTR even in RTL mode (`dir="ltr"` on those spans)
- Font sizes slightly larger (+1px) for Arabic for legibility parity

---

## 4. Spacing System

Based on a **4px base unit** with Tailwind-compatible naming:

| Token | Value | Usage |
|---|---|---|
| `space-1` | 4px | Micro padding, icon gaps |
| `space-2` | 8px | Inner component padding |
| `space-3` | 12px | Standard form element padding |
| `space-4` | 16px | Card internal padding, section gaps |
| `space-6` | 24px | Between form groups, card-to-card |
| `space-8` | 32px | Section spacing in layouts |
| `space-12` | 48px | Major section breaks |
| `space-16` | 64px | Page-level vertical rhythm |

---

## 5. Layout and Grid

### 5.1 Responsive Breakpoints

| Breakpoint | Min Width | Target Device |
|---|---|---|
| `sm` | 640px | Landscape phone |
| `md` | 768px | Tablet |
| `lg` | 1024px | Small laptop |
| `xl` | 1280px | Desktop |
| `2xl` | 1536px | Wide desktop |

### 5.2 Portal Layouts

**Operations Portal:**
- Persistent sidebar (collapsed on `< lg`)
- Top header bar with tenant logo, search, notifications, user menu
- Main content area: max-width `1440px`, centered
- Three-column dashboard on `xl`; two on `lg`; single on `< md`

**Customer Portal:**
- Top navigation (no sidebar)
- Full-width on mobile, centered container on `> md`
- Max content width: `860px`

**Technician Portal:**
- Mobile-first, single-column
- Bottom navigation bar on mobile
- Side navigation on `> md`
- Optimised for one-handed use (critical actions in bottom thumb zone)

### 5.3 Content Width

| Context | Max Width |
|---|---|
| Data tables | Full container width |
| Forms | `640px` |
| Modal dialogs | `480px` (small), `640px` (medium), `800px` (large) |
| Drawer panels | `400px` (side drawer) |
| Dashboard cards | Auto-fit grid |

---

## 6. Component Principles

### 6.1 Core Principles

1. **Composability over configuration:** Small, single-purpose components combined into patterns, not mega-components with 40 props
2. **Accessible by default:** Every interactive component has proper ARIA labels, keyboard focus, and colour contrast (WCAG 2.1 AA)
3. **State-visible:** Loading, empty, error, and success states are always defined for every list/form/action
4. **Data density without clutter:** Tables show the right density for the portal (ops = dense; customer = comfortable)

### 6.2 Key Component Catalogue

| Component | Notes |
|---|---|
| `Button` | Variants: `primary`, `secondary`, `ghost`, `danger`; sizes: `sm`, `md`, `lg` |
| `Input` | Text, number, date, phone; always has label; never placeholder-only |
| `Select` | Native select on mobile; custom dropdown on desktop |
| `Textarea` | Auto-growing; character count on limit fields |
| `Checkbox` / `Toggle` | Accessible; label always visible |
| `Badge` | Status indicator; colour from semantic palette |
| `Card` | Base container; `elevated`, `bordered`, `flat` variants |
| `DataTable` | Sortable columns, pagination, row actions; keyboard navigable |
| `Modal` | Focus-trapped; `Escape` to close; accessible heading |
| `Drawer` | Slide-in panel (right for LTR, left for RTL); overlays main content |
| `Toast` | Auto-dismiss notifications; persistent for errors |
| `EmptyState` | Icon + heading + optional CTA; shown when list has 0 items |
| `LoadingSpinner` | Full-page and inline variants |
| `PageHeader` | Title + breadcrumb + actions slot |
| `StatCard` | KPI display: number, label, trend indicator |
| `Timeline` | Ticket/WO history display; vertical list |
| `FileUpload` | Drag-and-drop + tap-to-pick; shows preview and progress |

---

## 7. Table Patterns

### 7.1 Standard Table Structure

```
┌─ [Search input] ─────────── [Filter chips] ─── [Column picker] ─── [Export] ┐
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ ☐ │ Col 1 ↑  │ Col 2    │ Col 3     │ Status Badge │ Actions  │       │  │
│  ├───┼──────────┼──────────┼───────────┼──────────────┼──────────┤       │  │
│  │ ☐ │ ...      │ ...      │ ...       │ ●  Open      │ ⋮        │       │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  Showing 1–25 of 142          [← Prev]  1  2  3  …  6  [Next →]            │
└───────────────────────────────────────────────────────────────────────────────┘
```

- Sticky header when table scrolls vertically
- Horizontal scroll on `< md` with frozen first column
- Row hover: `color-neutral-50` background
- Selected rows: `color-primary-100` background
- Empty state: shown inline in table area
- Loading state: skeleton rows (not spinner)

### 7.2 Inline Row Actions

Row actions appear on hover (desktop) or always visible (mobile). Max 3 inline icon buttons; overflow into `⋮` menu.

---

## 8. Form Patterns

### 8.1 Standard Form Layout

```
Label *
[Input field                              ]
Helper text or error message

Label
[Input field                              ]

[Cancel]                        [Save]
```

- Labels always above inputs (never inline floating)
- Required fields marked with `*` and explained in form legend
- Error messages below the field, in `color-error-text`
- Form-level error shown in a dismissible alert at the top
- Submit button: right-aligned (LTR), left-aligned (RTL)
- Destructive actions: `danger` button variant; always require confirmation

### 8.2 Multi-Step Forms

Used for ticket creation and quotation building. Progress indicator at top (numbered steps). Each step validates independently before proceeding.

---

## 9. Status Display

### 9.1 Status Badge

```tsx
<Badge status="in_progress">In Progress</Badge>
// Renders: amber pill with dot indicator
```

Badges are **never** colour-only — always include text label (accessibility).

### 9.2 Priority Indicators

| Priority | Icon | Colour |
|---|---|---|
| `low` | ↓ | Neutral grey |
| `normal` | → | Blue |
| `high` | ↑ | Orange |
| `critical` | ⚠ | Red |

---

## 10. Responsive Rules

| Rule | Detail |
|---|---|
| **Touch targets** | Minimum 44×44px on mobile (WCAG 2.5.5) |
| **Font scaling** | No font below 13px on any screen size |
| **Table on mobile** | Horizontal scroll OR card-stack view for key tables |
| **Modals on mobile** | Full-screen sheet instead of centred dialog |
| **Forms on mobile** | Single-column; numeric keyboard for number inputs |
| **Navigation** | Bottom tab bar on mobile; sidebar collapsed to icons on tablet |
| **Print** | Quotations and invoices have `@media print` styles for clean printing |

---

## 11. Accessibility Requirements

| Requirement | Standard |
|---|---|
| Colour contrast (text on background) | WCAG 2.1 AA: ≥ 4.5:1 for normal text, ≥ 3:1 for large text |
| Keyboard navigation | All interactive elements reachable and operable via keyboard |
| Focus indicators | Visible `focus-visible` ring on all interactive elements (`2px solid color-primary-500`) |
| Screen reader support | Semantic HTML; ARIA labels on icon-only buttons; `role` and `aria-*` attributes on custom widgets |
| Form labels | Every input has an associated visible `<label>` or `aria-label` |
| Error identification | Errors identified in text, not colour alone |
| Animation | Respect `prefers-reduced-motion`; no essential information conveyed via animation only |
| Language | `lang` attribute set correctly; switches on RTL toggle |

---

## 12. Icon System

**Icon library:** [Lucide Icons](https://lucide.dev/) — consistent stroke weight, `currentColor` fills, tree-shakeable.

- Icon size: `16px` (small), `20px` (standard), `24px` (large)
- Icons never stand alone without accessible text (`aria-label` or visible label)
- Mirrored directional icons in RTL mode
- Spinner/loading: custom CSS animation (not SVG-animated)

---

## 13. Dark Mode

Dark mode is **not in scope for v1**. The codebase should use CSS custom properties for all colour tokens (not hardcoded hex values in component CSS) to enable straightforward dark mode implementation in v2.

---

## 14. Implementation Notes

- Design system implemented as a shared component library inside `apps/web/src/components/`
- Components use **Tailwind CSS** utility classes with a custom theme extending the design tokens above
- **Tailwind config** (`tailwind.config.ts`) defines all colour tokens, type scale, and spacing as the single source of truth
- **Storybook** (v7) documents all components (added in Step 2 of the roadmap)
- Component API typed with TypeScript; prop validation via TypeScript interface (not PropTypes)
