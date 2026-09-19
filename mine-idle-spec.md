# Deep Shaft — Mine Management Idle Game
### Full Spec for Coding Agent (v1.0)

---

## 0. One-line pitch

A browser idle game where you manage a mine: buy drills and hire workers to extract ore, gems, and rare minerals from progressively deeper shafts, survive cave-ins, catch lucky veins, and prestige to dig faster next time.

---

## 1. Tech Stack

- **Engine:** Phaser.js (v3.x, latest stable)
- **Language:** JavaScript (ES modules), no TypeScript required unless the agent prefers it
- **Build:** Vite (fast dev server, works cleanly with Phaser + ES modules, minimal config)
- **Persistence:** Browser `localStorage` only. No backend, no accounts.
- **Target:** Single HTML page, static build, deployable anywhere (no server logic)
- **Platform:** Must work well on mobile browsers from day one — layout, font sizes, and touch targets are designed mobile-first, then scaled up for desktop, not the reverse.

### Project structure (suggested)
```
/src
  /scenes
    BootScene.js       // load assets, init save
    GameScene.js        // main game view (mine shaft + UI overlay)
  /systems
    SaveSystem.js        // load/save/serialize localStorage
    ResourceSystem.js    // resource pools, sell logic, sell curves
    ProductionSystem.js  // tick-based generation from drills/workers
    OfflineSystem.js     // calculates elapsed-time production on load
    DepthSystem.js        // dig-deeper logic, tier unlocks
    WorkerSystem.js       // hiring, leveling, stat application
    EventSystem.js        // random events (cave-ins, lucky veins)
    PrestigeSystem.js     // reset logic, permanent multiplier tracking
    NumberFormat.js        // big-number formatting (see §8)
  /ui
    HUD.js                // resource bars, currency display
    ShopPanel.js            // drills/workers/upgrades purchase UI
    DepthPanel.js            // dig-deeper button + depth progress
    EventToast.js             // popup for random events
    PrestigeModal.js          // prestige confirmation + summary
  /data
    resources.js           // resource definitions per depth tier
    drills.js                // drill tier definitions & costs
    workers.js                // worker archetypes, stat ranges, cost curve
    depthTiers.js              // depth tier configs (unlock cost, resource pool, event weights)
    events.js                    // event definitions (cave-in, lucky vein, etc.)
  main.js                        // Phaser game config + boot
index.html
```

This is a suggestion, not a mandate — the agent should keep the systems decoupled (each system owns one concern, communicates through a shared game-state object or event bus) so balancing changes later don't require touching render code.

---

## 2. Core Loop

1. Player clicks the shaft to manually extract a small amount of ore (early game only — this is the "tutorial" action).
2. Player spends earned currency on **drills** (generic, tiered, no identity) — these auto-generate resources per second, including while the tab is closed (offline progress).
3. Mid-game: player unlocks **named workers** (individual stats: speed, luck) who can be assigned to boost specific drills or resource types, and who level up with use/time.
4. Player sells extracted resources for currency (ore/gems/rare minerals each have separate sell curves — see §4).
5. Player spends currency to **dig deeper** — a manual, discrete purchase that unlocks the next depth tier with new/better resources and higher-tier drill slots.
6. Random events fire periodically: cave-ins (temporary drill downtime, negative) and lucky veins (temporary production boost, positive).
7. Once progress stalls, player can **prestige**: reset current run (currency, drills, depth) in exchange for a permanent multiplier that makes the next run faster.
8. Repeat from step 2, faster each prestige cycle.

---

## 3. Resources

Branching structure — at every depth tier, three resource *categories* exist simultaneously, each with independent sell-price curves:

| Category | Behavior | Sell curve |
|---|---|---|
| **Ore** | Common, high volume, low value | Flat/linear — reliable baseline income |
| **Gems** | Rarer drop chance, mid value | Value scales with depth tier, moderate volume |
| **Rare Minerals** | Lowest drop chance, highest value | Steep value scaling with depth, low volume — the "jackpot" resource that matters more at deeper tiers |

Each depth tier defines its own instance of these three (e.g. Tier 1: Coal/Quartz/Nothing-rare-yet; Tier 4: Iron/Emerald/Platinum). Drop rates and base values live in `data/depthTiers.js` and `data/resources.js` so the agent can tune them without touching logic.

**Formula skeleton (agent should implement, values are placeholders for playtesting):**
```
resourcePerSecond(drillTier, workerBonus) =
  baseDrillOutput(drillTier) * (1 + workerBonus) * depthTierMultiplier

sellValue(resourceType, amount, depthTier) =
  amount * baseUnitValue(resourceType) * depthTierValueMultiplier(depthTier)
```
Exact constants (`baseDrillOutput`, `baseUnitValue`, growth exponents) are **not specified here** — they require playtesting against actual session-length targets. Ship with reasonable placeholder constants (e.g. exponential cost growth ×1.15 per drill purchase, a common idle-game default) and expose them in one config file so they're trivial to retune after the first playable build.

---

## 4. Drills (generic upgrades)

- Tiered: Drill Tier 1, 2, 3... each tier = higher base output, higher purchase cost.
- Cost curve: exponential (`cost = baseCost * growthRate^ownedCount`), standard idle-game pattern.
- Purchasable in bulk (buy x1 / x10 / max-affordable — standard idle UX, include this from the start, it matters a lot for feel).
- Available immediately at game start — this is the pre-worker economy.

---

## 5. Workers (named, mid-game system)

