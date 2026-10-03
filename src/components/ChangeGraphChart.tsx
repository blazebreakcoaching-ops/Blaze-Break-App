import { LineChart, Line, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ChangeGraphPoint, CHANGE_GRAPH_OUTCOME_LABELS } from "../../action-engine";

// Extracted purely to keep recharts (a 300kB+ chunk) out of ActionEngine's
// own bundle, mirroring RecoveryHistoryChart.tsx's lazy-load pattern - only
// fetched once there's an actual Change Graph to render.

export interface ChangeGraphChartProps {
  points: ChangeGraphPoint[];
}

export const ChangeGraphChart = ({ points }: ChangeGraphChartProps) => (
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#a8a29e" opacity={0.25} />
      <XAxis dataKey="date" tick={{ fill: '#a8a29e', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={30} />
      <YAxis tick={{ fill: '#a8a29e', fontSize: 10 }} axisLine={false} tickLine={false} domain={[-1, 1]} ticks={[-1, 0, 1]} />
      <RechartsTooltip
        contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #3a3532', borderRadius: '8px' }}
        itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 500 }}
        formatter={(_value: number, _name: string, props: { payload?: ChangeGraphPoint }) => [
          props.payload ? CHANGE_GRAPH_OUTCOME_LABELS[props.payload.outcome] : '', 'Outcome',
        ]}
      />
      <Line type="stepAfter" dataKey="value" stroke="#ea580c" strokeWidth={2} dot={{ r: 4 }} />
    </LineChart>
  </ResponsiveContainer>
);

export default ChangeGraphChart;
