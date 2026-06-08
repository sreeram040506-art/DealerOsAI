import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/context/auth-hooks";
import { apiFetch, handleApiResponse } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  BadgeDollarSign,
  Bot,
  CarFront,
  CheckCircle2,
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
  insights: string[];
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

export default function AIInsights() {
  const { token, logout } = useAuth();
  const [question, setQuestion] = useState("");
  const [questionError, setQuestionError] = useState("");
  const [selectedImages, setSelectedImages] = useState<AttachmentDraft[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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

  return (
    <AppLayout>
      <div className="space-y-6 md:space-y-8">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.22),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_32%)]" />
          <div className="relative grid gap-6 p-6 md:p-8 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-white/10 text-white border-white/15 px-3 py-1">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  AI Insights
                </Badge>
                <Badge className="bg-emerald-500/15 text-emerald-200 border-emerald-400/20 px-3 py-1">
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                  Live dealership data
                </Badge>
                {data?.dealership?.name && (
                  <Badge className="bg-white/10 text-white border-white/15 px-3 py-1">
                    <Building2 className="mr-1.5 h-3.5 w-3.5" />
                    {data.dealership.name}
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-black tracking-tight md:text-5xl">Ask anything about your dealership</h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-200 md:text-base">
                  Questions about purchases, inventory, sales, expenses, compliance, customer history, or uploaded images
                  are answered against live dealership records with a score and a reason.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-200/90">
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Purchase intelligence</div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Inventory aging</div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Image scoring</div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Actionable reasoning</div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Card className="border-white/10 bg-white/10 text-white shadow-none backdrop-blur">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-emerald-400/15 p-3 text-emerald-200">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Margin</p>
                      <p className="text-2xl font-black">{summary ? `${summary.marginPct.toFixed(2)}%` : "-"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-white/10 bg-white/10 text-white shadow-none backdrop-blur">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-sky-400/15 p-3 text-sky-200">
                      <BadgeDollarSign className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Profit</p>
                      <p className="text-2xl font-black">{summary ? formatMoney(summary.totalProfit) : "-"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
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
              <Card key={item.label} className="border-border/60 bg-card/90 shadow-sm backdrop-blur">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{item.label}</p>
                    <p className="text-2xl font-black tracking-tight text-foreground">{item.value}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
          <Card className="border-border/60 bg-card/95 shadow-xl">
            <CardHeader className="space-y-2 border-b border-border/60">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    Dealership AI Chat
                  </CardTitle>
                  <CardDescription>
                    Ask about purchases, pricing, profit, compliance, or upload images to score them automatically.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="gap-1.5">
                  <Bot className="h-3.5 w-3.5" />
                  {questionMutation.isPending ? "Thinking..." : data?.generatedAt ? `Updated ${formatCompactDate(data.generatedAt)}` : "Ready"}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 p-0">
              <div className="max-h-[620px] space-y-4 overflow-y-auto px-4 py-5 md:px-6">
                {messages.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
                    Start with a question or drop in vehicle photos, purchase docs, or any inspection image. I will score the
                    image and explain why.
                  </div>
                )}

                {messages.map((message) => (
                  <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    {message.role === "assistant" && (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}
                    <div className={`max-w-[92%] rounded-3xl border px-4 py-3 shadow-sm md:max-w-[80%] ${message.role === "user" ? "border-primary/20 bg-primary text-primary-foreground" : "border-border/70 bg-background"}`}>
                      <div className="flex items-center gap-2">
                        <Badge variant={message.role === "user" ? "default" : "secondary"} className="mb-2 gap-1.5">
                          {message.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                          {message.role === "user" ? "You" : `AI ${message.source === "openai" ? "confident" : "rules"}`}
                        </Badge>
                        {typeof message.confidence === "number" && (
                          <Badge className="mb-2 bg-emerald-500/15 text-emerald-700 border-emerald-500/20">
                            Confidence {message.confidence}%
                          </Badge>
                        )}
                        {message.topic && (
                          <Badge className="mb-2 bg-sky-500/15 text-sky-700 border-sky-500/20 capitalize">
                            {message.topic}
                          </Badge>
                        )}
                      </div>

                      <p className={`whitespace-pre-line text-sm leading-6 ${message.role === "user" ? "text-primary-foreground" : "text-foreground"}`}>
                        {message.text}
                      </p>

                      {message.attachments?.length ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {message.attachments.map((attachment) => (
                            <div key={attachment.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/5">
                              <img src={attachment.previewUrl} alt={attachment.file.name} className="h-40 w-full object-cover" />
                              <div className="space-y-1 p-3">
                                <p className="truncate text-xs font-semibold">{attachment.file.name}</p>
                                <p className="text-[11px] text-muted-foreground">{(attachment.file.size / 1024 / 1024).toFixed(2)} MB</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {message.analysis?.length ? (
                        <div className="mt-4 space-y-3">
                          {message.analysis.map((analysis) => (
                            <div key={analysis.fileName} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold">{analysis.fileName}</p>
                                  <p className="text-xs text-muted-foreground">{analysis.verdict}</p>
                                </div>
                                <Badge className="bg-primary/10 text-primary border-primary/20 text-sm">
                                  {analysis.score}/100
                                </Badge>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-muted-foreground">{analysis.reason}</p>
                              {analysis.reasonLines?.length ? (
                                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
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
                        <div className="mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/8 p-4">
                          <div className="flex items-center gap-2 text-amber-700">
                            <AlertCircle className="h-4 w-4" />
                            <p className="text-xs font-semibold uppercase tracking-[0.2em]">Why this answer is confident</p>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">{message.reason}</p>
                        </div>
                      ) : null}

                      {message.evidence?.length ? (
                        <div className="mt-4 rounded-2xl border border-border/70 bg-muted/20 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Evidence</p>
                          <ul className="mt-2 space-y-1 text-sm text-foreground">
                            {message.evidence.map((item) => (
                              <li key={item} className="flex items-start gap-2">
                                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {message.facts?.length ? (
                        <div className="mt-4 rounded-2xl border border-slate-500/15 bg-slate-500/8 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Facts used</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {message.facts.map((fact) => (
                              <Badge key={fact} variant="secondary" className="whitespace-normal rounded-full px-3 py-1.5 text-left text-xs">
                                {fact}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {message.nextSteps?.length ? (
                        <div className="mt-4 rounded-2xl border border-emerald-500/15 bg-emerald-500/8 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Next steps</p>
                          <ul className="mt-2 space-y-1 text-sm text-foreground">
                            {message.nextSteps.map((step) => (
                              <li key={step} className="flex items-start gap-2">
                                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                <span>{step}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                    {message.role === "user" && (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))}

                {questionMutation.isPending && (
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="rounded-3xl border border-border/70 bg-background px-4 py-3">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-sm">Reviewing dealership records and scoring images...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-border/60 bg-muted/15 p-4 md:p-5">
                <div className="mb-3 flex flex-wrap gap-2">
                  {quickPrompts.map((prompt) => (
                    <Button
                      key={prompt}
                      variant="outline"
                      size="sm"
                      className="h-auto rounded-full border-border/70 bg-background px-3 py-2 text-xs font-medium"
                      type="button"
                      onClick={() => setQuestion(prompt)}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>

                <div className="space-y-3 rounded-3xl border border-border/70 bg-background p-3 md:p-4">
                  <Textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask a dealership question or attach images for scoring..."
                    className="min-h-[116px] resize-none border-0 bg-transparent px-1 py-1 text-sm shadow-none focus-visible:ring-0"
                  />

                  {selectedImagesPreview.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {selectedImagesPreview.map((image) => (
                        <div key={image.id} className="overflow-hidden rounded-2xl border border-border/70 bg-muted/20">
                          <img src={image.previewUrl} alt={image.name} className="h-32 w-full object-cover" />
                          <div className="flex items-center justify-between gap-2 p-3">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold">{image.name}</p>
                              <p className="text-[11px] text-muted-foreground">{(image.size / 1024 / 1024).toFixed(2)} MB</p>
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
                      <Button variant="outline" size="sm" className="gap-2" type="button" onClick={() => fileInputRef.current?.click()}>
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
                        className="gap-2"
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
                      {attachmentError && <span className="text-sm text-destructive">{attachmentError}</span>}
                      {questionError && <span className="text-sm text-destructive">{questionError}</span>}
                      <Button
                        type="button"
                        className="gap-2"
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

          <div className="space-y-6">
            <Card className="border-border/60 bg-card/95 shadow-xl">
              <CardHeader className="border-b border-border/60">
                <CardTitle className="text-lg">Dealership snapshot</CardTitle>
                <CardDescription>Live numbers pulled from your dealership records.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                {isLoading || !data ? (
                  <div className="space-y-3">
                    <div className="h-16 animate-pulse rounded-2xl bg-muted/40" />
                    <div className="h-16 animate-pulse rounded-2xl bg-muted/40" />
                    <div className="h-16 animate-pulse rounded-2xl bg-muted/40" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-emerald-500/8 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Revenue</p>
                        <p className="mt-1 text-xl font-black">{formatMoney(summary?.totalRevenue ?? 0)}</p>
                      </div>
                      <div className="rounded-2xl bg-sky-500/8 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Profit</p>
                        <p className="mt-1 text-xl font-black">{formatMoney(summary?.totalProfit ?? 0)}</p>
                      </div>
                      <div className="rounded-2xl bg-amber-500/8 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Purchases</p>
                        <p className="mt-1 text-xl font-black">{formatMoney(summary?.totalPurchasesCost ?? 0)}</p>
                      </div>
                      <div className="rounded-2xl bg-rose-500/8 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Ad spend</p>
                        <p className="mt-1 text-xl font-black">{formatMoney(summary?.totalAdSpend ?? 0)}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Top makes</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {highlights?.topMakes?.length ? highlights.topMakes.map((item) => (
                          <Badge key={item.make} variant="secondary" className="gap-1.5 px-3 py-1.5">
                            {item.make}
                            <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px]">{item.count}</span>
                          </Badge>
                        )) : <p className="text-sm text-muted-foreground">No sales data yet.</p>}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Purchase sources</p>
                      <div className="mt-3 space-y-2">
                        {highlights?.topSources?.length ? highlights.topSources.slice(0, 3).map((item) => (
                          <div key={item.source} className="flex items-center justify-between gap-3 rounded-xl bg-background p-3">
                            <span className="text-sm font-medium">{item.source}</span>
                            <Badge variant="outline">{item.count}</Badge>
                          </div>
                        )) : <p className="text-sm text-muted-foreground">No purchase source data yet.</p>}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Compliance watch</p>
                      <div className="mt-3 space-y-2">
                        {highlights?.pendingCompliance?.length ? highlights.pendingCompliance.slice(0, 3).map((item) => (
                          <div key={item.vin} className="rounded-xl bg-background p-3">
                            <p className="text-sm font-semibold">{item.vin}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Title {item.titleTransfer || "UNKNOWN"} · Registration {item.registrationStatus || "UNKNOWN"} · Insurance {item.insuranceVerification || "UNKNOWN"}
                            </p>
                          </div>
                        )) : <p className="text-sm text-muted-foreground">No pending compliance flags found.</p>}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Auction opportunities</p>
                      <div className="mt-3 space-y-2">
                        {highlights?.auctionOpportunities?.length ? highlights.auctionOpportunities.slice(0, 3).map((item) => (
                          <div key={item.vehicle} className="rounded-xl bg-background p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold">{item.vehicle}</p>
                              <Badge>{formatMoney(item.recommendedMaxBid)}</Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Market value {formatMoney(item.marketValue)} · {item.status}</p>
                          </div>
                        )) : <p className="text-sm text-muted-foreground">No auction opportunities yet.</p>}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Oldest inventory</p>
                      <div className="mt-3 space-y-3">
                        {highlights?.oldestInventory?.length ? highlights.oldestInventory.slice(0, 3).map((item) => (
                          <div key={item.vin} className="flex items-start justify-between gap-3 rounded-xl bg-background p-3">
                            <div>
                              <p className="text-sm font-semibold">{item.label}</p>
                              <p className="text-xs text-muted-foreground">Purchased {formatCompactDate(item.purchaseDate)}</p>
                            </div>
                            <Badge className="whitespace-nowrap">{item.daysInInventory} days</Badge>
                          </div>
                        )) : <p className="text-sm text-muted-foreground">No active inventory to show.</p>}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Recent purchases</p>
                      <div className="mt-3 space-y-3">
                        {highlights?.recentPurchases?.length ? highlights.recentPurchases.slice(0, 3).map((item) => (
                          <div key={`${item.vehicle}-${item.purchaseDate}`} className="rounded-xl bg-background p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">{item.vehicle}</p>
                                <p className="text-xs text-muted-foreground">{item.sellerName}</p>
                              </div>
                              <Badge variant="outline">{formatMoney(item.purchasePrice)}</Badge>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">{formatCompactDate(item.purchaseDate)} - total cost {formatMoney(item.totalPurchaseCost)}</p>
                          </div>
                        )) : <p className="text-sm text-muted-foreground">No purchase records found.</p>}
                      </div>
                    </div>

                    {data.insights?.length ? (
                      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Insights</p>
                        <ul className="mt-3 space-y-2 text-sm text-foreground">
                          {data.insights.map((insight) => (
                            <li key={insight} className="flex gap-2 rounded-xl bg-background p-3">
                              <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
                              <span>{insight}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/95 shadow-xl">
              <CardHeader className="border-b border-border/60">
                <CardTitle className="text-lg">What this assistant can handle</CardTitle>
                <CardDescription>It is trained to stay close to your actual business data.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {[
                  "Dealership-wide questions about inventory, purchases, and sales",
                  "Profit and margin breakdowns with clear reasoning",
                  "Purchase source and cost summaries",
                  "Image scoring with a reason for every score",
                  "Follow-up recommendations on aging stock and deal performance",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl bg-muted/20 p-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                    <span className="text-sm text-foreground">{item}</span>
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
