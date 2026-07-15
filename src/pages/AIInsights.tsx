import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/context/auth-hooks";
import { apiFetch, handleApiResponse } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  BadgeDollarSign,
  Bot,
  CarFront,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Sparkles,
  Send,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Upload,
  User,
  Building2,
  ReceiptText,
  Zap,
  Activity,
  Target,
  ArrowRight,
  Search,
  SlidersHorizontal,
  FolderOpen,
  ArrowUpDown,
  BookOpen,
} from "lucide-react";

type Summary = {
  activeInventory: number;
  soldUnits: number;
  purchasesCount: number;
  customerCount: number;
  documentCount: number;
  complianceRecordCount: number;
  auctionWatchCount: number;
  avgDaysOnLot: number;
  totalRevenue: number;
  totalProfit: number;
  marginPct: number;
  totalPurchasesCost: number;
  totalInventoryCost: number;
  totalRepairCost: number;
  totalBusinessExpenses: number;
  totalAdSpend: number;
  totalNotes: number;
};

type DynamicInsight = {
  category: string;
  severity: 'critical' | 'warning' | 'info' | 'success';
  icon: string;
  title: string;
  description: string;
  actionable: string;
  vehicleIds?: string[];
};

type InsightHighlights = {
  topMakes: Array<{ make: string; count: number }>;
  topSources: Array<{ source: string; count: number }>;
  oldestInventory: Array<{ vin: string; label: string; daysInInventory: number; purchaseDate: string }>;
  recentPurchases: Array<{ vehicle: string; sellerName: string; purchasePrice: number; purchaseDate: string; totalPurchaseCost: number }>;
  recentSales: Array<{ vehicle: string; customerName: string; salePrice: number; profit: number; saleDate: string }>;
  recentExpenses: Array<{ category: string; amount: number; date: string; notes?: string | null }>;
  expenseByCategory?: Array<{ category: string; amount: number }>;
  pendingCompliance?: Array<{ vin: string; titleTransfer?: string | null; registrationStatus?: string | null; inspectionValidity?: string | null; insuranceVerification?: string | null; taxSubmission?: string | null }>;
  auctionOpportunities?: Array<{ vehicle: string; marketValue: number; recommendedMaxBid: number; status: string }>;
  highestProfitSale: { vehicle: string; profit: number; salePrice: number } | null;
  lowestProfitSale: { vehicle: string; profit: number; salePrice: number } | null;
};

type InsightsResponse = {
  summary: Summary;
  highlights: InsightHighlights;
  dealership: { name: string; address?: string | null; phone?: string | null; email?: string | null };
  insights: DynamicInsight[];
  agingRecommendations: Record<string, string>;
  healthScore: number;
  generatedAt: string;
};

type AttachmentDraft = {
  id: string;
  file: File;
  previewUrl: string;
};

type AttachmentAnalysis = {
  type: "image";
  fileName: string;
  score: number;
  verdict: string;
  reason: string;
  reasonLines: string[];
  metrics?: {
    width: number;
    height: number;
    averageBrightness: number;
    contrast: number;
    sharpness: number;
    resolution: number;
  };
};

type AskResponse = {
  answer: string;
  confidence: number;
  reason: string;
  evidence: string[];
  nextSteps: string[];
  facts?: string[];
  topic?: string;
  attachments: AttachmentAnalysis[];
  summary: Summary;
  source: "openai" | "rules";
  generatedAt: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  attachments?: AttachmentDraft[];
  analysis?: AttachmentAnalysis[];
  confidence?: number;
  reason?: string;
  evidence?: string[];
  nextSteps?: string[];
  facts?: string[];
  topic?: string;
  source?: string;
};

const quickPrompts = [
  "What is our current margin and profit?",
  "Show me the oldest inventory that needs attention.",
  "What did we pay for the latest purchases?",
  "Which vehicles are the best profit performers?",
  "Review these images and tell me the score.",
];

