import { useMemo, useState } from 'react';
import { Loader2, Phone, Plus, Trash2, TrendingUp, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast-utils';
import { formatCurrency } from '@/lib/utils';
import { formatSafeDate } from '@/lib/dateUtils';
import { useCustomers } from '@/hooks/useCustomers';
import { LEAD_STATUSES, useVehicleLeads, type LeadStatus } from '@/hooks/useVehicleLeads';

const STATUS_STYLE: Record<LeadStatus, string> = {
  Interested: 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400',
  Negotiating: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400',
  Won: 'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400',
  Lost: 'bg-muted text-muted-foreground border-border',
};

const EMPTY = { customerName: '', phone: '', email: '', offerAmount: '', status: 'Interested' as LeadStatus, notes: '' };

/** Leads for one vehicle: which customers asked about it and how much they offered. */
export default function VehicleLeadsTab({ vehicleId }: { vehicleId: string }) {
  const { leads, isLoading, addLead, isAdding, updateLead, deleteLead } = useVehicleLeads(vehicleId);
  const { customers } = useCustomers();
  const [form, setForm] = useState(EMPTY);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sorted = useMemo(
    // Open leads first, highest offer first; won/lost sink to the bottom.
    () => [...leads].sort((a, b) => Number(a.status === 'Won' || a.status === 'Lost') - Number(b.status === 'Won' || b.status === 'Lost') || (b.offerAmount ?? -1) - (a.offerAmount ?? -1)),
    [leads],
  );
  const open = leads.filter((l) => l.status === 'Interested' || l.status === 'Negotiating');
  const best = leads.filter((l) => l.status !== 'Lost' && l.offerAmount != null).reduce<number | null>((m, l) => (m === null || l.offerAmount! > m ? l.offerAmount! : m), null);

  const fullName = (c: { firstName: string; lastName?: string | null }) => `${c.firstName} ${c.lastName || ''}`.trim();
  const chooseName = (value: string) => {
    // Picking an existing customer fills in their phone and email.
    const match = customers.find((c) => fullName(c).toLowerCase() === value.trim().toLowerCase());
    setForm((f) => ({ ...f, customerName: value, phone: f.phone || match?.phone || '', email: f.email || match?.email || '' }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await addLead({ vehicleId, ...form });
      setForm(EMPTY);
      toast.success('Lead added.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the lead.');
    }
  };

  const change = async (id: string, changes: { status?: LeadStatus; offerAmount?: string }) => {
    setBusyId(id);
    try { await updateLead({ id, ...changes }); } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not update the lead.'); } finally { setBusyId(null); }
  };

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-border/40 bg-secondary/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-black uppercase tracking-widest text-primary">Leads for this vehicle</h4>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden="true" /><b className="text-foreground">{open.length}</b> open</span>
          <span className="inline-flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />Best offer <b className="text-foreground tabular-nums">{best === null ? '—' : formatCurrency(best)}</b></span>
        </div>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lead-name" className="text-xs font-bold uppercase text-muted-foreground">Customer name<span className="ml-1 text-red-500">*</span></Label>
          <Input id="lead-name" list="lead-customers" value={form.customerName} onChange={(e) => chooseName(e.target.value)} placeholder="Type or pick a customer" required maxLength={120} className="border-border bg-muted" autoComplete="off" />
          <datalist id="lead-customers">{customers.slice(0, 200).map((c) => <option key={c.id} value={fullName(c)} />)}</datalist>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-amount" className="text-xs font-bold uppercase text-muted-foreground">Offer / price they asked for ($)</Label>
          <Input id="lead-amount" type="number" min={0} step="0.01" inputMode="decimal" value={form.offerAmount} onChange={(e) => setForm({ ...form, offerAmount: e.target.value })} placeholder="e.g. 8500" className="border-border bg-muted" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-phone" className="text-xs font-bold uppercase text-muted-foreground">Phone</Label>
          <Input id="lead-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40} className="border-border bg-muted" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-email" className="text-xs font-bold uppercase text-muted-foreground">Email</Label>
          <Input id="lead-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={160} className="border-border bg-muted" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="lead-notes" className="text-xs font-bold uppercase text-muted-foreground">Notes</Label>
          <Input id="lead-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. wants to come Saturday, trading in a Civic" maxLength={1000} className="border-border bg-muted" />
        </div>
        <Button type="submit" disabled={isAdding} className="h-11 font-black uppercase md:col-span-2">
          {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Add lead
        </Button>
      </form>

      <div className="space-y-3">
        <h5 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{leads.length ? `All leads (${leads.length})` : 'No leads yet'}</h5>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        <div className="custom-scrollbar max-h-[320px] space-y-3 overflow-y-auto pr-2">
          {sorted.map((lead) => (
            <div key={lead.id} className="group relative space-y-2 rounded-xl border border-border/60 bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-bold text-foreground"><Users className="h-3.5 w-3.5 text-primary" aria-hidden="true" /><span className="truncate">{lead.customerName}</span></p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
                    {lead.phone && <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 hover:text-primary"><Phone className="h-3 w-3" aria-hidden="true" />{lead.phone}</a>}
                    {lead.email && <span className="truncate">{lead.email}</span>}
                    <span>{formatSafeDate(lead.createdAt)}</span>
                  </p>
                </div>
                <p className="shrink-0 text-right text-lg font-black tabular-nums text-foreground">{lead.offerAmount == null ? <span className="text-sm font-medium text-muted-foreground">No amount</span> : formatCurrency(lead.offerAmount)}</p>
              </div>
              {lead.notes && <p className="rounded-lg bg-muted/40 p-2.5 text-xs italic text-foreground">“{lead.notes}”</p>}
              <div className="flex items-center justify-between gap-2">
                <select aria-label={`Status for ${lead.customerName}`} value={lead.status} disabled={busyId === lead.id} onChange={(e) => change(lead.id, { status: e.target.value as LeadStatus })}
                  className={`h-8 rounded-md border px-2 text-[11px] font-black uppercase tracking-wider ${STATUS_STYLE[lead.status]}`}>
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <Button type="button" variant="ghost" size="sm" aria-label={`Delete lead for ${lead.customerName}`} className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                  onClick={() => confirm(`Delete the lead for ${lead.customerName}?`) && deleteLead(lead.id).catch((e) => toast.error(e.message))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
