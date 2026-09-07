import React from "react";
import { AreaChart, Area, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";

// Extracted from HomeSection.tsx purely to move recharts (a large
// dependency - it pulls in d3 and produces a 300kB+ chunk) out of the
// HomeSection bundle. HomeSection is the first screen a user sees and was
// the single heaviest chunk in the build; by rendering this chart via
// React.lazy behind a Suspense fallback, recharts is only fetched when the
// 30-day history card actually renders, not on first paint of the home
// screen. The visual output is byte-for-byte the same as the inline
// version this replaced.

export interface RecoveryHistoryChartProps {
  data: { date: string; score: number }[];
}

export const RecoveryHistoryChart = ({ data }: RecoveryHistoryChartProps) => (
  <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
      <defs>
        <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#ea580c" stopOpacity={0.25} />
          <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#a8a29e" opacity={0.25} />
      <XAxis dataKey="date" tick={{ fill: '#a8a29e', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={30} />
      <YAxis tick={{ fill: '#a8a29e', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
      <RechartsTooltip
        contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #3a3532', borderRadius: '8px' }}
        itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 500 }}
        formatter={(value: number) => [`${value}`, 'Score']}
      />
      <Area type="monotone" dataKey="score" stroke="#ea580c" strokeWidth={2} fillOpacity={1} fill="url(#colorScore)" activeDot={{ r: 5 }} />
    </AreaChart>
  </ResponsiveContainer>
);

export default RecoveryHistoryChart;
