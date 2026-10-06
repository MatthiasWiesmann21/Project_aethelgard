# Agent Directives — Aethelgard

Aethelgard is an economy-focused strategy game (Civ-style 4X frame: eras, research
trees, expansion — with building/economy as the core loop, military secondary).

## Tech Stack
- Vite + React 19 + TypeScript (strict mode)
- State: Zustand (`src/store/`)
- Styling: Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first — no tailwind.config)
- Icons: lucide-react
- Map: 2D SVG; irregular Voronoi regions generated with `d3-delaunay`
- Tests: Vitest for `src/core/` systems

## Architectural Guidelines
1. **Logic/render separation.** All simulation logic lives in `src/core/systems/`
   as pure TypeScript functions that take state slices and return patches. NEVER
   put simulation, price formulas, or game ticks inside React components or
   render loops. `GameLoop.ts` orchestrates the tick and commits patches to the
   Zustand stores.
2. **State flow.** `GameLoop.tickOnce()` → pure systems → store updates →
   React components subscribe to stores for rendering. Stores hold state and
   actions (validation + state transitions), not formulas.
3. **Strict typing.** All domain models in `src/types/` (`game.d.ts`,
   `research.d.ts`, `buildings.d.ts`). No `any`. The tsconfig uses
   `erasableSyntaxOnly` — use union string types, NOT enums.
   `verbatimModuleSyntax` — always `import type` for type-only imports.
4. **Performance.** Heavy work (market prices, adjacency, map gen) happens on
   simulation ticks or at world generation, never per render frame.
5. **Data-driven tuning.** All balance constants live in `src/data/`
   (economy.ts, terrain.ts, buildings.ts, units.ts, rivers.ts, techs.ts,
   goods.ts) — do not scatter magic numbers through systems or components.
6. **Immutable state.** Systems never mutate state they receive. Region
   updates are copy-on-write (`revealRadius`/`revealAround`/`advanceUnit`
   return new records and clone only changed regions) so memoized map
   components (`RegionShape`) skip unchanged regions.

## Domain Concepts
- **Regions**: irregular Voronoi polygons (HOI4-style). Terrain, adjacency,
  building slots, population, deposits, fog-of-war. Claimed for gold to expand;
  `hostile` regions hold neutral defenders and must be conquered.
- **Workforce**: buildings need `workers` from region population; understaffed
  buildings produce proportionally less (`regionWorkersNeeded` → staffing
  factor in `economy.ts`). Terrain and deposit yields need no workers.
- **Buildings**: level 1-3; upgrade cost = base × (1 + (level−1) × 0.8),
  output scales linearly with level.
- **Units (the only military system)**: `Unit` — kind, regionId, strength,
  movesLeft, sight, path. Warrior starts in the capital; Traveler (fast,
  far-sighted, weak) needs `scouting`; Soldier (⚔10) needs `militia` + a
  Barracks in the recruiting region (`recruitBlockReason`). Max moves are
  derived each tick: `unitMoves()` = base + 1 per era + `unitMoveBonus`.
  Every unit has monthly gold/food `upkeep` (`data/units.ts`); if the
  treasury hits 0, units stop healing. Units heal `HEAL_PER_TICK` in owned
  land.
- **Movement**: move orders are destinations. `findPath` is Dijkstra over
  non-hostile land weighted by `stepCost` = terrain `moveCost` (plains/coast
  1, forest/hills 2, mountain 3) + `RIVER_EXTRA_MOVE_COST`. `advanceUnit`
  walks per tick; a unit with full moves may always take one step.
- **Combat**: `attackWithUnits` — all ready units in a region attack a
  hostile neighbor with combined strength (`resolveStackAttack`) vs
  `garrison × DEFENDER_ADVANTAGE`, seeded roll, ×`RIVER_ATTACK_PENALTY`
  across rivers. Attacking costs a move; survivors share losses.
- **Rivers**: deterministic seeded edges between land neighbors
  (`isRiver(seed, …)` — no state stored). Adjacent regions get +food, +gold,
  +growth per river; rendered along the shared Voronoi border
  (`riverEdges`, cached per world).
- **Time**: one tick = one game month; the game starts at year 10,000 BC
  counting down (`core/time.ts` → `formatDate`, used by HUD, log, saves).
  TICK_MS = 1200 at 1x.
- **Baseline economy**: every pop pays `TAX_PER_POP` gold and produces
  `SUBSISTENCE_FOOD_PER_POP` food; food shortage stalls population growth
  (no starvation deaths). Population is capped by `regionCapacity` (terrain
  `capacity` + building `capacityBonus` — granary adds housing). The economy
  tick returns a per-source `breakdown` (taxes, buildings, rivers, upkeep…)
  shown in HUD tooltips; its parts always sum to the rates.
- **Construction**: new buildings take `BUILD_TICKS` months
  (`Region.construction`), one at a time per region.
- **Tribes**: `tribes.ts` — every 24 ticks hostile garrisons regrow, then
  tribes expand into free, unoccupied land (only with garrison ≥
  `TRIBE_EXPAND_MIN_GARRISON`) or raid player borders. Defense = garrison +
  tech `garrisonBonus` + stationed unit strength; strong defense repels.
- **Camera & map**: `RegionMap` owns a viewBox camera — drag-pan,
  held WASD/arrows and edge scrolling via one rAF loop, cursor-anchored
  wheel zoom, +/− buttons, clickable `Minimap`. Regions render through the
  memoized `RegionShape` (terrain gradients, hatched fog frontier, labels
  hidden when zoomed out); units are tokens with a health ring that glide
  between regions.
- **Goods**: food, wood, stone, iron (stockpiled); gold is currency; science
  is a rate, not a stockpile.
- **Research**: 4 trees — Society, Economy, Infrastructure, Military. Era locks,
  prerequisites, typed effects (`TechEffect` union). Completing 4 techs of the
  current era advances the era. `queue` auto-starts the next tech and carries
  leftover science forward.
- **Market**: per-good price = `basePrice * clamp((demand/supply)^ε, min, max)`
  with EMA supply and decaying trade pressure from player buy/sell.
- **Events**: `events.ts` rolls a deterministic seeded event every 30 ticks
  (~50% chance): harvests, plagues, scholars, bandits.
- **Persistence**: `persistence.ts` — named save slots in localStorage
  (`aethelgard-save-<name>` + an index); autosave writes the `auto` slot every
  10 ticks and is loaded on boot. `snapshotState()` (game store) is the one
  source for save payloads. Region geometry (polygon/centroid/neighbors) is
  NOT stored — `hydrateRegions` rebuilds it from the seed, so
  `generateWorld` must stay deterministic. `SAVE_VERSION` 4 migration
  converts old `Region.army` into Soldier units and fills new fields.
  "New Map" asks for confirmation.
- **Research queue**: techs can be queued when their prerequisites are
  completed, active, or queued earlier; removing a queued tech prunes
  dependents (`pruneQueue`).

## Verification
- `npm run dev` — dev server
- `npm run build` — `tsc -b && vite build` (typecheck + bundle)
- `npm run lint` — oxlint
- `npx vitest run` — unit tests (node environment; persistence tests stub
  `localStorage` with an in-memory class)

## Art Direction
Bright and colorful: warm off-white background, white rounded-2xl panels with
soft shadows, flat terrain colors, per-good accent colors, lucide icons.
