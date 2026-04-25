'use client'

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface RarityPieProps {
  data: Array<{ rarity: string; count: number }>
}

const RARITY_COLOR: Record<string, string> = {
  common: '#6b7280',
  uncommon: '#94a3b8',
  rare: '#ca8a04',
  mythic: '#ea580c',
  special: '#8b5cf6',
  bonus: '#14b8a6',
  unknown: '#475569',
}

function rarityColor(rarity: string): string {
  return RARITY_COLOR[rarity.toLowerCase()] ?? RARITY_COLOR.unknown
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}

/**
 * Recharts-based rarity pie. Extracted into its own module so the
 * ~940KB recharts chunk can be dynamic-imported only when DeckStats
 * actually opens the Functions tab on a deck with rarity data.
 */
export default function RarityPie({ data }: RarityPieProps) {
  return (
    <div style={{ width: '100%', height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="rarity"
            cx="50%"
            cy="50%"
            outerRadius={60}
            label={false}
            labelLine={false}
          >
            {data.map((entry) => (
              <Cell key={entry.rarity} fill={rarityColor(entry.rarity)} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#1f2937',
              border: '1px solid #334155',
              borderRadius: 6,
              fontSize: 11,
            }}
            formatter={(value, name) => [
              String(value),
              capitalize(String(name)),
            ]}
          />
          <Legend
            iconSize={8}
            wrapperStyle={{ fontSize: 10 }}
            formatter={(value: string) => capitalize(value)}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
