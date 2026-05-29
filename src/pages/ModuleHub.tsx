import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import AppLayout from "@/components/AppLayout";

type ModuleDefinition = {
  title: string;
  purpose: string;
  sections: string[];
  aiFeatures: string[];
};

const modules: Record<string, ModuleDefinition> = {
  "/vehicles": {
    title: "Vehicles",
    purpose: "Centralized vehicle identity and lifecycle view tied to VIN.",
    sections: ["Basic Info", "Purchase Info", "Cost Breakdown", "Service History", "Profit Analysis"],
    aiFeatures: ["VIN intelligence", "Photo ordering recommendations", "Margin risk detection"],
  },
  "/documents-forms": {
    title: "Documents & Forms",
    purpose: "AI-first document ingestion, extraction, matching, and auto-fill workflows.",
    sections: ["Buyer Agreement", "RMV Forms", "Insurance", "Warranty", "Registration", "Signatures"],
    aiFeatures: ["Document type detection", "Field extraction with confidence", "VIN/customer match checks"],
  },
  "/rmv-compliance": {
    title: "Compliance & Coverage",
    purpose: "Combine RMV compliance, insurance coverage, and warranty tracking into a single operational workflow.",
    sections: ["Title & Registration", "Insurance Verification", "Warranty Coverage", "Deadlines & Risks"],
    aiFeatures: ["Compliance alert feed", "Coverage expiration alerts", "Warranty gap detection", "Missing document prioritization"],
  },
  "/marketing": {
    title: "Marketing",
    purpose: "Track multi-channel listing performance and source-level conversions across all marketing channels.",
    sections: ["Listing Registry", "Channel Ledger", "Analytics Ledger", "Lead Attribution", "Campaign Tracking", "Facebook Marketplace", "Instagram", "TikTok", "Craigslist", "YouTube Shorts", "Google Vehicle Listings"],
    aiFeatures: ["AI content generation (titles, descriptions, hashtags)", "Pricing recommendations", "Channel performance ranking", "Lead source attribution", "ROI analysis per channel", "Campaign anomaly detection", "Scheduling optimization", "Performance forecasting"],
  },
  "/ai-insights": {
    title: "AI Insights",
    purpose: "Dealer-level intelligence for inventory velocity, pricing, profit optimization, and natural language questions.",
    sections: ["Market Demand", "Seasonal Trends", "Fastest Sellers", "Local Pricing", "Question Assistant"],
    aiFeatures: ["Dynamic pricing suggestions", "Auction ceiling recommendations", "Vehicle-level deal summaries", "Ask inventory questions"],
  },
  "/accounting": {
    title: "Accounting",
    purpose: "Financial operations across expenses, transport, payroll, tax, and commissions.",
    sections: ["Expenses", "Payroll", "Taxes", "Commissions", "Repair Invoices", "Transport"],
    aiFeatures: ["Cost anomaly detection", "Margin leakage alerts", "Category spend trends"],
  },
  "/employees": {
    title: "Employees",
    purpose: "Performance tracking by salesperson, lead handling, and close rates.",
    sections: ["Lead Volume", "Sold Units", "Conversion Rate", "Commissions", "Performance Trends"],
    aiFeatures: ["Lead-source performance ranking", "Coaching recommendations", "Commission forecasting"],
  },
  "/auctions": {
    title: "Auctions",
    purpose: "Auction sourcing and acquisition operations for both live feeds and physical lots.",
    sections: ["Feed Import", "Auction Normalization", "Bid Strategy", "Acquisition Capture", "AI Valuation"],
    aiFeatures: ["Smart bid limits", "Demand-aware acquisition advice", "Physical auction capture", "Provider data standardization"],
  },
  "/notifications": {
    title: "Notifications",
    purpose: "Actionable alerts across compliance, finance, inventory aging, and documentation.",
    sections: ["RMV Alerts", "Insurance Expiry", "Payment Due", "Aging Inventory", "Missing Docs"],
    aiFeatures: ["Priority scoring", "Role-based routing", "Escalation recommendations"],
  },
  "/api-integrations": {
    title: "API Integrations",
    purpose: "Integration hub for DMS, finance providers, listing channels, and messaging systems.",
    sections: ["Lead Sources", "Finance", "Listing Feeds", "Communication APIs", "Webhook Monitoring"],
    aiFeatures: ["Integration health monitoring", "Sync anomaly detection", "Data mapping suggestions"],
  },
};

export default function ModuleHub() {
  const { pathname } = useLocation();

  const module = useMemo<ModuleDefinition>(
    () =>
      modules[pathname] ?? {
        title: "DealerOS AI Module",
        purpose: "Enterprise dealership operating module.",
        sections: ["Operations", "Analytics", "Compliance"],
        aiFeatures: ["Decision support", "Risk alerts", "Automation"],
      },
    [pathname],
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">{module.title}</h1>
          <p className="text-muted-foreground mt-1">{module.purpose}</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="stat-card">
            <h2 className="text-lg font-semibold mb-3">Core Sections</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {module.sections.map((item) => (
                <li key={item} className="bg-muted/40 rounded-lg px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </section>
          <section className="stat-card">
            <h2 className="text-lg font-semibold mb-3">AI Capabilities</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {module.aiFeatures.map((item) => (
                <li key={item} className="bg-primary/10 rounded-lg px-3 py-2 text-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
