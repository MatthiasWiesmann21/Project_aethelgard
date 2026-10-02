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
   (terrain.ts, buildings.ts, techs.ts, goods.ts) — do not scatter magic
   numbers through systems or components.

## Domain Concepts
- **Regions**: irregular Voronoi polygons (HOI4-style). Terrain, adjacency,
  building slots, population, deposits, fog-of-war. Claimed for gold to expand;
  `hostile` regions hold neutral defenders and must be conquered.
- **Workforce**: buildings need `workers` from region population; understaffed
  buildings produce proportionally less (`regionWorkersNeeded` → staffing
  factor in `economy.ts`). Terrain and deposit yields need no workers.
- **Buildings**: level 1-3; upgrade cost = base × (1 + (level−1) × 0.8),
  output scales linearly with level.
- **Units**: mobile scouts/fighters (`Unit` — kind, regionId, strength, moves,
  sight, path). Warrior (sight 1, move 1) starts in the capital; Traveler
  (sight 2, move 2, weak) unlocks via the `scouting` tech. Move orders are
  destinations: `findPath` (BFS over non-hostile land) + `advanceUnit` walk
  `moves` steps per tick, revealing fog. Attacking a hostile neighbor costs a
  move; units heal `HEAL_PER_TICK` strength inside owned territory.
- **Military**: region-attached armies (`Region.army`). Train requires a
  barracks + pop/iron/gold; `attackRegion` resolves instantly vs
  `garrison × DEFENDER_ADVANTAGE` with a seeded roll.
- **Time**: one tick = one game month; the game starts at year 10,000 BC
  counting down (`formatDate` in TickControls). TICK_MS = 1200 at 1x.
- **Baseline economy**: every pop pays `TAX_PER_POP` gold and produces
  `SUBSISTENCE_FOOD_PER_POP` food; food shortage stalls population growth
  (no starvation deaths). Population is capped by `regionCapacity` (terrain +
  building `capacityBonus` — granary adds housing).
- **Construction**: new buildings take `BUILD_TICKS` months
  (`Region.construction`), one at a time per region.
- **Tribes**: `tribes.ts` — hostile regions expand into free land or raid
  weakly-defended player borders every 24 ticks (seeded); strong garrisons
  repel raids and weaken the tribe.
- **Camera**: `RegionMap` owns a viewBox camera — drag-pan, WASD/arrows,
  cursor-anchored wheel zoom, +/− buttons.
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
  10 ticks and is loaded on boot. `SAVE_VERSION` migration normalizes old
  saves (path, construction, queue). "New Map" asks for confirmation.

## Verification
- `npm run dev` — dev server
- `npm run build` — `tsc -b && vite build` (typecheck + bundle)
- `npm run lint` — oxlint
- `npx vitest run` — unit tests

## Art Direction
Bright and colorful: warm off-white background, white rounded-2xl panels with
soft shadows, flat terrain colors, per-good accent colors, lucide icons.
