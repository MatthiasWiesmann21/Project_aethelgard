import type { Era, GoodId, UnitKind } from './game'
import type { BuildingId } from './buildings'

export type TreeId = 'society' | 'economy' | 'infrastructure' | 'military'

export type TechEffect =
  | { kind: 'yieldBonus'; good: GoodId | 'all'; multiplier: number }
  | { kind: 'goldYieldBonus'; multiplier: number }
  | { kind: 'unlockBuilding'; building: BuildingId }
  | { kind: 'claimCostMultiplier'; multiplier: number }
  | { kind: 'armyStrengthMultiplier'; multiplier: number }
  | { kind: 'garrisonBonus'; amount: number }
  | { kind: 'unlockUnit'; unit: UnitKind }
  | { kind: 'popGrowthMultiplier'; multiplier: number }
  | { kind: 'scienceMultiplier'; multiplier: number }
  | { kind: 'buildingSlots'; amount: number }

export interface TechNode {
  id: string
  name: string
  description: string
  tree: TreeId
  /** Minimum era required to start this research. */
  era: Era
  /** Science points required to complete. */
  cost: number
  prerequisites: string[]
  effects: TechEffect[]
}
