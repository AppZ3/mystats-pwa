# Visual Polish Pass — Design Spec

## Problem

The app is functionally solid but reads as "dev-built" rather than "designed":
no elevation anywhere in the stylesheet (zero `box-shadow` usage — `.card`
and `.session-ctrl-bar` both have a 1px `--border` outline but nothing that
actually lifts them off the page, so depth is only ever implied, never
felt), the bottom nav uses raw system emoji (🏠💪🏃📊📈🏆🔔⚙️) which
renders inconsistently across devices and reads as placeholder iconography,
and the two pill/tab rows on the Today screen — `.ctrl-pill` (programme/
week/day selectors) and `.today-tab` (Session/Checklist/Supps) — use the
same rounded-pill shape and the same "goes solid orange when active"
treatment for both, so despite `.today-tab` already being slightly larger,
the two rows read as one undifferentiated control style rather than two
distinct kinds of control (a filter cluster vs. the primary content
switcher).

## Goals

- Replace emoji icons with a consistent, custom icon set, starting with the
  bottom navigation (present on every screen, highest-visibility target).
- Give cards, active pills, and primary buttons real elevation/depth using
  the app's existing black-and-gold/orange palette (`--bg: #111114`,
  `--accent: #ff8c42`) — reinforcing the existing scheme, not replacing it.
- Visually differentiate the Today screen's selector-pill row from its
  content-tab row so the screen doesn't read as one undifferentiated wall
  of buttons.
- Build a real, working local mockup of these three changes on the Today
  screen + bottom nav (the highest-traffic combination) and get visual
  sign-off before rolling the same treatment out to the rest of the app.

## Non-goals

- Not replacing every emoji in the app in this pass (Settings section
  headers, onboarding icons, PR medals, etc.) — that's a natural follow-up
  once the direction is validated on the mockup, not part of this spec.
- Not changing any interaction/behavior — this is a CSS/markup-only visual
  pass. No new features, no changed click targets, no changed data flow.
- Not introducing a new color palette — reinforcing black/gold/orange, not
  replacing it.
- Not adding a build step or new runtime dependency (icon font, bundler).

## Approach: inline SVG icons

Icons come from Lucide (ISC-licensed, free to embed, no attribution
required) — a consistent single-stroke outline set that's a natural fit for
a dark, minimal UI. A new `js/icons.js` module exports one function per
icon, each returning an SVG string sized to fill its container and colored
via `stroke="currentColor"` — so existing color logic (`.nav-btn` /
`.nav-btn.active` already toggle `color: var(--muted)` /
`color: var(--accent)`) recolors icons automatically with zero new CSS
color rules needed. No new dependency, no extra network request — the SVG
markup lives directly in the JS module, matching this project's no-build-
step convention.

```js
// js/icons.js
export function icon(name, size = 22) {
  const paths = {
    home:      '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    dumbbell:  '<path d="M6.5 6.5 17.5 17.5"/><path d="M2 8l4-4M22 16l-4 4"/><rect x="1" y="10" width="6" height="4" rx="1"/><rect x="17" y="10" width="6" height="4" rx="1"/>',
    footprints:'<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/>',
    scale:     '<path d="M16 16a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2"/><circle cx="12" cy="8" r="6"/>',
    'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    trophy:    '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3a2 2 0 0 1 0 4h-1M7 5H4a2 2 0 0 0 0 4h1"/>',
    bell:      '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    settings:  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
}
```

`js/app.js`'s `TABS` array (`{ id, label, title, render }`) currently uses
`label` as the raw emoji string interpolated directly into `buildNav()`'s
template. `label` changes from an emoji character to an icon name string
(`'home'`, `'dumbbell'`, etc.); `buildNav()`'s template calls
`icon(t.label)` instead of interpolating `t.label` directly, wrapped in a
`<span class="nav-icon-svg">` instead of `<span class="nav-icon">` (a new
class since the sizing/layout needs differ from a text emoji glyph).

