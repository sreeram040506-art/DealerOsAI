import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Shield, Upload, FileArchive, AlertTriangle, Clock3, ShieldAlert, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-hooks';
import { apiUrl } from '@/lib/api';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useCompliance, ComplianceRecord } from '@/hooks/useCompliance';

const statusChoices = ['PENDING', 'COMPLETED', 'ACTIVE', 'VALID', 'VERIFIED', 'SUBMITTED', 'LAPSED'];

export default function RMVCompliance() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const { records, isLoading, createRecord, updateRecord, evaluateRecord, getAudit, isSaving } = useCompliance();
  const [auditByRecord, setAuditByRecord] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    vin: '',
    vehicleCategory: '',
    dealType: '',
    insuranceStatus: 'ACTIVE',
    titleStatus: 'PENDING',
    titleTransfer: 'PENDING',
    registrationStatus: 'PENDING',
    inspectionValidity: 'PENDING',
    insuranceVerification: 'PENDING',
    taxSubmission: 'PENDING',
    temporaryPlateExpiration: '',
  });

  const handleRmvUpload = async (file?: File | null) => {
    if (!token || !file) return;
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          resolve(result.includes('base64,') ? result.split('base64,')[1] : result);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const formData = new FormData();
      formData.append('sourceFile', file);
      formData.append('documentBase64', base64);

      const response = await fetch(apiUrl('/documents/generate-used-vehicle-form'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Upload failed');

      await queryClient.invalidateQueries({ queryKey: ['registry'] });
      if (data?.info?.vin) {
        await createRecord({
          vin: data.info.vin,
          vehicleCategory: 'USED',
          dealType: 'RETAIL',
          insuranceStatus: 'ACTIVE',
          titleStatus: 'PENDING',
          titleTransfer: 'PENDING',
          registrationStatus: 'PENDING',
          inspectionValidity: 'PENDING',
          insuranceVerification: 'PENDING',
          taxSubmission: 'PENDING',
        });
      }
      toast.success(`RMV document uploaded: ${file.name}`, {
        description: data?.info?.vin ? `VIN: ${data.info.vin}` : 'VIN not extracted',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload RMV document');
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  const topSummary = useMemo(() => {
    const warnings = records.reduce((sum, row) => sum + row.complianceWarnings.length, 0);
    const deadlines = records.reduce((sum, row) => sum + row.filingDeadlines.length, 0);
    const risks = records.reduce((sum, row) => sum + row.penaltyRisks.length, 0);
    const blocks = records.reduce((sum, row) => sum + row.blockingActions.length, 0);
    return { warnings, deadlines, risks, blocks };
  }, [records]);

  const createComplianceRecord = async () => {
    if (!form.vin.trim()) {
      toast.error('VIN is required');
      return;
    }
    try {
      await createRecord(form);
      setForm((prev) => ({ ...prev, vin: '' }));
      toast.success('Compliance record created.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create record');
    }
  };

  const reloadAudit = async (record: ComplianceRecord) => {
    try {
      const logs = await getAudit(record.id);
      const latest = logs[0];
      setAuditByRecord((prev) => ({
        ...prev,
        [record.id]: latest
          ? `${latest.action_type} by ${latest.user_id} at ${new Date(latest.timestamp).toLocaleString()}`
          : 'No audit entries yet.',
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load audit');
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 page-enter">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
            <Shield className="h-8 w-8 text-primary" />
            Compliance, Insurance & Warranty
          </h1>
          <p className="mt-2 text-muted-foreground">
            Track title, registration, inspection, insurance, warranty, tax, and document compliance from one combined workflow.
          </p>
        </div>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="stat-card"><p className="text-xs text-muted-foreground">Warnings</p><p className="text-xl font-bold">{topSummary.warnings}</p></div>
          <div className="stat-card"><p className="text-xs text-muted-foreground">Deadlines</p><p className="text-xl font-bold">{topSummary.deadlines}</p></div>
          <div className="stat-card"><p className="text-xs text-muted-foreground">Penalty Risks</p><p className="text-xl font-bold">{topSummary.risks}</p></div>
          <div className="stat-card"><p className="text-xs text-muted-foreground">Blocking Actions</p><p className="text-xl font-bold">{topSummary.blocks}</p></div>
        </section>

        <section className="stat-card space-y-4">
          <h2 className="text-lg font-semibold text-foreground">RMV Document Intake</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              className="border-border"
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? 'Uploading...' : 'Upload RMV Document'}
            </Button>
            <input
              ref={uploadInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              onChange={(e) => handleRmvUpload(e.target.files?.[0])}
            />
            <Button asChild variant="secondary" className="border-border">
              <Link to="/registry">
                <FileArchive className="mr-2 h-4 w-4" />
                Open Document Registry
              </Link>
            </Button>
          </div>
        </section>

        <section className="stat-card space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Compliance Tracking</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input className="px-3 py-2 rounded-lg border bg-background" placeholder="VIN" value={form.vin} onChange={(e) => setForm((p) => ({ ...p, vin: e.target.value }))} />
            <input className="px-3 py-2 rounded-lg border bg-background" placeholder="Vehicle Category" value={form.vehicleCategory} onChange={(e) => setForm((p) => ({ ...p, vehicleCategory: e.target.value }))} />
            <input className="px-3 py-2 rounded-lg border bg-background" placeholder="Deal Type" value={form.dealType} onChange={(e) => setForm((p) => ({ ...p, dealType: e.target.value }))} />
            <select className="px-3 py-2 rounded-lg border bg-background" value={form.insuranceStatus} onChange={(e) => setForm((p) => ({ ...p, insuranceStatus: e.target.value }))}>{statusChoices.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select className="px-3 py-2 rounded-lg border bg-background" value={form.titleStatus} onChange={(e) => setForm((p) => ({ ...p, titleStatus: e.target.value }))}>{statusChoices.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select className="px-3 py-2 rounded-lg border bg-background" value={form.titleTransfer} onChange={(e) => setForm((p) => ({ ...p, titleTransfer: e.target.value }))}>{statusChoices.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select className="px-3 py-2 rounded-lg border bg-background" value={form.registrationStatus} onChange={(e) => setForm((p) => ({ ...p, registrationStatus: e.target.value }))}>{statusChoices.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select className="px-3 py-2 rounded-lg border bg-background" value={form.inspectionValidity} onChange={(e) => setForm((p) => ({ ...p, inspectionValidity: e.target.value }))}>{statusChoices.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select className="px-3 py-2 rounded-lg border bg-background" value={form.insuranceVerification} onChange={(e) => setForm((p) => ({ ...p, insuranceVerification: e.target.value }))}>{statusChoices.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select className="px-3 py-2 rounded-lg border bg-background" value={form.taxSubmission} onChange={(e) => setForm((p) => ({ ...p, taxSubmission: e.target.value }))}>{statusChoices.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <input className="px-3 py-2 rounded-lg border bg-background" type="date" value={form.temporaryPlateExpiration} onChange={(e) => setForm((p) => ({ ...p, temporaryPlateExpiration: e.target.value }))} />
          </div>
          <Button onClick={createComplianceRecord} disabled={isSaving}>Create Compliance Record</Button>
        </section>

        <section className="stat-card space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Audit & Rule Engine Output</h2>
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-semibold text-foreground mb-2">Audit Fields Stored Per Action</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-muted-foreground">
              <span>user_id</span>
              <span>timestamp</span>
              <span>action_type</span>
              <span>old_value</span>
              <span>new_value</span>
              <span>device</span>
              <span>IP</span>
            </div>
          </div>
          {isLoading ? (
            <p className="text-muted-foreground">Loading compliance records...</p>
          ) : !records.length ? (
            <p className="text-muted-foreground">No compliance records yet.</p>
          ) : (
            <div className="space-y-3">
              {records.map((row) => (
                <div key={row.id} className="rounded-xl border border-border p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-foreground">VIN: {row.vin}</div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => updateRecord({ id: row.id, registrationStatus: 'ACTIVE' })}>Mark Registration Active</Button>
                      <Button variant="outline" size="sm" onClick={() => evaluateRecord(row.id)}>Run Rule Engine</Button>
                      <Button variant="outline" size="sm" onClick={() => reloadAudit(row)}>View Audit</Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <p className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-warning" />Warnings: {row.complianceWarnings.join(' | ') || 'None'}</p>
                    <p className="flex items-center gap-2"><Clock3 className="w-4 h-4 text-primary" />Deadlines: {row.filingDeadlines.join(' | ') || 'None'}</p>
                    <p className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-destructive" />Penalty Risks: {row.penaltyRisks.join(' | ') || 'None'}</p>
                    <p className="flex items-center gap-2"><Ban className="w-4 h-4 text-destructive" />Blocking Actions: {row.blockingActions.join(' | ') || 'None'}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Audit: {auditByRecord[row.id] || 'Click "View Audit" to load latest action log.'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
