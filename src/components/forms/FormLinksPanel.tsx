import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCopy, Download, FileText, Link2, Loader2, Mail, MessageSquare, Printer, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast-utils';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, downloadFile, handleApiResponse } from '@/lib/api';
import { useInventory } from '@/hooks/useInventory';
import { formatSafeDate } from '@/lib/dateUtils';

const LINK_FORMS = [
  { type: 'PURCHASE_CONTRACT', label: 'Purchase Contract', who: 'Customer' },
  { type: 'LOAN_APPLICATION', label: 'Loan Application', who: 'Customer' },
  { type: 'INSPECTION_REPORT', label: 'Inspection Report', who: 'Mechanic' },
] as const;

type FormRequestRow = {
  id: string; formType: string; title: string; state: 'PENDING' | 'SUBMITTED' | 'REVOKED' | 'EXPIRED';
  recipientName?: string | null; recipientEmail?: string | null; vehicleLabel?: string | null;
  expiresAt: string; submittedAt?: string | null; registryId?: string | null; path: string | null;
};

const STATE_STYLE: Record<FormRequestRow['state'], string> = {
  PENDING: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400',
  SUBMITTED: 'bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-400',
  REVOKED: 'bg-muted text-muted-foreground border-border',
  EXPIRED: 'bg-muted text-muted-foreground border-border',
};
const STATE_TEXT: Record<FormRequestRow['state'], string> = { PENDING: 'Waiting', SUBMITTED: 'Filled in', REVOKED: 'Cancelled', EXPIRED: 'Expired' };

const fullLink = (path: string) => `${window.location.origin}${path}`;

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Link copied.');
  } catch {
    window.prompt('Copy this link:', text);
  }
}

