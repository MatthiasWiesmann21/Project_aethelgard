import {
  Anchor,
  Axe,
  Coins,
  FlaskConical,
  Hammer,
  Mountain,
  Pickaxe,
  Shield,
  Store,
  TreePine,
  Warehouse,
  Wheat,
  type LucideIcon,
} from 'lucide-react'
import type { GoodId } from '../types/game'
import type { BuildingId } from '../types/buildings'

export const GOOD_ICONS: Record<GoodId, LucideIcon> = {
  food: Wheat,
  wood: TreePine,
  stone: Mountain,
  iron: Pickaxe,
}

export const BUILDING_ICONS: Record<BuildingId, LucideIcon> = {
  farm: Wheat,
  lumberCamp: Axe,
  quarry: Mountain,
  mine: Pickaxe,
  granary: Warehouse,
  market: Store,
  workshop: Hammer,
  port: Anchor,
  barracks: Shield,
}

export { Coins, FlaskConical }
