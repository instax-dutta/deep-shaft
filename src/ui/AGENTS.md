# DOM UI Contract

## Purpose
- Own the mobile-first player interface for resources, shops, depth progression, events, workers, and prestige.

## Ownership
- HUD, shop controls, depth controls, event toasts, worker management, the permanent-upgrade
  tree, and prestige confirmation belong here.

## Local Contracts
- Accessibility is enforced, not aspirational: every interaction has a keyboard-focusable control
  (mining has a real Mine button, not only a canvas tap), modals use `focusTrap.js`, dialogs are
  labelled by their heading, and `styles.css` provides `:focus-visible` and a
  `prefers-reduced-motion` block. `liveRegion.js` announces milestone *transitions* once each.
- Each panel exports a `create<Panel>({ root, dispatch })` factory returning
  `{ element, render(state) }`. `render` updates the elements that are already mounted; panels
  never rebuild themselves from scratch.
- A modal panel additionally exposes `{ open, close, isOpen }`, and opening it must dispatch
  nothing — only an explicit confirm action issues the command. A modal that becomes invalid
  while open closes itself rather than offering an action that can no longer succeed.
- A destructive confirmation states the full penalty before it is applied, takes its numbers from
  the same core preview the command applies, and focuses the safe (non-destructive) option.
- `dom.js` owns the shared element builder. Panels build nodes explicitly rather than through
  `innerHTML`, so player-visible copy is never parsed as markup.
- UI displays formatted values through the core number formatter
  (`src/core/numberFormat.js`); it does not format numbers independently.
- Buttons dispatch named commands and are disabled when a command cannot succeed; disabled
  buttons never dispatch. Refusals from the domain layer surface as copy, never as silence.
- Penalties, offline gains, and reset consequences are visible and understandable.
- Mobile uses large touch targets and bottom-sheet panels; larger screens may use side panels through responsive CSS.
- Layout is mobile-first and verified by measurement, not by eye. `npm run test:browser:responsive`
  asserts at eight viewports that nothing overflows horizontally, no label is clipped, every touch
  target is at least 44px, and the layout matches the configured breakpoint.
- Responsive rules are written against the space an element actually has, not the viewport. The
  panel column is 340–560px wide in every side-by-side layout, so the HUD uses `auto-fit` columns
  sized to that column; a viewport-derived column count made cards cramped on tablets and stretched
  on desktop.
- Never separate two pieces of text with only a margin where they need a line-break opportunity.
  A margin provides no wrap point, so a narrow container can neither wrap nor shrink and the label
  escapes both its card and the viewport. Use a wrapping flex row with a gap, and give grid items
  `min-width: 0` so they are allowed to shrink.
- `config.ui.mobileBreakpointPx` is the source of truth for the layout breakpoint. CSS cannot read
  a config module, so the media query necessarily repeats the number; `responsiveStyles.test.js`
  fails if the two disagree.
- Bound the width of a column that holds text. An unbounded `1fr` gave the panel column 835px on a
  1920px screen, turning short labels into very long lines.

## Work Guidance
- Prefer semantic HTML controls and keyboard-accessible dialogs.
- Keep DOM creation/rendering separate from command dispatch where practical.
- Avoid nested card-heavy layouts and preserve a readable resource hierarchy.

## Verification
- Test disabled states, command dispatch, visible notifications, modal confirm/cancel, and responsive class behavior.
- DOM tests opt into jsdom with a `// @vitest-environment jsdom` docblock and assert on mounted
  elements, not on internal state.
- Run a production build after UI changes.

## Child DOX Index
- No narrower durable UI boundary exists yet.

## Local Contracts (v2 additions)
- `bootFallback.js` owns the last-resort screen: a readable "could not start" message with the
  app version and a reload control, mounted into `document.body` when the app root is missing.
  `main.js`'s `guardedBoot` uses it for any failure before the game is interactive; after boot,
  errors surface as an in-game notice plus the Settings > Diagnostics log instead.
- `tutorialPanel.js` renders the first-run coach line from `core/tutorial.js` and hides itself
  entirely for a completed tutorial; skipping is a player action, never a timeout.
- `confirmModal.js` is the shared destructive-confirmation (reset, worker dismissal): opening
  dispatches nothing, the safe option takes focus, Escape closes, and the message names the loss.
- A hidden live region must use `position: fixed`, never `absolute`, inside the scrolling panel
  column: an absolutely positioned nowrap region contributed its text width to the column's
  scrollable overflow and pushed 320px phones sideways (caught by the responsive sweep).
- An `<input>` inside a flex row needs `flex-basis: 0; width: 0; min-width: 0`, not only
  `min-width: 0`: the intrinsic size attribute otherwise inflates the row's min-content, which
  sizes the whole panel column to it (also caught by the responsive sweep).
- Every panel factory must append itself into the `root` it is given, and every composition panel
  has a browser smoke check asserting it is mounted (`every composition panel is mounted`). The
  settings panel shipped unmounted for three phases because jsdom tests used `panel.element`
  directly; a factory that returns an element without appending it must say so explicitly.
