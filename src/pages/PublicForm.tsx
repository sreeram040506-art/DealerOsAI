import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiUrl } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

type Field = {
  key: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'date' | 'number' | 'radio' | 'textarea';
  required?: boolean;
  options?: string[];
  full?: boolean;
  half?: boolean;
  inline?: boolean;
  max?: number;
};
type Section = { title: string; fields: Field[] };
type FormData = {
  state: 'PENDING';
  form: { title: string; audience: 'customer' | 'mechanic'; intro: string; needsSignature: boolean; consent: string; sections: Section[] };
  recipientName?: string | null;
  terms?: Record<string, number> | null;
  dealership: { name: string; phone?: string | null; email?: string | null; address?: string | null };
  vehicle: { year: number; make: string; model: string; color?: string; vin: string; mileage?: number; stockNumber?: string | null } | null;
  expiresAt: string;
};
type Status = 'loading' | 'ready' | 'submitted' | 'closed' | 'missing' | 'error';

const TERM_LABELS: [string, string][] = [
  ['cashPrice', 'Cash price'], ['docFee', 'Documentary fee'], ['taxAndFees', 'Sales tax, title and registration'], ['addOns', 'Service contract / add-ons'], ['tradeAllowance', 'Trade-in allowance'],
];

// The page a customer or mechanic opens from a one-time link. No login: the long random
// link is the key, and it stops working once the form has been submitted.
export default function PublicForm() {
  const { token = '' } = useParams();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const [data, setData] = useState<FormData | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl(`/public/forms/${encodeURIComponent(token)}`))
      .then(async (res) => {
        if (cancelled) return;
        const body = await res.json().catch(() => ({}));
        if (res.status === 409) { setMessage(body.message || ''); return setStatus('submitted'); }
        if (res.status === 410) { setMessage(body.message || ''); return setStatus('closed'); }
        if (!res.ok) return setStatus(res.status === 404 ? 'missing' : 'error');
        setData(body);
        setValues(body.form.audience === 'mechanic' ? { inspectionDate: new Date().toISOString().slice(0, 10), odometer: body.vehicle?.mileage ? String(body.vehicle.mileage) : '' } : {});
        setStatus('ready');
        document.title = `${body.form.title} — ${body.dealership.name}`;
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => { cancelled = true; };
  }, [token]);

  const set = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => { const next = { ...e }; delete next[key]; return next; });
  };

  const total = useMemo(() => {
    const t = data?.terms;
    if (!t) return null;
    const cashDown = Number(values.cashDown) || 0;
    return (t.cashPrice || 0) + (t.docFee || 0) + (t.taxAndFees || 0) + (t.addOns || 0) - (t.tradeAllowance || 0) - cashDown;
  }, [data, values.cashDown]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data) return;
    // Quick checks so people see problems straight away; the server checks again.
    const local: Record<string, string> = {};
    for (const section of data.form.sections) for (const f of section.fields) if (f.required && !(values[f.key] || '').trim()) local[f.key] = `${f.label} is required.`;
    if (data.form.needsSignature && !signature.trim()) local.signature = 'Type your full name to sign.';
    if (!consent) local.consent = 'Please tick the box to confirm.';
    if (Object.keys(local).length) {
      setErrors(local); setFormError('Please fill in the highlighted fields.');
      requestAnimationFrame(() => formRef.current?.querySelector('[data-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    setSending(true); setFormError(''); setErrors({});
    try {
      const res = await fetch(apiUrl(`/public/forms/${encodeURIComponent(token)}`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, signature, consent }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 201) return setStatus('submitted');
      if (res.status === 409) { setMessage(body.message || ''); return setStatus('submitted'); }
      if (res.status === 410) { setMessage(body.message || ''); return setStatus('closed'); }
      if (res.status === 400 && body.errors) {
        setErrors(body.errors); setFormError(body.message || 'Please fix the highlighted fields.');
        requestAnimationFrame(() => formRef.current?.querySelector('[data-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        return;
      }
      setFormError(body.message || 'We could not send this. Please try again.');
    } catch {
      setFormError('We could not reach the server. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  );

  if (status === 'loading') return shell(<div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" /></div>);
  if (status === 'submitted') {
    return shell(
      <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-black text-foreground">Thank you!</h1>
        <p className="mt-2 text-muted-foreground">{message || 'Your form was received. The dealership will be in touch if anything else is needed. You can close this page.'}</p>
      </div>,
    );
  }
  if (status !== 'ready' || !data) {
    const text = status === 'closed' ? message || 'This link is no longer active. Please ask the dealership for a new one.'
      : status === 'missing' ? 'This link is not valid. Please check you copied the whole link.' : 'Something went wrong loading this form. Please try again.';
    return shell(<div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm"><h1 className="text-xl font-black text-foreground">Form unavailable</h1><p className="mt-2 text-muted-foreground">{text}</p></div>);
  }

  const { form, dealership, vehicle, terms } = data;
  const inputClass = (key: string) => (errors[key] ? 'border-destructive focus-visible:ring-destructive' : '');
  const fieldError = (key: string) => errors[key] && <p className="mt-1 text-xs font-medium text-destructive" role="alert">{errors[key]}</p>;

  return shell(
    <>
      <header className="mb-6">
        <p className="text-xs font-black uppercase tracking-widest text-primary">{dealership.name}</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground">{form.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{form.intro}</p>
        {data.recipientName && <p className="mt-2 text-sm text-foreground">Prepared for <span className="font-bold">{data.recipientName}</span></p>}
      </header>

      {vehicle && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-lg font-black text-foreground">{vehicle.year} {vehicle.make} {vehicle.model}</p>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">VIN {vehicle.vin}{vehicle.color ? ` · ${vehicle.color}` : ''}{vehicle.mileage ? ` · ${vehicle.mileage.toLocaleString()} mi` : ''}{vehicle.stockNumber ? ` · Stock #${vehicle.stockNumber}` : ''}</p>
        </div>
      )}

      {terms && (
        <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">Price (set by the dealership)</p>
          <dl className="space-y-1 text-sm">
            {TERM_LABELS.filter(([k]) => terms[k] !== undefined).map(([k, label]) => (
              <div key={k} className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="font-bold tabular-nums text-foreground">{k === 'tradeAllowance' ? '−' : ''}{formatCurrency(terms[k])}</dd></div>
            ))}
            {Number(values.cashDown) > 0 && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Your cash down payment</dt><dd className="font-bold tabular-nums text-foreground">−{formatCurrency(Number(values.cashDown))}</dd></div>}
            <div className="flex justify-between gap-4 border-t border-border pt-2"><dt className="font-bold text-foreground">Total due</dt><dd className="font-black tabular-nums text-foreground">{formatCurrency(total ?? 0)}</dd></div>
          </dl>
        </div>
      )}

      <form ref={formRef} onSubmit={submit} noValidate className="space-y-6">
        {form.sections.map((section) => (
          <fieldset key={section.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <legend className="px-2 text-sm font-black uppercase tracking-wider text-primary">{section.title}</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {section.fields.map((f) => {
                const id = `f-${f.key}`;
                const wide = f.full || f.type === 'textarea' || (f.type === 'radio' && !f.inline) || (f.type === 'radio' && (f.options?.length || 0) > 3);
                return (
                  <div key={f.key} className={wide ? 'sm:col-span-2' : ''} data-invalid={errors[f.key] ? 'true' : undefined}>
                    {f.type === 'radio' ? (
                      <div role="radiogroup" aria-labelledby={`${id}-l`}>
                        <p id={`${id}-l`} className="mb-2 text-sm font-medium text-foreground">{f.label}{f.required && <span className="text-destructive"> *</span>}</p>
                        <div className="flex flex-wrap gap-2">
                          {f.options!.map((opt) => (
                            <label key={opt} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${values[f.key] === opt ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground hover:bg-muted'}`}>
                              <input type="radio" name={f.key} value={opt} checked={values[f.key] === opt} onChange={() => set(f.key, opt)} className="sr-only" />
                              {opt}
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <Label htmlFor={id} className="mb-1.5 block text-sm font-medium">{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>
                        {f.type === 'textarea' ? (
                          <Textarea id={id} rows={4} maxLength={f.max} value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} className={inputClass(f.key)} />
                        ) : (
                          <Input id={id} type={f.type === 'number' ? 'number' : f.type} inputMode={f.type === 'number' ? 'decimal' : undefined} min={f.type === 'number' ? 0 : undefined} step={f.type === 'number' ? '0.01' : undefined}
                            maxLength={f.max} value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} className={inputClass(f.key)}
                            autoComplete={f.key.endsWith('Name') ? 'name' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'off'} />
                        )}
                      </>
                    )}
                    {fieldError(f.key)}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}

        <fieldset className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <legend className="px-2 text-sm font-black uppercase tracking-wider text-primary">{form.needsSignature ? 'Sign' : 'Confirm'}</legend>
          <label className="flex items-start gap-3 text-sm text-foreground" data-invalid={errors.consent ? 'true' : undefined}>
            <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setErrors((x) => { const n = { ...x }; delete n.consent; return n; }); }} className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
            <span>{form.consent}</span>
          </label>
          {fieldError('consent')}
          {form.needsSignature && (
            <div className="mt-4" data-invalid={errors.signature ? 'true' : undefined}>
              <Label htmlFor="f-signature" className="mb-1.5 block text-sm font-medium">Type your full name to sign <span className="text-destructive">*</span></Label>
              <Input id="f-signature" value={signature} maxLength={120} onChange={(e) => { setSignature(e.target.value); setErrors((x) => { const n = { ...x }; delete n.signature; return n; }); }} className={`font-serif text-lg italic ${inputClass('signature')}`} autoComplete="off" />
              {fieldError('signature')}
              <p className="mt-1 text-xs text-muted-foreground">Typing your name here is your electronic signature.</p>
            </div>
          )}
        </fieldset>

        {formError && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive" role="alert">{formError}</p>}
        <Button type="submit" disabled={sending} className="h-12 w-full text-base font-bold">
          {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : 'Submit'}
        </Button>
        <p className="flex items-center justify-center gap-2 pb-6 text-center text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Sent over a private link to {dealership.name}. The link works once and expires on {new Date(data.expiresAt).toLocaleDateString()}.</p>
      </form>
    </>,
  );
}