/** Send a form to a customer or mechanic by link, and generate the window sticker and hangtag. */
export default function FormLinksPanel() {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();
  const { vehicles } = useInventory();
  const [formType, setFormType] = useState<(typeof LINK_FORMS)[number]['type']>('PURCHASE_CONTRACT');
  const [vehicleId, setVehicleId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [terms, setTerms] = useState({ cashPrice: '', docFee: '', taxAndFees: '', addOns: '', tradeAllowance: '' });
  const [days, setDays] = useState('7');
  const [created, setCreated] = useState<{ link: string; formLabel: string } | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);

  const selectable = useMemo(() => [...vehicles].sort((a, b) => (a.status === 'Sold' ? 1 : 0) - (b.status === 'Sold' ? 1 : 0)), [vehicles]);
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const form = LINK_FORMS.find((f) => f.type === formType)!;

  const requests = useQuery({
    queryKey: ['form-requests'],
    queryFn: async () => handleApiResponse<FormRequestRow[]>(await apiFetch('/forms', token), logout),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  const createLink = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { formType, vehicleId, recipientName: name, recipientEmail: email, expiresInDays: Number(days) };
      if (formType === 'PURCHASE_CONTRACT') {
        body.terms = {
          cashPrice: terms.cashPrice || (vehicle?.askingPrice ?? ''), docFee: terms.docFee, taxAndFees: terms.taxAndFees, addOns: terms.addOns, tradeAllowance: terms.tradeAllowance,
        };
      }
      return handleApiResponse<{ path: string }>(await apiFetch('/forms', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), logout);
    },
    onSuccess: (result) => {
      setCreated({ link: fullLink(result.path), formLabel: form.label });
      queryClient.invalidateQueries({ queryKey: ['form-requests'] });
      toast.success('Link created.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => handleApiResponse(await apiFetch(`/forms/${id}/revoke`, token, { method: 'POST' }), logout),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['form-requests'] }); toast.success('Link cancelled.'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const generate = async (kind: 'sticker' | 'hangtag') => {
    if (!vehicleId) return toast.error('Choose a vehicle first.');
    setPrinting(kind);
    try {
      const res = await apiFetch(`/forms/generate/${kind}`, token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vehicleId }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Could not create it (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `${kind === 'sticker' ? 'Window_Sticker' : 'Hangtag'}_${(vehicle?.vin || 'vehicle').slice(-6)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      queryClient.invalidateQueries({ queryKey: ['registry'] });
      toast.success(kind === 'sticker' ? 'Window sticker created and saved to the Vehicle Database.' : 'Hangtag created and saved to the Vehicle Database.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create it.');
    } finally {
      setPrinting(null);
    }
  };

  const message = created ? `Hello${name ? ` ${name}` : ''}, please fill in your ${created.formLabel.toLowerCase()} here: ${created.link}` : '';
  const setTerm = (k: keyof typeof terms) => (e: React.ChangeEvent<HTMLInputElement>) => setTerms((t) => ({ ...t, [k]: e.target.value }));

  return (
    <section className="space-y-6 rounded-[32px] border border-border bg-white p-6 shadow-xl shadow-black/[0.03] md:p-8" aria-labelledby="form-links-title">
      <div>
        <h2 id="form-links-title" className="flex items-center gap-2 text-xl font-black tracking-tight text-foreground"><Link2 className="h-5 w-5 text-primary" aria-hidden="true" /> Send a form by link</h2>
        <p className="mt-1 text-sm text-muted-foreground">The customer or mechanic opens the link on their phone, fills it in, and the finished PDF lands in the Vehicle Database. Each link works once.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-muted-foreground">Form</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Form to send">
              {LINK_FORMS.map((f) => (
                <button key={f.type} type="button" role="radio" aria-checked={formType === f.type} onClick={() => { setFormType(f.type); setCreated(null); }}
                  className={`rounded-lg border px-3 py-2 text-left text-sm font-bold transition-colors ${formType === f.type ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}>
                  {f.label}<span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">For the {f.who.toLowerCase()}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="form-vehicle" className="mb-1.5 block text-xs font-black uppercase tracking-widest text-muted-foreground">Vehicle</Label>
            <select id="form-vehicle" value={vehicleId} onChange={(e) => { setVehicleId(e.target.value); setCreated(null); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Choose a vehicle…</option>
              {selectable.map((v) => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model} · {v.vin.slice(-6)}{v.status === 'Sold' ? ' (sold)' : ''}</option>)}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="form-name" className="mb-1.5 block text-xs font-black uppercase tracking-widest text-muted-foreground">{form.who}'s name</Label><Input id="form-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></div>
            <div><Label htmlFor="form-email" className="mb-1.5 block text-xs font-black uppercase tracking-widest text-muted-foreground">Email (optional)</Label><Input id="form-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={160} /></div>
          </div>
          <div>
            <Label htmlFor="form-days" className="mb-1.5 block text-xs font-black uppercase tracking-widest text-muted-foreground">Link works for</Label>
            <select id="form-days" value={days} onChange={(e) => setDays(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-4">
          {formType === 'PURCHASE_CONTRACT' ? (
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Price shown to the buyer</p>
              <div className="grid grid-cols-2 gap-3">
                {([['cashPrice', 'Cash price ($)'], ['docFee', 'Doc fee ($)'], ['taxAndFees', 'Tax, title, registration ($)'], ['addOns', 'Add-ons ($)'], ['tradeAllowance', 'Trade-in allowance ($)']] as const).map(([k, label]) => (
                  <div key={k}><Label htmlFor={`term-${k}`} className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</Label>
                    <Input id={`term-${k}`} type="number" min={0} step="0.01" inputMode="decimal" value={terms[k]} placeholder={k === 'cashPrice' && vehicle?.askingPrice ? String(vehicle.askingPrice) : ''} onChange={setTerm(k)} /></div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Leave cash price empty to use the vehicle's asking price. The buyer sees these amounts but cannot change them.</p>
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              {formType === 'LOAN_APPLICATION' ? 'The applicant gives only the last 4 digits of their Social Security number. Their raw answers are not kept after the PDF is made; the PDF is the record.' : 'The mechanic marks each item, adds notes and an overall result. The odometer reading starts from the vehicle record.'}
            </p>
          )}
          <Button type="button" disabled={!vehicleId || createLink.isPending} onClick={() => createLink.mutate()} className="h-11 w-full font-bold">
            {createLink.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />} Create link
          </Button>
          {created && (
            <div className="space-y-2 rounded-2xl border border-primary/30 bg-primary/5 p-4" role="status">
              <p className="text-xs font-black uppercase tracking-widest text-primary">Link ready — {created.formLabel}</p>
              <Input readOnly value={created.link} onFocus={(e) => e.currentTarget.select()} aria-label="Form link" className="font-mono text-xs" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => copy(created.link)}><ClipboardCopy className="mr-1.5 h-3.5 w-3.5" /> Copy</Button>
                <Button type="button" size="sm" variant="outline" asChild><a href={`sms:?&body=${encodeURIComponent(message)}`}><MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Text</a></Button>
                <Button type="button" size="sm" variant="outline" asChild><a href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(created.formLabel)}&body=${encodeURIComponent(message)}`}><Mail className="mr-1.5 h-3.5 w-3.5" /> Email</a></Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-foreground">Made straight from the vehicle record</p>
          <p className="text-xs text-muted-foreground">Window sticker and mirror hangtag: choose a vehicle above, then create. Saved to the Vehicle Database too.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={!vehicleId || printing !== null} onClick={() => generate('sticker')}>{printing === 'sticker' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />} Window sticker</Button>
          <Button type="button" variant="outline" disabled={!vehicleId || printing !== null} onClick={() => generate('hangtag')}>{printing === 'hangtag' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Tag className="mr-2 h-4 w-4" />} Hangtag</Button>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Sent links</h3>
        {requests.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !requests.data?.length ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No links sent yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {requests.data.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground"><FileText className="h-4 w-4 text-primary" aria-hidden="true" />{r.title}
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${STATE_STYLE[r.state]}`}>{STATE_TEXT[r.state]}</span></p>
                  <p className="truncate text-xs text-muted-foreground">{[r.vehicleLabel, r.recipientName].filter(Boolean).join(' · ') || '—'} · {r.state === 'SUBMITTED' ? `filled in ${formatSafeDate(r.submittedAt || '')}` : r.state === 'PENDING' ? `expires ${formatSafeDate(r.expiresAt)}` : `sent ${formatSafeDate(r.expiresAt)}`}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {r.path && <Button type="button" size="sm" variant="outline" onClick={() => copy(fullLink(r.path!))}><ClipboardCopy className="mr-1.5 h-3.5 w-3.5" /> Copy link</Button>}
                  {r.path && <Button type="button" size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" disabled={revoke.isPending} onClick={() => confirm('Cancel this link? It will stop working.') && revoke.mutate(r.id)}><X className="mr-1.5 h-3.5 w-3.5" /> Cancel</Button>}
                  {r.state === 'SUBMITTED' && r.registryId && <Button type="button" size="sm" onClick={() => token && downloadFile(`/forms/${r.id}/pdf`, token).catch((e) => toast.error(e.message))}><Download className="mr-1.5 h-3.5 w-3.5" /> PDF</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
