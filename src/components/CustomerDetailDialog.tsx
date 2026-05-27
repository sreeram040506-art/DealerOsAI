import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Car, Download, FileText } from 'lucide-react';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, apiUrl, handleApiResponse } from '@/lib/api';
import { toast } from '@/components/ui/toast-utils';
import { formatSafeDate } from '@/lib/dateUtils';
import DocumentViewerDialog from './DocumentViewerDialog';

interface CustomerDetailDialogProps {
  customerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CustomerDetailDialog({ customerId, open, onOpenChange }: CustomerDetailDialogProps) {
  const { token, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<any>(null);
  
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<{ base64: string; name: string; type: string } | null>(null);

  useEffect(() => {
    if (open && customerId) {
      loadCustomerDetails();
    } else {
      setCustomer(null);
    }
  }, [open, customerId]);

  const loadCustomerDetails = async () => {
    setLoading(true);
    try {
      const response = await apiFetch(`/customers/${customerId}`, token);
      const data = await handleApiResponse<any>(response, logout);
      setCustomer(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load customer details');
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = (doc: any) => {
    if (!doc.base64) {
      toast.error('Document preview not available.');
      return;
    }
    setViewerDoc({
      base64: doc.base64,
      name: doc.name || doc.type,
      type: doc.type
    });
    setViewerOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-foreground">
              Customer Profile & Sales
            </DialogTitle>
            <DialogDescription>
              View customer details, purchased vehicles, and related documents.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : customer ? (
            <div className="space-y-6">
              {/* Customer Info */}
              <div className="bg-muted/30 p-4 rounded-xl border border-border">
                <h3 className="text-lg font-bold text-foreground mb-2">
                  {customer.firstName} {customer.lastName}
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <div><span className="font-semibold text-foreground">Phone:</span> {customer.phone || 'N/A'}</div>
                  <div><span className="font-semibold text-foreground">Email:</span> {customer.email || 'N/A'}</div>
                  <div className="col-span-2"><span className="font-semibold text-foreground">Address:</span> {[customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', ') || 'N/A'}</div>
                </div>
              </div>

              {/* Sales & Vehicles */}
              <div>
                <h4 className="text-sm font-black uppercase tracking-widest text-primary mb-3">Purchased Vehicles</h4>
                {(!customer.sales || customer.sales.length === 0) ? (
                  <p className="text-muted-foreground text-sm italic">No sales found for this customer.</p>
                ) : (
                  <div className="space-y-4">
                    {customer.sales.map((sale: any) => (
                      <div key={sale.id} className="border border-border rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-foreground flex items-center gap-2">
                              <Car className="w-4 h-4 text-primary" />
                              {sale.vehicle ? `${sale.vehicle.year} ${sale.vehicle.make} ${sale.vehicle.model}` : 'Unknown Vehicle'}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">VIN: {sale.vehicle?.vin || 'N/A'}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-foreground">${(sale.salePrice || 0).toLocaleString()}</p>
                            <p className="text-[10px] uppercase text-muted-foreground">{formatSafeDate(sale.saleDate)}</p>
                          </div>
                        </div>

                        {/* Vehicle Documents */}
                        {sale.documents && sale.documents.length > 0 && (
                          <div className="pt-3 border-t border-border/50">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Related Documents</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {sale.documents.map((doc: any, i: number) => (
                                <div key={i} className="flex items-center justify-between bg-background p-2 rounded border border-border/50">
                                  <div className="min-w-0 flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                                    <div className="truncate">
                                      <p className="text-xs font-semibold text-foreground truncate">{doc.type}</p>
                                      <p className="text-[9px] text-muted-foreground truncate">{doc.name}</p>
                                    </div>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 px-2 text-[10px] uppercase font-black"
                                    onClick={() => handlePreview(doc)}
                                  >
                                    View
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground">Customer details could not be loaded.</p>
          )}
        </DialogContent>
      </Dialog>

      <DocumentViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        documentBase64={viewerDoc?.base64 || null}
        vehicleName={viewerDoc?.name || ''}
        documentType={viewerDoc?.type || ''}
      />
    </>
  );
}
