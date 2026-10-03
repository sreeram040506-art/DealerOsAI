import { Link } from 'react-router-dom';
import { Loader2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import QueryErrorState from '@/components/QueryErrorState';
import type { MarketingLead } from '@/hooks/useMarketing';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leads: MarketingLead[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onStatusChange: (args: { id: string; status: 'NEW' | 'CONTACTED' }) => Promise<unknown>;
  onConvert: (id: string) => Promise<{ customerId: string; existing: boolean }>;
};

export default function LeadsDialog({ open, onOpenChange, leads, loading, error, onRetry, onStatusChange, onConvert }: Props) {
  const convert = async (lead: MarketingLead) => {
    try {
      const { existing } = await onConvert(lead.id);
      toast.success(existing ? 'Linked to the existing customer with the same contact' : 'Customer created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not convert the lead');
    }
  };

  const changeStatus = async (lead: MarketingLead, status: 'NEW' | 'CONTACTED') => {
    try {
      await onStatusChange({ id: lead.id, status });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the lead');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Leads</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <QueryErrorState title="Could not load leads" description="The request failed." onRetry={onRetry} />
        ) : leads.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No leads yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Inquiries sent from a published listing's page appear here, credited to the channel whose link they used.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2">Received</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Vehicle / source</th>
                  <th className="px-3 py-2">Message</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Customer</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-border align-top last:border-0">
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(lead.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{lead.leadName || '—'}</div>
                      {lead.leadPhone && <a className="block text-xs text-primary" href={`tel:${lead.leadPhone}`}>{lead.leadPhone}</a>}
                      {lead.leadEmail && <a className="block text-xs text-primary" href={`mailto:${lead.leadEmail}`}>{lead.leadEmail}</a>}
                    </td>
                    <td className="px-3 py-3">
                      <div>{lead.listingTitle || lead.campaign || '—'}</div>
                      <div className="text-xs text-muted-foreground">{lead.source}</div>
                    </td>
                    <td className="max-w-xs px-3 py-3 text-xs text-muted-foreground whitespace-pre-wrap">{lead.message || '—'}</td>
                    <td className="px-3 py-3">
                      {lead.status === 'CONVERTED' ? (
                        <span className="text-xs font-semibold text-green-600">Converted</span>
                      ) : (
                        <Select value={lead.status} onValueChange={(v) => changeStatus(lead, v as 'NEW' | 'CONTACTED')}>
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NEW">New</SelectItem>
                            <SelectItem value="CONTACTED">Contacted</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {lead.customerId ? (
                        <Button size="sm" variant="ghost" asChild>
                          <Link to="/customers">View customer</Link>
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => convert(lead)}>
                          <UserPlus className="mr-1 h-3 w-3" /> Convert
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
