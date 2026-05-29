import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
  const [question, setQuestion] = useState('');
  const [questionError, setQuestionError] = useState('');
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ai-insights"],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await apiFetch("/ai-insights", token);
      return handleApiResponse<InsightsResponse>(res, logout);
    },
  });

  const questionMutation = useMutation({
    mutationFn: async (questionText: string) => {
      const response = await apiFetch("/ai-insights/ask", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: questionText }),
      });
      return handleApiResponse<{ answer: string }>(response, logout);
    },
  });

  const askQuestion = async () => {
    if (!question.trim()) {
      setQuestionError('Please enter a question.');
      return;
    }
    setQuestionError('');
    setLastQuestion(question.trim());
    questionMutation.mutate(question.trim());
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">AI Insights & Questions</h1>
          <p className="text-muted-foreground mt-1">Live dealership intelligence powered by your data — now with natural language question support.</p>
        </div>
        <section className="stat-card space-y-4">
          <h2 className="text-lg font-semibold">Ask AI a question</h2>
          <p className="text-sm text-muted-foreground">Ask about your inventory, sales performance, margins, or best-selling vehicles.</p>
          <textarea
            className="w-full min-h-[120px] rounded-lg border border-border bg-background px-3 py-3 text-sm resize-none"
            placeholder="Type a question, for example: 'Which vehicle make is selling best?'"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {[
              'What is our average days on lot?',
              'Which make is selling best?',
              'How much profit did we make?',
            ].map((example) => (
              <button
                key={example}
                type="button"
                className="rounded-full border border-border px-3 py-1 text-sm text-foreground transition hover:bg-primary/10"
                onClick={() => setQuestion(example)}
              >
                {example}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              onClick={askQuestion}
              disabled={questionMutation.isLoading}
            >
              {questionMutation.isLoading ? 'Asking...' : 'Ask AI'}
            </button>
            {questionError && <p className="text-sm text-destructive">{questionError}</p>}
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-semibold mb-2">AI Answer</p>
            {questionMutation.isLoading ? (
              <p className="text-muted-foreground">Generating an answer...</p>
            ) : questionMutation.data?.answer ? (
              <p className="text-foreground whitespace-pre-line">{questionMutation.data.answer}</p>
            ) : lastQuestion ? (
              <p className="text-muted-foreground">No answer available yet. Try submitting your question again.</p>
            ) : (
              <p className="text-muted-foreground">Ask a question above to get contextual AI insights.</p>
            )}
          </div>
        </section>
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
