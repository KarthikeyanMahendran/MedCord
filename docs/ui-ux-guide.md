# MedCord UI/UX guide

MedCord has its own standalone design system: TypeScript components with the `mc-` prefix and MedCord branding. It does not depend on or import from any other project.

## Visual language (v3, "Clinical Graphite")
- **Typeface:** Lexend (shared with the ZenoHosp product family), weights 400/500/600 only; tabular numerals for times and counts.
- **Colour:** neutral graphite elevation ladder (`rail < side < bg < surface < surface-2 < surface-3`) and **one** accent (cobalt `--mc-brand`). Semantic colours (success/warning/danger/info, online) are used only to carry meaning — never decoration. No gradients, glows or emoji in product chrome.
- **Shape and motion:** 6–10px radii; 120ms fades/scale-ins only; `prefers-reduced-motion` respected.
- **Identity:** muted avatar tones with even luminance (white initials stay AA); a small `VerifiedMark` check replaces repeated "verified" pills.
- **Shell:** `ServerRail` (40px square tiles, accent ring + indicator bar for the active item, tooltips) | `SideColumn` (contextual: channels, DMs or navigation; user panel) | content. One destination per rail item.
- **Pages** use `PageHeader` (eyebrow/breadcrumb, title, description, actions); lists use card + `mc-list-row`; zero states use `EmptyState` with an icon, one line of guidance and at most one action.
- **Chat:** Discord-grade density — author runs collapse within 5 minutes, day dividers, channel intro block, layout-matched skeletons, hover toolbar with destructive actions separated, keyboard hints under the composer, full timestamps on hover.
- **Accessibility:** every icon-only button gets a tooltip from its accessible label automatically; focus-visible rings; disabled controls look inactive rather than dimmed.
- Styles: `tokens.css`, `base.css`, `components.css` (kit), `shell.css`, `chat.css`, `auth.css`.

## Principles
- Calm, clinical, high-contrast neutral palette; one accent colour. Dense but readable (chat apps are information-heavy).
- Keyboard-first (Esc closes, Enter sends, ↑ edits last message, `/` focuses search). WCAG AA contrast, visible focus rings, ARIA roles on lists/dialogs.
- Light + dark theme from day one (class on `<html>`, persisted in localStorage, default from `prefers-color-scheme`).
- Every async view has loading (skeleton), empty, and error states.

## Design tokens (`frontend/src/styles/tokens.css`, prefix `--mc-*`)
Structure: brand primary/hover/active/light, neutral gray 50–950, semantic pairs (success/warning/danger/info × base/bg/border/text), spacing scale (4/8/12/16/24/32/48/64), radius (4/6/8/12/16/full), transitions (150/250/400 ms), shadows (modal, button), overlay colour. Add chat-specific tokens: `--mc-bubble-*`, `--mc-mention-bg`, `--mc-presence-online/away/offline`, `--mc-verified-badge`.

## Component kit (`frontend/src/components/ui/`, barrel `index.ts`)
Thin React components over shared CSS classes (`mc-btn-primary`, `is-sm`, `is-loading`…), as follows:
| Component | Notes |
|---|---|
| `Button` | variants primary/secondary/ghost/danger/icon; sizes; `loading` shows spinner + `aria-busy`; `forwardRef` |
| `Input`, `Textarea`, `Select`, `FormGroup` | label + hint + error wiring, `aria-describedby` |
| `Modal` | portal to `#modal-root`, Esc/backdrop close, body scroll lock, sizes sm–xl, optional footer |
| `Drawer` / `SidePane` | right slide-over: **thread panel**, member list, edit-history viewer |
| `Tabs`, `Menu` | context menus on messages/channels; tabs in settings |
| `Badge`, `Alert`, `EmptyState`, `Loader`, `TableSkeleton` | statuses, verified/role badges, empty channel state |
| `Table`, `Pagination`, `SearchBar`, `SearchableSelect` | admin verification queue, member lists, audit log |
| `PageHeader`, `Card` | admin/settings pages |
| `Toast` (new) | notifications for send failures, mentions |
| `ErrorBoundary`, `ProtectedRoute` | standard |

Libraries: `lucide-react` icons, `react-router-dom` v6, `axios`, `date-fns`, `recharts` (admin analytics only). Add: Tailwind is **not** used; CSS variables + small component CSS keeps the stack simple.

## App shell (`Layout` + `Sidebar` + `Header`)
Discord-style 4-column layout:
1. **Community rail** (icons) – switch communities, add/join.
2. **Channel sidebar** – grouped channels (text/announcement), DMs section, collapsible groups, unread badges, `NavLink` active state.
3. **Message pane** – header (channel, topic, search, members toggle), virtualised timeline, composer.
4. **Right panel** (`Drawer`) – member list / thread / pinned / edit history.
Responsive: collapses to rail + single pane on mobile.

## Chat-specific components (`features/chat/`)
`MessageList` (virtualised, day separators, jump-to-unread), `MessageItem` (avatar, name + verified badge + specialty, edited marker, hover toolbar: react/reply/thread/edit/more), `Composer` (mentions autocomplete, attachments, emoji, reply preview, edit mode), `ThreadPanel`, `ReactionBar`, `EditHistoryModal`, `TypingIndicator`, `PresenceDot`, `UnreadDivider`, `MemberList`, `VerifiedBadge`.

## Conventions
- Co-locate component + css; props typed; no inline colours (tokens only).
- Tests with Vitest + Testing Library (shared `src/test/setup.ts`); at least render + a11y-role assertions per kit component.
- Storybook optional later; for now a `/dev/ui` page lists every kit component.
