import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { ChartPoint, ChartSeries } from "@/types/dashboard"

interface MainChartProps {
  data: ChartPoint[]
  series: ChartSeries[]
}

export function MainChart({
  data,
  series,
}: MainChartProps) {
  return (
    <div className="mt-5 h-[180px] rounded-2xl border border-white/5 bg-white/[0.02] p-2 md:h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            {series.map((item) => (
              <linearGradient
                key={item.gradientId}
                id={item.gradientId}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={item.stroke} stopOpacity={0.8} />
                <stop offset="95%" stopColor={item.stroke} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical />
          <XAxis
            dataKey="name"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(15,23,42,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "12px",
              color: "#fff",
            }}
          />

          {series.map((item) => (
            <Area
              key={item.key}
              type="monotone"
              dataKey={item.key}
              stroke={item.stroke}
              fill={`url(#${item.gradientId})`}
              strokeWidth={2.2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}