- Unlocked after a milestone (e.g. reaching Depth Tier 2, or a total-currency-earned threshold — agent's call, flag it as configurable).
- Each worker has:
  - **Name** (can be randomly generated from a name pool — keep it lightweight, doesn't need to be deep)
  - **Speed stat** — increases production rate of assigned drill/resource
  - **Luck stat** — increases rare-drop chance (gems/rare minerals)
  - **Level** — increases with time-assigned or a currency-based "train worker" action; leveling increases both stats
- Workers are assigned to a drill or resource category (player choice) — this is the "management" layer the request specifically asked for.
- Worker hiring cost scales similarly to drills (exponential), separate cost curve.

---

## 6. Depth / Digging Deeper

- Manual action: a "Dig Deeper" button, costs currency, cost scales up per tier.
- On unlock: reveals next depth tier's resource set, unlocks a higher drill tier ceiling, and updates the visual shaft (see §9).
- Deeper tiers should have higher output potential but higher costs — this is the main pacing lever for the whole game.

---

## 7. Random Events

Two event types at launch:

- **Cave-in (negative):** temporarily disables one or more drills for a short duration (e.g. 10–30s). Should be visually communicated clearly (shaft flickers/darkens, a toast notification) — never silent, since silent penalties feel unfair in idle games.
- **Lucky Vein (positive):** temporary production or drop-rate multiplier for a short window.

Both fire on a randomized timer with tunable weights per depth tier (deeper = slightly more frequent/severe, both good and bad — configurable in `data/events.js`). Keep the event system decoupled so more event types can be added later without touching ProductionSystem.

---

## 8. Number Formatting

Idle games generate very large numbers fast. The agent must implement a `NumberFormat.js` utility that:
- Displays numbers in abbreviated form past a threshold (e.g. 1.2K, 3.4M, 5.6B, then scientific notation or suffix chains beyond that — standard idle-game practice)
- Is used consistently everywhere a number renders (HUD, shop costs, sell totals)
- Never displays a raw unformatted float

---

## 9. Visuals

- **Shaft:** simple layered visual (Phaser sprites/tilemap or even just stacked rectangles with a CC0 texture) representing depth — doesn't need to be literally animated digging, just needs to visually communicate "how deep am I" and "what's down there." Complexity here should stay low — this is explicitly not the game's core investment.
- **Assets:** source a free CC0 pixel-art pack (e.g. from itch.io or OpenGameArt) covering: miner/worker sprite, ore/gem/mineral icons, drill icon, simple terrain/rock tileset. Agent should pick one cohesive pack rather than mixing styles.
- **UI:** clean, mobile-first layout — large tappable buttons, resource bars/counters always visible, shop panel as a bottom sheet or side panel depending on screen width (responsive breakpoint, not two separate builds).

---

## 10. Prestige

- Manual action, available once minimum viable progress is reached (agent's call on exact threshold, expose as config).
- On prestige: resets currency, drills, workers (or optionally keeps workers at reduced level — agent's call, flag as a decision point since it changes pacing significantly), and depth back to Tier 1.
- Grants a **permanent multiplier** (persisted outside the reset-able state) that boosts base production on all future runs — the classic "number keeps going up even after reset" idle hook.
- Multiplier formula should scale with how far the player got before resetting (e.g. total lifetime currency earned this run), not a flat bonus — this is what makes prestige feel earned rather than automatic.

---

## 11. Save System

- Single localStorage key holding a serialized JSON game-state object.
- Must capture: current currency, resource inventories, drill counts, worker roster + stats/levels, current depth tier, prestige multiplier + prestige count, last-saved timestamp.
- **Offline progress:** on load, compare `Date.now()` to the saved timestamp, calculate elapsed seconds, and run production math for that duration in one batch (capped at a reasonable max, e.g. 24h, to avoid absurd single-session jumps — agent's call on cap value).
- Autosave on an interval (e.g. every 10–30s) plus on tab-close/visibility-change events.

---

## 12. MVP Scope (build this first, in this order)

1. Boot + save/load skeleton, empty game scene
2. Single depth tier, ore-only, manual click-to-mine
3. Add currency + generic drills (buy, auto-produce, cost scaling)
4. Add number formatting
5. Add offline progress calculation
6. Add gems + rare minerals (branching resources) at Tier 1
7. Add "Dig Deeper" → Tier 2 unlock, second resource set
8. Add named workers + assignment
9. Add random events (cave-in, lucky vein)
10. Add prestige system
11. Mobile-responsive UI pass
12. Visual pass with real CC0 assets (was placeholder shapes until now)

Each numbered step should be independently playable/testable before moving to the next — don't build all systems in parallel and wire them together at the end.

---

## 13. Explicitly Out of Scope (v1)

- No ads, no monetization of any kind
- No backend, no accounts, no cross-device sync
- No multiplayer/leaderboards
- No sound (can be added later, not blocking)
- No literal physics-based digging animation

---

## 14. Open Config Decisions (flagged, not guessed)

These need a value but shouldn't be hardcoded without room to tune — put them in one central config object:
- Exact cost-growth exponents for drills/workers
- Worker-unlock milestone threshold
- Event frequency/severity weights per depth tier
- Offline-progress time cap
- Prestige multiplier formula constants
- Number of depth tiers in v1 (suggest starting with 5, expand later)

Tune these after the first playable build (step 4–5 in §12), not before — building the numbers-tuning UI/config file now and filling in real values from playtesting is faster than guessing correctly on paper.
