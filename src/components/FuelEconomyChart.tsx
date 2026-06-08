import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDate, formatNum } from '../utils/format'

export interface FuelEconomyPoint {
  date: string
  economy: number | null
  pricePerLiter: number | null
}

/**
 * 燃費グラフ。Recharts に依存するため、呼び出し側で React.lazy による
 * 遅延読み込みを行い、初期バンドルから Recharts を切り離す。
 */
export default function FuelEconomyChart({ data }: { data: FuelEconomyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
        <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} stroke="#66707a" />
        <YAxis fontSize={11} stroke="#66707a" />
        <Tooltip
          formatter={(v: number) => [`${formatNum(v)} km/L`, '燃費']}
          labelFormatter={(l) => formatDate(l as string)}
        />
        <Line type="monotone" dataKey="economy" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
