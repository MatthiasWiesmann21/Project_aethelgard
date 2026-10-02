import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { useGameStore } from '../../store/useGameStore'
import { usePlayerStore } from '../../store/usePlayerStore'
import { GOODS, GOOD_IDS } from '../../data/goods'
import { TRADE_QTY } from '../../core/systems/economy'
import { GOOD_ICONS } from '../icons'
import Window from './Window'

export default function MarketWindow() {
  const market = useGameStore((s) => s.market)
  const trade = useGameStore((s) => s.trade)
  const toggleWindow = useGameStore((s) => s.toggleWindow)
  const stockpile = usePlayerStore((s) => s.stockpile)
  const gold = usePlayerStore((s) => s.gold)

  return (
    <Window
      title="World Market"
      color="#10B981"
      onClose={() => toggleWindow('market')}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="pb-2">Good</th>
            <th className="pb-2 text-right">Stock</th>
            <th className="pb-2 text-right">Price</th>
            <th className="pb-2 text-right">Trend</th>
            <th className="pb-2 text-right">Trade</th>
          </tr>
        </thead>
        <tbody>
          {GOOD_IDS.map((g) => {
            const m = market[g]
            const Icon = GOOD_ICONS[g]
            const trend = m.price - m.prevPrice
            const TrendIcon =
              trend > 0.01 ? TrendingUp : trend < -0.01 ? TrendingDown : Minus
            const trendColor =
              trend > 0.01
                ? 'text-emerald-500'
                : trend < -0.01
                  ? 'text-rose-500'
                  : 'text-slate-400'
            const buyCost = m.price * TRADE_QTY
            return (
              <tr key={g} className="border-t border-slate-100">
                <td className="py-2">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700">
                    <Icon size={15} style={{ color: GOODS[g].color }} />
                    {GOODS[g].label}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums text-slate-600">
                  {Math.floor(stockpile[g])}
                </td>
                <td className="py-2 text-right font-semibold tabular-nums text-slate-800">
                  {m.price.toFixed(2)}
                </td>
                <td className="py-2">
                  <span className="flex justify-end">
                    <TrendIcon size={15} className={trendColor} />
                  </span>
                </td>
                <td className="py-2">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      disabled={gold < buyCost}
                      onClick={() => trade(g, TRADE_QTY)}
                      title={`Buy ${TRADE_QTY} for ${buyCost.toFixed(1)} gold`}
                      className="rounded-md bg-sky-500 px-2 py-0.5 text-xs font-semibold text-white transition enabled:hover:bg-sky-600 disabled:opacity-40"
                    >
                      +{TRADE_QTY}
                    </button>
                    <button
                      type="button"
                      disabled={stockpile[g] < TRADE_QTY}
                      onClick={() => trade(g, -TRADE_QTY)}
                      title={`Sell ${TRADE_QTY} for ${buyCost.toFixed(1)} gold`}
                      className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white transition enabled:hover:bg-amber-600 disabled:opacity-40"
                    >
                      −{TRADE_QTY}
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-slate-400">
        Prices follow supply &amp; demand — large orders move the market.
      </p>
    </Window>
  )
}
