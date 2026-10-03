import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Mail, MapPin, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiUrl, assetUrl } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

type PublicListingData = {
  id: string;
  title: string;
  vehicleSpecs: string;
  vin: string;
  mileage: number;
  condition: string;
  price: number;
  description: string;
  featureBullets: string[];
  photoUrls: string[];
  dealership: { name: string; phone?: string | null; email?: string | null; address?: string | null };
};

// The page buyers land on from a marketing link. `src` (the channel the link was posted on)
// attributes the view and any inquiry to that channel.
export default function PublicListing() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const src = params.get('src') || '';

  const [listing, setListing] = useState<PublicListingData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'gone' | 'missing' | 'error'>('loading');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '', website: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl(`/public/listings/${encodeURIComponent(id)}`))
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 410) return setState('gone');
        if (!res.ok) return setState(res.status === 404 ? 'missing' : 'error');
        const data: PublicListingData = await res.json();
        setListing(data);
        setState('ready');
        document.title = `${data.vehicleSpecs} — ${data.dealership.name}`;

        // Count one view per listing per browser session.
        const key = `viewed:${id}`;
        try {
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, '1');
        } catch {
          // storage unavailable; count the view anyway
        }
        fetch(apiUrl(`/public/listings/${encodeURIComponent(id)}/view`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ src }),
        }).catch(() => {});
      })
      .catch(() => !cancelled && setState('error'));
    return () => { cancelled = true; };
  }, [id, src]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) return setFormError('Please enter your name.');
    if (!form.phone.trim() && !form.email.trim()) return setFormError('Please enter a phone number or email.');
    setSending(true);
    try {
      const res = await fetch(apiUrl(`/public/listings/${encodeURIComponent(id)}/inquiry`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, src }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Could not send your message.');
      }
      setSent(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not send your message.');
    } finally {
      setSending(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state !== 'ready' || !listing) {
    const message = {
      gone: 'This vehicle is no longer available.',
      missing: 'This listing could not be found.',
      error: 'Something went wrong loading this listing. Please try again.',
    }[state as 'gone' | 'missing' | 'error'];
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <p className="text-lg text-muted-foreground">{message}</p>
      </div>
    );
  }

  const photos = listing.photoUrls.map(assetUrl);
  const { dealership } = listing;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 py-4 font-bold">{dealership.name}</div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {photos.length > 0 && (
            <div className="space-y-2">
              <img src={photos[photoIndex]} alt={listing.vehicleSpecs} className="aspect-[4/3] w-full rounded-xl border border-border bg-muted object-contain" />
              {photos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {photos.map((p, i) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPhotoIndex(i)}
                      aria-label={`Photo ${i + 1}`}
                      className={`h-16 w-20 shrink-0 overflow-hidden rounded-md border-2 ${i === photoIndex ? 'border-primary' : 'border-transparent'}`}
                    >
                      <img src={p} alt="" className="h-full w-full bg-muted object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{listing.vehicleSpecs}</h1>
            <p className="mt-2 text-3xl font-bold text-primary">{formatCurrency(listing.price)}</p>
          </div>

          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Mileage</dt><dd className="font-semibold">{listing.mileage.toLocaleString()} mi</dd></div>
            <div><dt className="text-muted-foreground">Condition</dt><dd className="font-semibold">{listing.condition}</dd></div>
            <div className="col-span-2 sm:col-span-1"><dt className="text-muted-foreground">VIN</dt><dd className="break-all font-mono text-xs font-semibold">{listing.vin}</dd></div>
          </dl>

          <p className="whitespace-pre-line leading-relaxed">{listing.description}</p>

          {listing.featureBullets.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {listing.featureBullets.map((b) => <li key={b}>{b}</li>)}
            </ul>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-4">
            {sent ? (
              <div className="py-6 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-600" />
                <p className="font-semibold">Thanks — your message was sent.</p>
                <p className="mt-1 text-sm text-muted-foreground">{dealership.name} will get back to you soon.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3" noValidate>
                <h2 className="font-semibold">Ask about this vehicle</h2>
                <div className="space-y-1">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" rows={3} placeholder="Is it still available? When can I see it?" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
                </div>
                {/* Honeypot for bots; hidden from people and screen readers. */}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="hidden"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                />
                {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
                <Button type="submit" className="w-full" disabled={sending}>
                  {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send message
                </Button>
                <p className="text-[11px] text-muted-foreground">We'll use your details only to reply about this vehicle.</p>
              </form>
            )}
          </div>

          {(dealership.phone || dealership.email || dealership.address) && (
            <div className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
              <p className="font-semibold">{dealership.name}</p>
              {dealership.phone && <a href={`tel:${dealership.phone}`} className="flex items-center gap-2 text-primary"><Phone className="h-4 w-4" />{dealership.phone}</a>}
              {dealership.email && <a href={`mailto:${dealership.email}`} className="flex items-center gap-2 break-all text-primary"><Mail className="h-4 w-4 shrink-0" />{dealership.email}</a>}
              {dealership.address && <p className="flex items-start gap-2 text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{dealership.address}</p>}
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
