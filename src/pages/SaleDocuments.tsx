import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, Printer, Save } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import QueryErrorState from '@/components/QueryErrorState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, handleApiResponse } from '@/lib/api';
import { cn } from '@/lib/utils';
import { downloadDealPdf } from '@/lib/dealPdf';
import { toast } from 'sonner';

interface FieldDef { name: string; label: string; group: string; type: 'text' | 'money' | 'date' | 'textarea' | 'select'; options?: string[] }
interface FormDef { key: string; title: string; fields: string[] }
interface Config { forms: FormDef[]; fields: FieldDef[]; values: Record<string, string> }
interface Doc { key: string; title: string; html: string }

const json = { 'Content-Type': 'application/json' };

function printHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  }, 200);
}

export default function SaleDocuments() {
  const { saleId } = useParams();
  const { token, logout } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['deal-forms', saleId],
    queryFn: async () => handleApiResponse<Config>(await apiFetch(`/deal-forms/${saleId}`, token), logout),
    enabled: !!token && !!saleId,
    refetchOnWindowFocus: false,
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState('bill_of_sale');
  const [rendering, setRendering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (data && !loaded.current) { setValues(data.values); loaded.current = true; }
  }, [data]);

  // Re-render the preview shortly after the last keystroke.
  useEffect(() => {
    if (!loaded.current || !saleId) return;
    let cancelled = false;
    setRendering(true);
    const t = setTimeout(async () => {
      try {
        const res = await handleApiResponse<{ documents: Doc[] }>(
          await apiFetch(`/deal-forms/${saleId}/render`, token, { method: 'POST', headers: json, body: JSON.stringify({ values }) }), logout);
        if (!cancelled) setDocs(res.documents);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : 'Could not render forms');
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, saleId, data]);

  const current = data?.forms.find((f) => f.key === selected);
  const grouped = useMemo(() => {
    const map = new Map<string, FieldDef[]>();
    for (const f of data?.fields ?? []) {
      if (!current?.fields.includes(f.name) && !['payment_method', 'vehicle_condition', 'warranty_type'].includes(f.name)) continue;
      if (['payment_method', 'vehicle_condition', 'warranty_type'].includes(f.name)) {
        const usedBy: Record<string, string[]> = { payment_method: ['bill_of_sale'], vehicle_condition: ['purchase_contract'], warranty_type: ['purchase_contract', 'buyers_guide'] };
        if (!usedBy[f.name].includes(selected)) continue;
      }
      map.set(f.group, [...(map.get(f.group) ?? []), f]);
    }
    return [...map.entries()];
  }, [data, current, selected]);

  const save = async () => {
    setSaving(true);
    try {
      await handleApiResponse(await apiFetch(`/deal-forms/${saleId}`, token, { method: 'PUT', headers: json, body: JSON.stringify({ values }) }), logout);
      toast.success('Saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally { setSaving(false); }
  };

  const generate = async (list: Doc[], name: string) => {
    setGenerating(true);
    try {
      // Keep what was typed, then build the PDF from the same filled forms shown in the preview.
      await handleApiResponse(await apiFetch(`/deal-forms/${saleId}`, token, { method: 'PUT', headers: json, body: JSON.stringify({ values }) }), logout);
      await downloadDealPdf(list, name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate the PDF');
    } finally { setGenerating(false); }
  };

  const set = (name: string, v: string) => setValues((prev) => ({ ...prev, [name]: v }));
  const currentDoc = docs.find((d) => d.key === selected);

  return (
    <AppLayout>
      <div className="space-y-5">
        <Link to="/sales" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Sold vehicles
        </Link>
        {isError ? (
          <QueryErrorState title="Could not load the forms" description="Check your connection and try again." onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">Sale documents</h1>
                <p className="text-sm text-muted-foreground">Known details are filled in. Complete the rest, check the preview, then print or save as PDF.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save details</Button>
                <Button variant="outline" onClick={() => currentDoc && printHtml(currentDoc.html)} disabled={!currentDoc}><Printer className="w-4 h-4" /> Print this form</Button>
                <Button variant="outline" onClick={() => currentDoc && generate([currentDoc], `${currentDoc.title.replace(/\W+/g, '_')}.pdf`)} disabled={!currentDoc || generating}>
                  <Download className="w-4 h-4" /> This form PDF
                </Button>
                <Button onClick={() => generate(docs, 'Sale_Documents.pdf')} disabled={!docs.length || generating}>
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Generate all {docs.length || ''} as PDF
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {data.forms.map((f, i) => (
                <button
                  key={f.key}
                  onClick={() => setSelected(f.key)}
                  className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                    selected === f.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-muted border-border')}
                >
                  {i + 1}. {f.title}
                </button>
              ))}
            </div>

            <div className="grid lg:grid-cols-[360px_1fr] gap-5 items-start">
              <div className="rounded-2xl border border-border bg-card/60 p-3 lg:max-h-[75vh] overflow-auto">
                <Accordion type="multiple" defaultValue={grouped.map(([g]) => g)} key={selected}>
                  {grouped.map(([group, fields]) => (
                    <AccordionItem key={group} value={group}>
                      <AccordionTrigger className="text-sm">{group}</AccordionTrigger>
                      <AccordionContent className="space-y-3">
                        {fields.map((f) => (
                          <div key={f.name} className="space-y-1">
                            <Label htmlFor={`f-${f.name}`} className="text-xs">{f.label}</Label>
                            {f.type === 'select' ? (
                              <select id={`f-${f.name}`} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                                <option value="">—</option>
                                {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : f.type === 'textarea' ? (
                              <Textarea id={`f-${f.name}`} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} rows={3} />
                            ) : (
                              <Input id={`f-${f.name}`} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)}
                                inputMode={f.type === 'money' ? 'decimal' : undefined} placeholder={f.type === 'date' ? 'MM/DD/YYYY' : undefined} />
                            )}
                          </div>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>

              <div className="relative rounded-2xl border border-border bg-white overflow-hidden">
                {rendering && <Loader2 className="absolute top-3 right-3 w-4 h-4 animate-spin text-muted-foreground z-10" />}
                {currentDoc ? (
                  <iframe title={currentDoc.title} srcDoc={currentDoc.html} className="w-full h-[75vh] bg-white" />
                ) : (
                  <div className="h-[40vh] flex items-center justify-center text-sm text-muted-foreground">Preparing preview…</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
