import { memo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';

interface ChartsSectionProps {
  salesHistory: any[];
  inventoryStatusData: any[];
  profitData: any[];
  COLORS: string[];
}

// Memoized — recharts is expensive to re-render and the chart data only changes
// when the dashboard summary data changes, not on every parent render
const ChartsSection = memo(function ChartsSection({ salesHistory, inventoryStatusData, profitData, COLORS }: ChartsSectionProps) {
  return (
    <>
      {/* Revenue & Profit Area Chart */}
      <div className="stat-card lg:col-span-2 overflow-hidden" role="figure" aria-label="Revenue and Profit chart">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Revenue & Profit</h3>
          <div className="flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-foreground" aria-hidden="true" />
              <span className="text-muted-foreground">Revenue</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-primary" aria-hidden="true" />
              <span className="text-muted-foreground">Profit</span>
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={salesHistory}>
            <defs>
              <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--info))" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="hsl(var(--info))" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--profit))" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="hsl(var(--profit))" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} dy={10} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
            <Tooltip
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))', 
                borderRadius: '12px', 
                fontSize: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
              }}
              itemStyle={{ fontWeight: 600 }}
            />
            <Area type="monotone" dataKey="revenue" stroke="hsl(var(--info))" fillOpacity={1} fill="url(#colorRev)" strokeWidth={3} />
            <Area type="monotone" dataKey="profit" stroke="hsl(var(--profit))" fillOpacity={1} fill="url(#colorProf)" strokeWidth={3} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Inventory Status Pie */}
      <div className="stat-card" role="figure" aria-label="Inventory status distribution">
        <h3 className="font-semibold text-foreground mb-4">Inventory Status</h3>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={inventoryStatusData} cx="50%" cy="50%" innerRadius={70} outerRadius={95} paddingAngle={6} dataKey="value" stroke="none">
              {inventoryStatusData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))', 
                borderRadius: '12px', 
                fontSize: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-6 mt-2">
          {inventoryStatusData.map((item, index) => (
            <div key={item.name} className="flex flex-col items-center">
              <span className="text-[10px] text-muted-foreground font-medium mb-0.5">{item.name}</span>
              <span className="text-lg font-semibold text-foreground tabular-nums">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Profit Bar Chart */}
      <div className="stat-card" role="figure" aria-label="Top vehicle profits">
        <h3 className="font-semibold text-foreground mb-4">Top Vehicle Profits</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={profitData} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="vehicle" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={110} />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))', 
                borderRadius: '12px', 
                fontSize: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
              }}
            />
            <Bar dataKey="profit" fill="hsl(var(--profit))" radius={[0, 4, 4, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
});

export default ChartsSection;