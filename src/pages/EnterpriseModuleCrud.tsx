import { useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useModuleCrud } from "@/hooks/useModuleCrud";
import { useAuth } from "@/context/auth-hooks";
import { apiFetch, handleApiResponse } from "@/lib/api";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type Field = { key: string; label: string; type?: "text" | "number" | "date" };
type Config = { title: string; endpoint: string; queryKey: string; fields: Field[]; supportsDocumentUpload?: boolean };

const configs: Record<string, Config> = {
  "/auctions": {
    title: "Auctions",
    endpoint: "/auctions",
    queryKey: "auctions",
    fields: [
      { key: "auctionSource", label: "Auction Source" },
      { key: "lotNumber", label: "Lot Number" },
      { key: "laneNumber", label: "Lane Number" },
      { key: "vin", label: "VIN" },
      { key: "condition", label: "Condition" },
      { key: "estimatedValue", label: "Estimated Value", type: "number" },
      { key: "maxBid", label: "Max Bid", type: "number" },
      { key: "transportEstimate", label: "Transport", type: "number" },
      { key: "recommendedMaxBid", label: "Recommended Max Bid", type: "number" },
      { key: "bidStatus", label: "Bid Status" },
    ],
  },
  "/notifications": {
    title: "Notifications",
    endpoint: "/notifications",
    queryKey: "notifications",
    fields: [
      { key: "type", label: "Type" },
      { key: "title", label: "Title" },
      { key: "message", label: "Message" },
      { key: "severity", label: "Severity" },
      { key: "dueAt", label: "Due Date", type: "date" },
    ],
  },
  "/api-integrations": {
    title: "API Integrations",
    endpoint: "/integrations",
    queryKey: "integrations",
    fields: [
      { key: "name", label: "Name" },
      { key: "provider", label: "Provider" },
      { key: "status", label: "Status" },
      { key: "webhookUrl", label: "Webhook URL" },
      { key: "errorMessage", label: "Error Message" },
    ],
  },
};

export default function EnterpriseModuleCrud() {
  const { pathname } = useLocation();
  const config = useMemo(() => configs[pathname], [pathname]);
  const { items, isLoading, addItem, deleteItem, isSaving } = useModuleCrud(config.queryKey, config.endpoint);
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});

  const handleUpload = async (file?: File | null) => {
    if (!file || !config.supportsDocumentUpload) return;
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const response = await apiFetch(`${config.endpoint}/upload-document`, token, {
        method: "POST",
        body: fd,
      });
      const data = await handleApiResponse<Record<string, any>>(response, logout);
      await queryClient.invalidateQueries({ queryKey: [config.queryKey] });
      toast.success(`Uploaded and parsed ${file.name}`, {
        description: data?.parsedVehicle?.vin ? `VIN: ${data.parsedVehicle.vin}` : "VIN not found in file",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload document");
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">{config.title}</h1>
          <p className="text-muted-foreground mt-1">Live module connected to backend data.</p>
        </div>

        <section className="stat-card">
          <h2 className="font-semibold mb-3">Create Record</h2>
          {config.supportsDocumentUpload && (
            <div className="mb-3 flex items-center gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border bg-background text-sm font-semibold"
                onClick={() => fileRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? "Uploading..." : "Upload Document (Auto Parse VIN/Vehicle)"}
              </button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                onChange={(e) => handleUpload(e.target.files?.[0])}
              />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {config.fields.map((field) => (
              <input
                key={field.key}
                type={field.type || "text"}
                placeholder={field.label}
                className="px-3 py-2 rounded-lg border bg-background"
                value={form[field.key] ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value }))}
              />
            ))}
          </div>
          <button
            className="mt-3 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold"
            disabled={isSaving}
            onClick={async () => {
              await addItem(form);
              setForm({});
            }}
          >
            Add
          </button>
        </section>

        <section className="stat-card">
          <h2 className="font-semibold mb-3">Records</h2>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div className="text-sm text-muted-foreground break-all">
                    {config.fields.map((f) => item[f.key]).filter(Boolean).join(" | ")}
                  </div>
                  <button className="text-destructive font-semibold" onClick={() => deleteItem(item.id)}>
                    Delete
                  </button>
                </div>
              ))}
              {!items.length && <p className="text-muted-foreground">No records yet.</p>}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
