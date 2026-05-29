import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/context/auth-hooks";
import { apiFetch, handleApiResponse } from "@/lib/api";
import { toast } from "sonner";

const auctionProviders = ["Manheim", "Copart", "ADESA", "IAAI", "ACV", "Other"];

type AuctionRecord = {
  id: string;
  auctionSource: string;
  sourceProvider?: string;
  sourceItemId?: string;
  lotNumber?: string;
  laneNumber?: string;
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  mileage?: number;
  condition?: string;
  seller?: string;
  auctionDate?: string;
  estimatedValue?: number;
  maxBid?: number;
  transportEstimate?: number;
  recommendedMaxBid?: number;
  bidStatus?: string;
  status?: string;
  notes?: string;
  winningBid?: number;
  createdAt: string;
};

export default function Auctions() {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();

  const [provider, setProvider] = useState("Manheim");
  const [feedJson, setFeedJson] = useState(`[
  {
    "vin": "1HGCM82633A004352",
    "odometer": 74500,
    "auctionDate": "2026-05-28",
    "lotNumber": "A1234",
    "estimatedValue": 12000,
    "maxBid": 11000
  }
]`);

  const [capture, setCapture] = useState({
    auctionSource: "Manheim",
    laneNumber: "",
    vin: "",
    condition: "",
    seller: "",
    estimatedValue: 0,
    maxBid: 0,
    transportEstimate: 0,
    notes: "",
  });

  const auctionQuery = useQuery({
    queryKey: ["auctions"],
    queryFn: async () => {
      const response = await apiFetch("/auctions", token);
      return handleApiResponse<AuctionRecord[]>(response, logout);
    },
    enabled: Boolean(token),
  });

  const importMutation = useMutation({
    mutationFn: async ({ provider, items }: { provider: string; items: any[] }) => {
      const response = await apiFetch("/auctions/import-feed", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, items }),
      });
      return handleApiResponse<{ importedCount: number; data: AuctionRecord[] }>(response, logout);
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["auctions"] });
      toast.success(`Imported ${data.importedCount} auction items`);
    },
  });

  const acquisitionMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const response = await apiFetch("/auctions", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return handleApiResponse<AuctionRecord>(response, logout);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auctions"] });
      toast.success("Auction acquisition record created");
      setCapture((prev) => ({
        ...prev,
        laneNumber: "",
        vin: "",
        condition: "",
        seller: "",
        estimatedValue: 0,
        maxBid: 0,
        transportEstimate: 0,
        notes: "",
      }));
    },
  });

  const recommendedMaxBid = useMemo(() => {
    const value = Number(capture.estimatedValue || 0);
    const transport = Number(capture.transportEstimate || 0);
    if (!value) return 0;
    return Number((Math.max(0, value * 0.84 - transport)).toFixed(0));
  }, [capture.estimatedValue, capture.transportEstimate]);

  const handleImport = async () => {
    try {
      const parsed = JSON.parse(feedJson);
      if (!Array.isArray(parsed)) {
        throw new Error("Feed input must be a JSON array");
      }
      await importMutation.mutateAsync({ provider, items: parsed });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid JSON feed");
    }
  };

  const handleCaptureSubmit = async () => {
    if (!capture.auctionSource) {
      return toast.error("Auction source is required");
    }
    await acquisitionMutation.mutateAsync({
      auctionSource: capture.auctionSource,
      laneNumber: capture.laneNumber || null,
      vin: capture.vin || null,
      condition: capture.condition || null,
      seller: capture.seller || null,
      estimatedValue: capture.estimatedValue || null,
      maxBid: capture.maxBid || null,
      transportEstimate: capture.transportEstimate || null,
      recommendedMaxBid,
      status: "WATCHLIST",
      notes: capture.notes || null,
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Auctions</h1>
          <p className="text-muted-foreground mt-1">
            Enterprise auction sourcing and acquisition pipeline.
            Import live auction feeds, normalize provider data, and capture physical auction bids in one place.
          </p>
        </div>

        <section className="stat-card grid gap-4 lg:grid-cols-3">
          {[
            { title: "Auction API", body: "Import Manheim, Copart, ADESA, IAAI feeds and normalize them automatically." },
            { title: "Normalization Engine", body: "Standardize fields like mileage, VIN, lot number, and seller across every provider." },
            { title: "AI Valuation", body: "Auto compute bid ceilings based on value, transport cost, and risk before acquisition." },
          ].map((item) => (
            <div key={item.title} className="rounded-3xl border border-muted/40 p-5 bg-background/80 shadow-sm">
              <h2 className="text-lg font-semibold">{item.title}</h2>
              <p className="text-sm text-muted-foreground mt-2">{item.body}</p>
            </div>
          ))}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <section className="stat-card">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Online Auction Feed</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Paste JSON feed data from external auction APIs. The system normalizes across providers and creates or updates records.
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">Feed Ingestion</span>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-foreground">Auction Provider</label>
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className="w-full rounded-lg border px-3 py-2 bg-background"
              >
                {auctionProviders.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>

              <label className="block text-sm font-medium text-foreground">Feed JSON</label>
              <textarea
                rows={10}
                value={feedJson}
                onChange={(event) => setFeedJson(event.target.value)}
                className="w-full rounded-xl border p-3 font-mono text-sm bg-surface"
              />

              <button
                className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                onClick={handleImport}
                disabled={importMutation.isLoading}
              >
                {importMutation.isLoading ? "Importing..." : "Import Auction Feed"}
              </button>
            </div>
          </section>

          <section className="stat-card">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Physical Auction Capture</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Capture VIN scan data, lane, condition, max bid, and buyer notes for offline auction purchases.
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">Offline</span>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-foreground">Auction Source</label>
              <select
                value={capture.auctionSource}
                onChange={(event) => setCapture((prev) => ({ ...prev, auctionSource: event.target.value }))}
                className="w-full rounded-lg border px-3 py-2 bg-background"
              >
                {auctionProviders.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Lane Number"
                  value={capture.laneNumber}
                  onChange={(event) => setCapture((prev) => ({ ...prev, laneNumber: event.target.value }))}
                  className="rounded-lg border px-3 py-2 w-full bg-background"
                />
                <input
                  type="text"
                  placeholder="VIN"
                  value={capture.vin}
                  onChange={(event) => setCapture((prev) => ({ ...prev, vin: event.target.value.toUpperCase() }))}
                  className="rounded-lg border px-3 py-2 w-full bg-background"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Condition"
                  value={capture.condition}
                  onChange={(event) => setCapture((prev) => ({ ...prev, condition: event.target.value }))}
                  className="rounded-lg border px-3 py-2 w-full bg-background"
                />
                <input
                  type="text"
                  placeholder="Seller / Consignor"
                  value={capture.seller}
                  onChange={(event) => setCapture((prev) => ({ ...prev, seller: event.target.value }))}
                  className="rounded-lg border px-3 py-2 w-full bg-background"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  type="number"
                  placeholder="Estimated Value"
                  value={capture.estimatedValue}
                  onChange={(event) => setCapture((prev) => ({ ...prev, estimatedValue: Number(event.target.value) }))}
                  className="rounded-lg border px-3 py-2 w-full bg-background"
                />
                <input
                  type="number"
                  placeholder="Max Bid"
                  value={capture.maxBid}
                  onChange={(event) => setCapture((prev) => ({ ...prev, maxBid: Number(event.target.value) }))}
                  className="rounded-lg border px-3 py-2 w-full bg-background"
                />
                <input
                  type="number"
                  placeholder="Transport Estimate"
                  value={capture.transportEstimate}
                  onChange={(event) => setCapture((prev) => ({ ...prev, transportEstimate: Number(event.target.value) }))}
                  className="rounded-lg border px-3 py-2 w-full bg-background"
                />
              </div>

              <textarea
                rows={4}
                placeholder="Buyer notes, auction lane comments, condition details"
                value={capture.notes}
                onChange={(event) => setCapture((prev) => ({ ...prev, notes: event.target.value }))}
                className="w-full rounded-xl border p-3 bg-surface"
              />

              <div className="rounded-3xl border border-muted/40 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold">AI valuation insight</p>
                <p className="mt-2">Recommended maximum bid: <span className="font-semibold">${recommendedMaxBid}</span></p>
                <p className="text-muted-foreground mt-1">This is calculated from estimated value minus transport allowances.</p>
              </div>

              <button
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                onClick={handleCaptureSubmit}
                disabled={acquisitionMutation.isLoading}
              >
                {acquisitionMutation.isLoading ? "Saving..." : "Capture Physical Auction"}
              </button>
            </div>
          </section>
        </div>

        <section className="stat-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Auction Pipeline</h2>
              <p className="text-sm text-muted-foreground mt-1">Live and captured auction records, normalized for bidding and acquisition decisions.</p>
            </div>
            <div className="text-sm text-muted-foreground">
              {auctionQuery.isLoading ? "Loading auction pipeline..." : `${auctionQuery.data?.length ?? 0} records`}
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  {[
                    "Source",
                    "Provider",
                    "Lot",
                    "Lane",
                    "VIN",
                    "Est. Value",
                    "Max Bid",
                    "Recommended",
                    "Status",
                    "Bid Status",
                    "Auction Date",
                  ].map((header) => (
                    <th key={header} className="px-3 py-3 font-semibold uppercase tracking-[.08em] text-xs text-slate-500">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auctionQuery.data?.map((item) => (
                  <tr key={item.id} className="rounded-3xl bg-white shadow-sm">
                    <td className="px-3 py-3 align-top">{item.auctionSource}</td>
                    <td className="px-3 py-3 align-top">{item.sourceProvider || "—"}</td>
                    <td className="px-3 py-3 align-top">{item.lotNumber || "—"}</td>
                    <td className="px-3 py-3 align-top">{item.laneNumber || "—"}</td>
                    <td className="px-3 py-3 align-top font-mono text-xs">{item.vin || "—"}</td>
                    <td className="px-3 py-3 align-top">{item.estimatedValue != null ? `$${item.estimatedValue}` : "—"}</td>
                    <td className="px-3 py-3 align-top">{item.maxBid != null ? `$${item.maxBid}` : "—"}</td>
                    <td className="px-3 py-3 align-top font-semibold">{item.recommendedMaxBid != null ? `$${item.recommendedMaxBid}` : "—"}</td>
                    <td className="px-3 py-3 align-top">{item.status}</td>
                    <td className="px-3 py-3 align-top">{item.bidStatus || "—"}</td>
                    <td className="px-3 py-3 align-top">{item.auctionDate ? new Date(item.auctionDate).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!auctionQuery.data?.length && !auctionQuery.isLoading && (
            <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
              No auction items found. Start by importing a feed or capturing a physical auction acquisition.
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
