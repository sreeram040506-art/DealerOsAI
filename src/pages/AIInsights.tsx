import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/context/auth-hooks";
import { apiFetch, handleApiResponse } from "@/lib/api";

type InsightsResponse = {
  summary: {
    activeInventory: number;
    soldUnits: number;
    avgDaysOnLot: number;
    revenue: number;
    profit: number;
    marginPct: number;
  };
  insights: string[];
  generatedAt: string;
};

export default function AIInsights() {
  const { token, logout } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["ai-insights"],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await apiFetch("/ai-insights", token);
      return handleApiResponse<InsightsResponse>(res, logout);
    },
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">AI Insights</h1>
          <p className="text-muted-foreground mt-1">Live dealership intelligence powered by your data.</p>
        </div>
        {isLoading || !data ? (
          <p className="text-muted-foreground">Loading insights...</p>
        ) : (
          <>
            <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="stat-card">Inventory: {data.summary.activeInventory}</div>
              <div className="stat-card">Sold Units: {data.summary.soldUnits}</div>
              <div className="stat-card">Avg Days: {data.summary.avgDaysOnLot}</div>
              <div className="stat-card">Revenue: ${data.summary.revenue.toLocaleString()}</div>
              <div className="stat-card">Profit: ${data.summary.profit.toLocaleString()}</div>
              <div className="stat-card">Margin: {data.summary.marginPct}%</div>
            </section>
            <section className="stat-card">
              <h2 className="font-semibold mb-3">Insights</h2>
              <ul className="space-y-2">
                {data.insights.map((insight) => (
                  <li key={insight} className="bg-primary/10 rounded-lg px-3 py-2">
                    {insight}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