function formatMoney(value: number) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function formatCompactDate(value?: string | null) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleDateString();
}

function buildAttachmentPayload(files: AttachmentDraft[]) {
  return Promise.all(
    files.map(
      (draft) =>
        new Promise<{ fileName: string; fileType: string; base64: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              fileName: draft.file.name,
              fileType: draft.file.type,
              base64: String(reader.result || ""),
            });
          };
          reader.onerror = () => reject(new Error(`Failed to read ${draft.file.name}`));
          reader.readAsDataURL(draft.file);
        }),
    ),
  );
}

/* ─── Health Score Ring ──────────────────────────────────────────────── */
function HealthScoreRing({ score, size = 160 }: { score: number; size?: number }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (animatedScore / 100) * circumference;

  useEffect(() => {
    let frame: number;
    const startTime = Date.now();
    const duration = 1200;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedScore(Math.round(score * eased));
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const color = animatedScore >= 75 ? '#10b981' : animatedScore >= 50 ? '#f59e0b' : '#ef4444';
  const bgColor = animatedScore >= 75 ? 'rgba(16,185,129,0.1)' : animatedScore >= 50 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';
  const label = animatedScore >= 80 ? 'Excellent' : animatedScore >= 65 ? 'Healthy' : animatedScore >= 50 ? 'Needs Attention' : 'Critical';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative group" style={{ width: size, height: size }}>
        {/* Glow effect */}
        <div 
          className="absolute inset-0 rounded-full blur-xl opacity-30 transition-all duration-500 group-hover:opacity-50"
          style={{ backgroundColor: color }}
        />
        <svg width={size} height={size} className="-rotate-90 relative z-10">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-slate-100"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth="8"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <span className="text-4xl font-black tracking-tight text-slate-950">{animatedScore}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">/ 100</span>
        </div>
      </div>
      <div className="text-center">
        <Badge
          className="px-3 py-1 text-xs font-bold transition-all hover:scale-105"
          style={{ backgroundColor: bgColor, color, borderColor: `${color}33` }}
        >
          <Activity className="mr-1.5 h-3 w-3" />
          {label}
        </Badge>
      </div>
    </div>
  );
}

/* ─── Severity styling map ──────────────────────────────────────────── */
const severityStyles: Record<string, { border: string; bg: string; badge: string; badgeBg: string; iconBg: string; indicator: string }> = {
  critical: {
    border: 'border-red-200 hover:border-red-300',
    bg: 'bg-red-50/40 hover:bg-red-50/70',
    badge: 'text-red-700 border-red-200',
    badgeBg: 'bg-red-50',
    iconBg: 'bg-red-100 text-red-600',
    indicator: 'bg-red-500',
  },
  warning: {
    border: 'border-amber-200 hover:border-amber-300',
    bg: 'bg-amber-50/20 hover:bg-amber-50/40',
    badge: 'text-amber-700 border-amber-200',
    badgeBg: 'bg-amber-50',
    iconBg: 'bg-amber-100 text-amber-600',
    indicator: 'bg-amber-500',
  },
  info: {
    border: 'border-sky-200 hover:border-sky-300',
    bg: 'bg-sky-50/20 hover:bg-sky-50/40',
    badge: 'text-sky-700 border-sky-200',
    badgeBg: 'bg-sky-50',
    iconBg: 'bg-sky-100 text-sky-600',
    indicator: 'bg-sky-500',
  },
  success: {
    border: 'border-emerald-200 hover:border-emerald-300',
    bg: 'bg-emerald-50/20 hover:bg-emerald-50/40',
    badge: 'text-emerald-700 border-emerald-200',
    badgeBg: 'bg-emerald-50',
    iconBg: 'bg-emerald-100 text-emerald-600',
    indicator: 'bg-emerald-500',
  },
};

/* ─── Insight Card ──────────────────────────────────────────────────── */
function InsightCard({ 
  insight, 
  onAskAbout, 
  forceExpand 
}: { 
  insight: DynamicInsight; 
  onAskAbout: (q: string) => void;
  forceExpand: boolean | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const style = severityStyles[insight.severity] || severityStyles.info;

  // React to parent forceExpand commands
  useEffect(() => {
    if (forceExpand !== null) {
      setExpanded(forceExpand);
    }
  }, [forceExpand]);

  return (
    <div
      className={`group rounded-2xl border ${style.border} ${style.bg} p-4 transition-all duration-200 hover:shadow-sm cursor-pointer relative overflow-hidden`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Visual severity left strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${style.indicator}`} />

      <div className="flex items-start gap-3 pl-1">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.iconBg} text-lg shadow-sm transition-transform group-hover:scale-105`}>
          {insight.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <Badge className={`${style.badgeBg} ${style.badge} border text-[9px] font-black uppercase tracking-wider px-2 py-0.5`}>
              {insight.category}
            </Badge>
            <Badge className={`${style.badgeBg} ${style.badge} border text-[9px] font-black uppercase tracking-wider px-2 py-0.5`}>
              {insight.severity}
            </Badge>
          </div>
          <h3 className="font-bold text-sm text-slate-900 leading-snug tracking-tight group-hover:text-primary transition-colors">
            {insight.title}
          </h3>

          {expanded && (
            <div className="mt-3 space-y-3 animate-in fade-in-50 slide-in-from-top-1 duration-200">
              <p className="text-xs md:text-sm text-slate-600 leading-relaxed bg-white/60 p-3 rounded-xl border border-slate-100">
                {insight.description}
              </p>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                {insight.actionable && (
                  <div className="flex items-start gap-1.5 text-xs font-semibold text-slate-800 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
                    <Target className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>Actionable: {insight.actionable}</span>
                  </div>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-xl text-xs font-bold border-slate-200 bg-white hover:bg-slate-50 shadow-sm shrink-0 self-end sm:self-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAskAbout(`Explain details and generate a game-plan for this insight: "${insight.title}"`);
                  }}
                >
                  <Sparkles className="h-3 w-3 text-sky-600 animate-pulse" />
                  Formulate Strategy
                </Button>
              </div>
            </div>
          )}
        </div>
        <button className="shrink-0 p-1 text-slate-400 hover:text-slate-600 transition-colors self-start mt-0.5">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function AIInsights() {
  const { token, logout } = useAuth();
  const [question, setQuestion] = useState("");
  const [questionError, setQuestionError] = useState("");
  const [selectedImages, setSelectedImages] = useState<AttachmentDraft[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showAllInsights, setShowAllInsights] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [forceExpand, setForceExpand] = useState<boolean | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ai-insights"],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await apiFetch("/ai-insights", token);
      return handleApiResponse<InsightsResponse>(res, logout);
    },
  });

  const questionMutation = useMutation({
    mutationFn: async (payload: { question?: string; attachments?: Array<{ fileName: string; fileType: string; base64: string }> }) => {
      const response = await apiFetch("/ai-insights/ask", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return handleApiResponse<AskResponse>(response, logout);
    },
  });

  const selectedImagesPreview = useMemo(
    () =>
      selectedImages.map((item) => ({
        id: item.id,
        name: item.file.name,
        size: item.file.size,
        type: item.file.type,
        previewUrl: item.previewUrl,
      })),
    [selectedImages],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, questionMutation.isPending]);

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const supported = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (supported.length !== files.length) {
      setAttachmentError("Only image files are supported in AI Insights.");
    } else {
      setAttachmentError("");
    }
    const drafts = supported.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setSelectedImages((prev) => [...prev, ...drafts]);
  };

  const removeImage = (id: string) => {
    setSelectedImages((prev) => prev.filter((item) => item.id !== id));
  };

  const clearComposer = () => {
    setQuestion("");
    setSelectedImages([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const sendQuestion = async (text?: string) => {
    const trimmedQuestion = String(text ?? question).trim();
    if (!trimmedQuestion && selectedImages.length === 0) {
      setQuestionError("Type a question or add at least one image.");
      return;
    }

    setQuestionError("");

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmedQuestion || "Image review request",
      attachments: [...selectedImages],
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      const attachments = selectedImages.length ? await buildAttachmentPayload(selectedImages) : [];
      const response = await questionMutation.mutateAsync({
        question: trimmedQuestion,
        attachments,
      });

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: response.answer,
        analysis: response.attachments || [],
        confidence: response.confidence,
        reason: response.reason,
        evidence: response.evidence,
        nextSteps: response.nextSteps,
        facts: response.facts,
        topic: response.topic,
        source: response.source,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      clearComposer();
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "I could not generate a response right now. Please try again in a moment.",
        },
      ]);
    }
  };

  const summary = data?.summary;
  const highlights = data?.highlights;
  const insights = data?.insights || [];
  const healthScore = data?.healthScore ?? 0;

  // Extract categories dynamically
  const categories = useMemo(() => {
    const list = new Set(insights.map(i => i.category));
    return ["All", "Critical", ...Array.from(list)];
  }, [insights]);

  // Filter and Search logic
  const filteredInsights = useMemo(() => {
    return insights.filter(insight => {
      const matchesCategory = 
        activeCategory === "All" || 
        (activeCategory === "Critical" && insight.severity === "critical") ||
        insight.category === activeCategory;
        
      const matchesSearch = 
        insight.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        insight.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        insight.category.toLowerCase().includes(searchQuery.toLowerCase());
        
      return matchesCategory && matchesSearch;
    });
  }, [insights, activeCategory, searchQuery]);

  const displayedInsights = showAllInsights ? filteredInsights : filteredInsights.slice(0, 4);
  const criticalCount = insights.filter(i => i.severity === 'critical').length;
  const warningCount = insights.filter(i => i.severity === 'warning').length;

  const handleExpandAll = () => {
    setForceExpand(true);
    // Reset toggle so individual clicks still work after bulk toggling
    setTimeout(() => setForceExpand(null), 100);
  };

  const handleCollapseAll = () => {
    setForceExpand(false);
    setTimeout(() => setForceExpand(null), 100);
  };

  return (
    <AppLayout>
      <div className="space-y-6 md:space-y-8">
        {/* ─── Hero Header ──────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.09),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.08),transparent_30%)]" />
          <div className="relative grid gap-6 p-6 md:p-8 lg:grid-cols-[1.45fr_0.95fr] items-center">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-slate-200 bg-slate-50 px-3 py-1 text-slate-700 shadow-sm">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5 text-sky-600 animate-pulse" />
                  AI Insights
                </Badge>
                <Badge className="border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 shadow-sm">
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                  Live dealership data
                </Badge>
                {data?.dealership?.name && (
                  <Badge className="border-slate-200 bg-white px-3 py-1 text-slate-700 shadow-sm">
                    <Building2 className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                    {data.dealership.name}
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">Dealership Intelligence</h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                  Live AI analysis of your inventory, sales, expenses, compliance, and aging stock.
                  Every insight is generated from your real dealership data — not templates.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium shadow-sm">Purchase intelligence</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium shadow-sm">Inventory aging</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium shadow-sm">Image scoring</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium shadow-sm">Actionable reasoning</span>
              </div>
            </div>

            {/* Health Score + Summary Stats */}
            <div className="flex flex-col items-center justify-center gap-5 bg-slate-50/50 p-6 rounded-[24px] border border-slate-100">
              {isLoading ? (
                <div className="flex h-40 w-40 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                </div>
              ) : (
                <HealthScoreRing score={healthScore} />
              )}
              <p className="text-xs text-slate-500 font-semibold text-center">Dealership Health Score</p>
              {criticalCount > 0 && (
                <Badge className="border-red-200 bg-red-50 text-red-700 gap-1.5 shadow-sm">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {criticalCount} critical alert{criticalCount > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>
        </section>

        {/* ─── Quick Stats ──────────────────────────────────────── */}
        <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            { label: "Active Inventory", value: summary?.activeInventory ?? "-", icon: CarFront },
            { label: "Purchases", value: summary?.purchasesCount ?? "-", icon: ReceiptText },
            { label: "Closed Sales", value: summary?.soldUnits ?? "-", icon: TrendingUp },
            { label: "Avg Days on Lot", value: summary?.avgDaysOnLot ?? "-", icon: Clock3 },
            { label: "Customers", value: summary?.customerCount ?? "-", icon: User },
            { label: "Documents", value: summary?.documentCount ?? "-", icon: FileText },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.label} className="border-slate-200 bg-white shadow-sm hover:shadow-md transition-all">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-slate-700 shadow-inner">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{item.label}</p>
                    <p className="text-xl font-black tracking-tight text-slate-950 mt-0.5">{item.value}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>

        {/* ─── Intelligence Briefing ────────────────────────────── */}
        <section>
          <Card className="overflow-hidden border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-50/50">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                    <Zap className="h-5 w-5 text-amber-500" />
                    Intelligence Briefing
                  </CardTitle>
                  <CardDescription className="text-slate-600">
                    {insights.length} insight{insights.length !== 1 ? 's' : ''} generated from your live data
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 self-start md:self-auto">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs font-bold rounded-xl gap-1.5"
                    onClick={handleExpandAll}
                  >
                    Expand All
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs font-bold rounded-xl gap-1.5"
                    onClick={handleCollapseAll}
                  >
                    Collapse All
                  </Button>
                  <Badge variant="secondary" className="gap-1.5 border-slate-200 bg-white text-slate-700 shadow-sm py-1">
                    <Activity className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
                    {isLoading ? "Analyzing..." : data?.generatedAt ? `Updated ${formatCompactDate(data.generatedAt)}` : "Ready"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-6 space-y-4">
              {/* Filter controls */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                  <SlidersHorizontal className="h-4 w-4 text-slate-400 shrink-0 mr-1.5" />
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setActiveCategory(category)}
                      className={`px-3 py-1 text-xs font-bold rounded-xl border transition-all shrink-0 ${activeCategory === category ? 'bg-primary text-white border-primary shadow-sm shadow-primary/25 scale-105' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search insights..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-xs rounded-xl border-slate-200 bg-white"
                  />
                </div>
              </div>

              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
                  ))}
                </div>
              ) : filteredInsights.length > 0 ? (
                <div className="space-y-3">
                  {displayedInsights.map((insight, idx) => (
                    <InsightCard 
                      key={`${insight.category}-${idx}`} 
                      insight={insight} 
                      onAskAbout={sendQuestion} 
                      forceExpand={forceExpand}
                    />
                  ))}
                  {filteredInsights.length > 4 && (
                    <Button
                      variant="ghost"
                      className="w-full gap-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-50/50 mt-2"
                      onClick={() => setShowAllInsights(!showAllInsights)}
                    >
                      {showAllInsights ? (
                        <>
                          <ChevronUp className="h-4 w-4" />
                          Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4" />
                          Show {filteredInsights.length - 4} more insight{filteredInsights.length - 4 > 1 ? 's' : ''}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center bg-slate-50/50 border border-dashed border-slate-200 rounded-[24px]">
                  <div className="rounded-2xl bg-slate-100 p-4 text-slate-400 mb-3 shadow-inner">
                    <FolderOpen className="h-8 w-8" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-700">No matching insights found</h3>
                  <p className="mt-1 text-xs text-slate-500 max-w-sm px-4">
                    Try clearing your search query or selecting a different category filter above.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ─── Financial Snapshot + Dealership Data ─────────────── */}
        <section className="grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
          {/* ── Chat ── */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader className="space-y-2 border-b border-slate-200 bg-slate-50/80">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                    <MessageSquare className="h-5 w-5 text-sky-600" />
                    Dealership AI Chat
                  </CardTitle>
                  <CardDescription className="text-slate-600">
                    Ask about purchases, pricing, profit, compliance, or upload images to score them automatically.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="gap-1.5 border-slate-200 bg-white text-slate-700 shadow-sm">
                  <Bot className="h-3.5 w-3.5 text-sky-600 animate-pulse" />
                  {questionMutation.isPending ? "Thinking..." : "Ready"}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 p-0">
              <div className="max-h-[720px] space-y-4 overflow-y-auto bg-slate-50/50 px-4 py-5 md:px-6">
                {messages.length === 0 && (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <Bot className="h-5 w-5 text-sky-600 animate-bounce" />
                      <span className="font-semibold text-slate-800">DealerOS AI Assistant</span>
                    </div>
                    <p className="leading-6">
                      I have full access to your dealership data — inventory, purchases, sales, expenses, compliance, and more.
                      Ask me anything, or click an insight above to dive deeper. You can also drop in vehicle photos for quality scoring.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {[
                        "What's our profit margin?",
                        "Which vehicles need attention?",
                        "Expense breakdown",
                      ].map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => sendQuestion(prompt)}
                          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:scale-105 active:scale-95 transition-all shadow-sm"
                        >
                          <ArrowRight className="h-3 w-3 text-sky-500 animate-pulse" />
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    {message.role === "assistant" && (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600 border border-sky-100 shadow-sm">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}
                    <div className={`max-w-[92%] rounded-3xl border px-4 py-3 shadow-sm md:max-w-[80%] ${message.role === "user" ? "border-slate-200 bg-slate-100 text-slate-900" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-center gap-2">
                        <Badge variant={message.role === "user" ? "secondary" : "secondary"} className={`mb-2 gap-1.5 ${message.role === "user" ? "border-slate-200 bg-white text-slate-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                          {message.role === "user" ? <User className="h-3.5 w-3.5 text-slate-600" /> : <Bot className="h-3.5 w-3.5 text-sky-600" />}
                          {message.role === "user" ? "You" : `AI ${message.source === "openai" ? "confident" : "rules"}`}
                        </Badge>
                        {typeof message.confidence === "number" && (
                          <Badge className="mb-2 border-emerald-200 bg-emerald-50 text-emerald-700">
                            Confidence {message.confidence}%
                          </Badge>
                        )}
                        {message.topic && (
                          <Badge className="mb-2 border-sky-200 bg-sky-50 text-sky-700 capitalize">
                            {message.topic}
                          </Badge>
                        )}
                      </div>

                      <p className={`whitespace-pre-line text-sm leading-6 ${message.role === "user" ? "text-slate-800" : "text-slate-700"}`}>
                        {message.text}
                      </p>

                      {message.attachments?.length ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {message.attachments.map((attachment) => (
                            <div key={attachment.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-inner">
                              <img src={attachment.previewUrl} alt={attachment.file.name} className="h-40 w-full object-cover" />
                              <div className="space-y-1 p-3">
                                <p className="truncate text-xs font-semibold text-slate-950">{attachment.file.name}</p>
                                <p className="text-[11px] text-slate-500">{(attachment.file.size / 1024 / 1024).toFixed(2)} MB</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {message.analysis?.length ? (
                        <div className="mt-4 space-y-3">
                          {message.analysis.map((analysis) => (
                            <div key={analysis.fileName} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-slate-950">{analysis.fileName}</p>
                                  <p className="text-xs text-slate-500">{analysis.verdict}</p>
                                </div>
                                <Badge className="border-sky-200 bg-white text-sky-700 text-sm font-black px-2 py-0.5">
                                  {analysis.score}/100
                                </Badge>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-slate-600">{analysis.reason}</p>
                              {analysis.reasonLines?.length ? (
                                <ul className="mt-3 space-y-1 text-xs text-slate-600">
                                  {analysis.reasonLines.map((line) => (
                                    <li key={line} className="flex items-start gap-2">
                                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-500" />
                                      <span>{line}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {message.reason ? (
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 border-l-4 border-l-amber-500">
                          <div className="flex items-center gap-2 text-amber-700">
                            <AlertCircle className="h-4 w-4 animate-pulse" />
                            <p className="text-[10px] font-black uppercase tracking-wider">Reasoning Explanation</p>
                          </div>
                          <p className="mt-2 text-xs md:text-sm leading-relaxed text-slate-600">{message.reason}</p>
                        </div>
                      ) : null}

                      {message.evidence?.length ? (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Evidence Records</p>
                          <ul className="mt-2 space-y-1 text-sm text-slate-700">
                            {message.evidence.map((item) => (
                              <li key={item} className="flex items-start gap-2">
                                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-600 shrink-0" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {message.facts?.length ? (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Extracted Facts</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {message.facts.map((fact) => (
                              <Badge key={fact} variant="secondary" className="whitespace-normal rounded-full border-slate-200 bg-white px-3 py-1 text-left text-xs text-slate-700 shadow-sm font-semibold">
                                {fact}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {message.nextSteps?.length ? (
                        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 border-l-4 border-l-emerald-500">
                          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Recommended Steps</p>
                          <ul className="mt-2 space-y-1 text-sm text-slate-700">
                            {message.nextSteps.map((step) => (
                              <li key={step} className="flex items-start gap-2 font-medium">
                                <CheckCircle2 className="mt-1 h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                <span>{step}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                    {message.role === "user" && (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm border border-slate-800">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))}

                {questionMutation.isPending && (
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600">
                      <Bot className="h-4 w-4 animate-spin" />
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                        <span className="text-xs md:text-sm font-medium">Reviewing dealership records and scoring images...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-slate-200 bg-white p-4 md:p-5">
                <div className="mb-3 flex flex-wrap gap-2">
                  {quickPrompts.map((prompt) => (
                    <Button
                      key={prompt}
                      variant="outline"
                      size="sm"
                      className="h-auto rounded-full border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all hover:scale-105 active:scale-95 shadow-sm"
                      type="button"
                      onClick={() => setQuestion(prompt)}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>

                <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50/70 p-3 md:p-4 shadow-inner">
                  <Textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask a dealership question or attach images for scoring..."
                    className="min-h-[116px] resize-none border-0 bg-transparent px-1 py-1 text-sm text-slate-800 shadow-none placeholder:text-slate-400 focus-visible:ring-0"
                  />

                  {selectedImagesPreview.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {selectedImagesPreview.map((image) => (
                        <div key={image.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                          <img src={image.previewUrl} alt={image.name} className="h-32 w-full object-cover" />
                          <div className="flex items-center justify-between gap-2 p-3">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-950">{image.name}</p>
                              <p className="text-[11px] text-slate-500">{(image.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" type="button" onClick={() => removeImage(image.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="gap-2 rounded-xl" type="button" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="h-4 w-4" />
                        Add images
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => addFiles(event.target.files)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        className="gap-2 rounded-xl text-slate-500 hover:text-slate-700"
                        onClick={() => {
                          setSelectedImages([]);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                      >
                        <ImageIcon className="h-4 w-4" />
                        Clear images
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      {attachmentError && <span className="text-xs font-semibold text-destructive">{attachmentError}</span>}
                      {questionError && <span className="text-xs font-semibold text-destructive">{questionError}</span>}
                      <Button
                        type="button"
                        className="gap-2 rounded-xl shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-transform"
                        onClick={() => sendQuestion()}
                        disabled={questionMutation.isPending}
                      >
                        {questionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Ask AI
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Sidebar: Snapshot + Data ── */}
          <div className="space-y-6">
            <Card className="overflow-hidden border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
              <CardHeader className="border-b border-slate-200 bg-slate-50/80">
                <CardTitle className="text-lg text-slate-950">Dealership snapshot</CardTitle>
                <CardDescription className="text-slate-600">Live numbers pulled from your dealership records.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                {isLoading || !data ? (
                  <div className="space-y-3">
                    <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                    <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                    <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 transition-all hover:bg-emerald-50">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Revenue</p>
                        <p className="mt-1 text-xl font-black text-slate-950">{formatMoney(summary?.totalRevenue ?? 0)}</p>
                      </div>
                      <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4 transition-all hover:bg-sky-50">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Profit</p>
                        <p className="mt-1 text-xl font-black text-slate-950">{formatMoney(summary?.totalProfit ?? 0)}</p>
                      </div>
                      <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 transition-all hover:bg-amber-50">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Purchases</p>
                        <p className="mt-1 text-xl font-black text-slate-950">{formatMoney(summary?.totalPurchasesCost ?? 0)}</p>
                      </div>
                      <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 transition-all hover:bg-rose-50">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Ad spend</p>
                        <p className="mt-1 text-xl font-black text-slate-950">{formatMoney(summary?.totalAdSpend ?? 0)}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Top selling brands</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {highlights?.topMakes?.length ? highlights.topMakes.map((item) => (
                          <Badge key={item.make} variant="secondary" className="gap-1.5 border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-sm hover:scale-105 transition-transform">
                            {item.make}
                            <span className="rounded-full bg-slate-100 text-slate-800 font-extrabold px-1.5 py-0.5 text-[9px]">{item.count}</span>
                          </Badge>
                        )) : <p className="text-xs text-slate-500">No sales data yet.</p>}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Purchase sources</p>
                      <div className="mt-3 space-y-2">
                        {highlights?.topSources?.length ? highlights.topSources.slice(0, 3).map((item) => (
                          <div key={item.source} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-slate-300 transition-colors">
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">{item.source}</span>
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-800 font-black">{item.count}</Badge>
                          </div>
                        )) : <p className="text-xs text-slate-500">No purchase source data yet.</p>}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Oldest stock alert</p>
                      <div className="mt-3 space-y-3">
                        {highlights?.oldestInventory?.length ? highlights.oldestInventory.slice(0, 3).map((item) => (
                          <div key={item.vin} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-slate-300 transition-colors">
                            <div>
                              <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">Purchased {formatCompactDate(item.purchaseDate)}</p>
                            </div>
                            <Badge className="whitespace-nowrap border-amber-200 bg-amber-50 text-amber-700 font-bold">{item.daysInInventory} days</Badge>
                          </div>
                        )) : <p className="text-xs text-slate-500">No active inventory to show.</p>}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Recent acquisitions</p>
                      <div className="mt-3 space-y-3">
                        {highlights?.recentPurchases?.length ? highlights.recentPurchases.slice(0, 3).map((item) => (
                          <div key={`${item.vehicle}-${item.purchaseDate}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:border-slate-300 transition-colors">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-slate-950">{item.vehicle}</p>
                                <p className="text-[10px] text-slate-500 mt-0.5">{item.sellerName}</p>
                              </div>
                              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-800 font-extrabold">{formatMoney(item.purchasePrice)}</Badge>
                            </div>
                            <p className="mt-2 text-[10px] text-slate-400 font-semibold">{formatCompactDate(item.purchaseDate)} • Acquisition cost {formatMoney(item.totalPurchaseCost)}</p>
                          </div>
                        )) : <p className="text-xs text-slate-500">No purchase records found.</p>}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
              <CardHeader className="border-b border-slate-200 bg-slate-50/80">
                <CardTitle className="text-lg text-slate-950">AI Copilot Capability</CardTitle>
                <CardDescription className="text-slate-600">The assistant operates strictly on your dealership records.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {[
                  "Complete insights on sales performance & margins",
                  "Aging stock mitigation & auction strategies",
                  "Auto-scoring photos with vehicle metrics",
                  "Direct prompt suggestions and quick action cards",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 shadow-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500 shrink-0" />
                    <span className="text-xs md:text-sm font-medium text-slate-700">{item}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