## Approach: elevation

New CSS custom properties in `:root`:

```css
--shadow-card: 0 2px 8px rgba(0,0,0,.4), 0 1px 2px rgba(0,0,0,.3);
--shadow-glow: 0 0 0 1px rgba(255,140,66,.15), 0 2px 12px rgba(255,140,66,.2);
```

`.card` and `.session-ctrl-bar` (both already have `background: var(--card)`
or `var(--card)`-equivalent plus a 1px border) gain
`box-shadow: var(--shadow-card);` — the border keeps its current job
(edge definition), the shadow adds the depth cue the border alone can't
provide. `.ctrl-pill.active`, `.today-tab.active`, and `.btn-primary` —
the three elements that already go solid-accent-orange when active/primary
— gain `box-shadow: var(--shadow-glow);` on top of their existing solid
background, so the "this is the selected/primary thing" signal reads as
lifted material, not just a color change. (`.nav-btn.active` is
deliberately excluded here — it has no background fill today, only a
color change, so a shadow with nothing solid behind it wouldn't read as
elevation; left as color-only, matching how it already works.)

## Approach: pill/tab differentiation

`.session-ctrl-bar` already has its own bordered/backgrounded container
(`background: var(--card); border: 1px solid var(--border);`), so the two
rows aren't visually un-grouped today — the actual problem is that
`.ctrl-pill` and `.today-tab` use the *same* shape language (both
20px-rounded pills, both flip to solid `--accent` when active), so despite
`.today-tab` already being larger (`.82rem`/`.45rem` padding vs.
`.ctrl-pill`'s `.72rem`/`.18rem`), they read as one style repeated twice
rather than two distinct kinds of control.

Fix: `.ctrl-pill` stays a small flat chip (no change to its existing
size/shape — it's already correctly scaled down) but drops the
solid-fill active state for a lighter one: `.ctrl-pill.active` becomes
`background: transparent; border-color: var(--accent); color: var(--accent);`
(outlined, not filled) so it reads as "currently selected filter," not
"this is the important button." `.today-tab` keeps its solid-fill active
state (unchanged) but the *inactive* tabs also gain a subtler visual
demotion — `border: none; background: transparent;` — so only the active
tab has a filled shape at all, making it unambiguously the primary control
on the row. The net effect: the pill row becomes visually quiet (outlined
selection, no filled shapes at rest), the tab row becomes visually loud
(one clear filled/glowing tab, nothing competing with it) — two different
visual languages for two different kinds of control, achieved by changing
only the `.active`/inactive state rules, not the base shape/sizing either
row already has.

This is CSS-only — `today.js`'s markup structure (`.session-ctrl-bar` and
`.today-tabs` already exist as separate wrapper elements) doesn't change,
only the rules applied to those existing classes.

## Mockup scope

Before rolling this out app-wide, build and screenshot a working local
mockup covering: the bottom nav (all 8 icons, active/inactive states) and
the Today screen (card elevation, differentiated pill/tab rows) — the
highest-traffic screen combination and the one that exercises all three
changes at once. Get explicit visual sign-off on this mockup before
extending the same icon/shadow/pill treatment to the remaining 7 tabs and
the Settings block editor.

## Testing / verification plan

No automated test framework exists in this project (established
convention) — verification is manual:
- `node --input-type=module < js/icons.js` and `js/app.js` syntax checks.
- Live browser check via `vercel dev` + Playwright: confirm each of the 8
  nav icons renders (not a broken/empty SVG), confirm active/inactive
  color states still work correctly (was color-only before, now also
  toggles the glow shadow), confirm the Today screen's card/pill/tab
  changes render without layout breakage at a mobile viewport (390×844,
  matching the project's phone-first usage).
- Screenshot the mockup and present it directly for visual sign-off before
  any further rollout or plan to extend to the rest of the app.
