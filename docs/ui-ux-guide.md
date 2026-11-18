# MedCord UI/UX guide

MedCord has its own standalone design system: TypeScript components with the `mc-` prefix and MedCord branding. It does not depend on or import from any other project.

## Visual language (v2, Discord-inspired)
- **Midnight indigo** dark theme by default (light available via the theme toggle). Vibrant violet to cyan gradient (`--mc-grad`) for primary actions, the logo and hero banners; cyan accent for active indicators; success green for presence.
- **Shell:** `ServerRail` (76px, squircle community icons that morph on hover, glowing active pill, tooltips) | `SideColumn` (contextual: channels, DMs, or navigation, plus the user panel) | content. `ChannelChat` renders only the message pane, with optional thread and member panels.
- **People and communities** get stable gradient initials avatars (`Avatar`, `gradientFor`); presence dots on avatars.
- **Chat details:** consecutive messages by the same author collapse (5 min window), day dividers, hover toolbar, reaction pills with pop animation, rounded auto-growing composer, entrance animations (respects `prefers-reduced-motion`).
- Styles are split: `tokens.css`, `base.css`, `components.css` (UI kit), `shell.css`, `chat.css`, `auth.css`.

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
