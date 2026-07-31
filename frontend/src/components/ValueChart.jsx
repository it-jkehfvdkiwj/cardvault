import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'

/**
 * Collection-value area chart.
 *
 * Kept in its own file so `React.lazy` can split Recharts (~300 kB, a third of
 * the whole bundle) out of the initial download. The chart only appears once a
 * user has two days of history, so most first visits never need that code at
 * all.
 */
export default function ValueChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E0A317" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#E0A317" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="day"
          tick={{ fill: '#6B6B63', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          tick={{ fill: '#6B6B63', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={(v) => `${v} €`}
          domain={['auto', 'auto']}
        />
        <Tooltip
          contentStyle={{
            background: '#FFFFFF',
            border: '1px solid #E4E1D9',
            borderRadius: '12px',
            fontSize: 12,
            color: '#1A1A17',
          }}
          formatter={(v) => [`${Number(v).toFixed(2).replace('.', ',')} €`, 'Sammlungswert']}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#E0A317"
          strokeWidth={2}
          fill="url(#valueFill)"
          dot={false}
          activeDot={{ r: 3 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
