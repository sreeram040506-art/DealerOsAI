import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInventory } from '@/hooks/useInventory';
import { toast } from '@/components/ui/toast-utils';
import { useAuth } from '@/context/auth-hooks';
import DocumentUpload from './DocumentUpload';
import DocumentViewerDialog from './DocumentViewerDialog';
import { FileDown, FileCheck, CheckCircle2, Eye, Search, Loader2 } from 'lucide-react';
import { ExtractedVehicleDocumentInfo, Vehicle } from '@/types/inventory';
import { apiFetch, handleApiResponse } from '@/lib/api';

interface AddVehicleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewExisting?: (id: string, vin: string) => void;
}

const createInitialFormData = () => ({
  vin: '',
  make: '',
  model: '',
  year: '',
  mileage: '',
  color: '',
  purchaseDate: '',
  purchasedFrom: 'Auction',
  purchasePrice: '',
  paymentMethod: 'Bank Transfer',
  transportCost: '0',
  repairCost: '0',
  inspectionCost: '0',
  registrationCost: '0',
  titleNumber: '',
  sellerAddress: '',
  sellerCity: '',
  sellerState: '',
  sellerZip: '',
});

const paymentMethodOptions = ['Cash', 'Check', 'Bank Transfer'] as const;

function normalizePurchaseSource(value?: string) {
  const normalized = value?.trim().toLowerCase() || '';

  if (!normalized) {
    return 'Auction';
  }

  if (/(auction|copart|iaai|manheim|acv)/i.test(normalized)) {
    return 'Auction';
  }

  if (/(individual|private|person|owner)/i.test(normalized)) {
    return 'Individual';
  }

  return 'Dealer';
}

function normalizePaymentMethod(value?: string) {
  const match = paymentMethodOptions.find((option) => option.toLowerCase() === value?.trim().toLowerCase());
  return match || 'Bank Transfer';
}

export default function AddVehicleDialog({ open, onOpenChange, onViewExisting }: AddVehicleDialogProps) {
  const { addVehicle } = useInventory();
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [vinLookupLoading, setVinLookupLoading] = useState(false);
  // Form States
  const [formData, setFormData] = useState(createInitialFormData);
  const [pdfData, setPdfData] = useState<{ base64: string; fileName: string } | null>(null);
  const [sourceData, setSourceData] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const resetForm = () => {
    setFormData(createInitialFormData());
    setPdfData(null);
    setSourceData(null);
  };

  const handleDialogChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }

    onOpenChange(nextOpen);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleVinLookup = async () => {
    const vin = formData.vin.trim().toUpperCase();
    if (!vin || vin.length !== 17) {
      toast.error('Please enter a valid 17-character VIN first.');
      return;
    }
    setVinLookupLoading(true);
    try {
      const response = await apiFetch(`/vehicles/vin-decode/${vin}`, token);
      const data = await handleApiResponse<any>(response);
      setFormData(prev => ({
        ...prev,
        make: data.make || prev.make,
        model: data.model || prev.model,
        year: data.year ? String(data.year) : prev.year,
        color: data.color || prev.color,
      }));
      const recallCount = data.recalls?.length || 0;
      toast.success(`VIN Decoded: ${data.year} ${data.make} ${data.model}`, {
        description: recallCount > 0 ? `⚠️ ${recallCount} active recall(s) found!` : 'No active recalls found.',
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to decode VIN. Please check and try again.');
    } finally {
      setVinLookupLoading(false);
    }
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleScanComplete = (
    info: ExtractedVehicleDocumentInfo, 
    pdfInfo?: { base64: string; fileName: string },
    sourceBase64?: string
  ) => {
    setFormData(prev => ({
      ...prev,
      vin: info.vin || prev.vin,
      make: info.make || prev.make,
      model: info.model || prev.model,
      year: info.year ? String(info.year) : prev.year,
      mileage: info.mileage ? String(info.mileage) : prev.mileage,
      color: info.color || prev.color,
      purchasePrice: info.purchasePrice ? String(info.purchasePrice) : prev.purchasePrice,
      purchasedFrom: normalizePurchaseSource(info.purchasedFrom || prev.purchasedFrom),
      purchaseDate: info.purchaseDate ? info.purchaseDate.split('T')[0] : prev.purchaseDate,
      paymentMethod: normalizePaymentMethod(info.paymentMethod || prev.paymentMethod),
      // Fill additional cost fields
      transportCost: info.transportCost ? String(info.transportCost) : prev.transportCost,
      repairCost: info.repairCost ? String(info.repairCost) : prev.repairCost,
      inspectionCost: info.inspectionCost ? String(info.inspectionCost) : prev.inspectionCost,
      registrationCost: info.registrationCost ? String(info.registrationCost) : prev.registrationCost,
      titleNumber: info.titleNumber || prev.titleNumber,
      sellerAddress: info.usedVehicleSourceAddress || prev.sellerAddress,
      sellerCity: info.usedVehicleSourceCity || prev.sellerCity,
      sellerState: info.usedVehicleSourceState || prev.sellerState,
      sellerZip: info.usedVehicleSourceZipCode || prev.sellerZip,
    }));

    if (pdfInfo) {
      setPdfData(pdfInfo);
    }
    if (sourceBase64) {
      setSourceData(sourceBase64);
    }
  };

  const currentDownloadPdf = () => {
    if (!pdfData) return;
    
    const binary = window.atob(pdfData.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = pdfData.fileName;
    link.click();
    window.URL.revokeObjectURL(url);
    
    toast.success('Used Vehicle Record downloaded.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const purchasePrice = parseFloat(formData.purchasePrice);
      const transportCost = parseFloat(formData.transportCost || '0');
      const repairCost = parseFloat(formData.repairCost || '0');
      const inspectionCost = parseFloat(formData.inspectionCost || '0');
      const registrationCost = parseFloat(formData.registrationCost || '0');

      await addVehicle({
        ...formData,
        year: parseInt(formData.year),
        mileage: parseInt(formData.mileage),
        purchasePrice,
        transportCost,
        repairCost,
        inspectionCost,
        registrationCost,
        totalPurchaseCost: purchasePrice + transportCost + repairCost + inspectionCost + registrationCost,
        documentBase64: pdfData?.base64 || null,
        sourceDocumentBase64: sourceData || null,
        status: 'Available',
        sellerAddress: formData.sellerAddress,
        sellerCity: formData.sellerCity,
        sellerState: formData.sellerState,
        sellerZip: formData.sellerZip,
      } as Partial<Vehicle>);
      
      toast.success('Vehicle added successfully');
      handleDialogChange(false);
    } catch (err: any) {
      if (err.status === 409 && err.data?.existingId && onViewExisting) {
        toast.error(err.message || 'Vehicle already exists', {
          description: 'This VIN is already registered. Would you like to view it?',
          action: {
            label: 'View Vehicle',
            onClick: () => onViewExisting(err.data.existingId, formData.vin),
          }
        });
      } else {
        const message = err instanceof Error ? err.message : 'Failed to add vehicle';
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground selection:bg-primary/30">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-foreground">Add New Vehicle</DialogTitle>
          <DialogDescription className="sr-only">Add a new vehicle manually or scan a document to push into inventory.</DialogDescription>
          <p className="text-muted-foreground text-sm">Fill in the details manually or use our AI scanner.</p>
        </DialogHeader>

        {/* Document Upload / Photo Section */}
        <div className="mb-6">
          <DocumentUpload onScanComplete={handleScanComplete} onViewExisting={onViewExisting} token={token} />
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {/* Vehicle Details */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-primary uppercase tracking-wider">Vehicle Details</h3>
              {pdfData && (
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setViewerOpen(true)}
                    className="h-8 text-primary hover:text-primary-hover hover:bg-primary/10 gap-2 text-xs"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm"
                    onClick={currentDownloadPdf}
                    className="h-8 text-primary hover:text-primary-hover hover:bg-primary/10 gap-2 text-xs"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    Download
                  </Button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">VIN Number<span className="text-red-500 ml-1">*</span></Label>
                <div className="flex gap-2">
                  <Input name="vin" value={formData.vin} onChange={handleInputChange} placeholder="Enter 17-digit VIN" required className="bg-muted/50 border-border text-foreground flex-1" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={vinLookupLoading || formData.vin.trim().length < 17}
                    onClick={handleVinLookup}
                    className="shrink-0 gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary h-10"
                  >
                    {vinLookupLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    {vinLookupLoading ? 'Decoding...' : 'NHTSA Lookup'}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Make<span className="text-red-500 ml-1">*</span></Label>
                <Input name="make" value={formData.make} onChange={handleInputChange} placeholder="e.g. Honda" required className="bg-muted/50 border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Model<span className="text-red-500 ml-1">*</span></Label>
                <Input name="model" value={formData.model} onChange={handleInputChange} placeholder="e.g. Civic" required className="bg-muted/50 border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Year<span className="text-red-500 ml-1">*</span></Label>
                <Input name="year" value={formData.year} onChange={handleInputChange} type="number" placeholder="2024" required className="bg-muted/50 border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Mileage<span className="text-red-500 ml-1">*</span></Label>
                <Input name="mileage" value={formData.mileage} onChange={handleInputChange} type="number" placeholder="0" required className="bg-muted/50 border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Color<span className="text-red-500 ml-1">*</span></Label>
                <Input name="color" value={formData.color} onChange={handleInputChange} placeholder="e.g. Silver" required className="bg-muted/50 border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Title Number</Label>
                <Input name="titleNumber" value={formData.titleNumber} onChange={handleInputChange} placeholder="e.g. TITLE123456" className="bg-muted/50 border-border text-foreground" />
              </div>
            </div>
          </div>

          {/* Purchase Details */}
          <div>
            <h3 className="font-semibold text-sm text-primary uppercase tracking-wider mb-3">Purchase Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Purchase Date<span className="text-red-500 ml-1">*</span></Label>
                <Input name="purchaseDate" value={formData.purchaseDate} onChange={handleInputChange} type="date" required className="bg-muted/50 border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Purchased From</Label>
                <Select onValueChange={(v) => handleSelectChange('purchasedFrom', v)} value={formData.purchasedFrom}>
                  <SelectTrigger className="bg-muted/50 border-border text-foreground">
                    <SelectValue placeholder="Select source">{formData.purchasedFrom || 'Select source'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-muted/50 border-border text-foreground">
                    <SelectItem value="Dealer">Dealer</SelectItem>
                    <SelectItem value="Auction">Auction</SelectItem>
                    <SelectItem value="Individual">Individual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-1 md:col-span-2">
                <Label className="text-muted-foreground">Seller Address</Label>
                <Input name="sellerAddress" value={formData.sellerAddress} onChange={handleInputChange} placeholder="Street Address" className="bg-muted/50 border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">City</Label>
                <Input name="sellerCity" value={formData.sellerCity} onChange={handleInputChange} placeholder="City" className="bg-muted/50 border-border text-foreground" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">State</Label>
                  <Input name="sellerState" value={formData.sellerState} onChange={handleInputChange} placeholder="ST" maxLength={2} className="bg-muted/50 border-border text-foreground" />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Zip</Label>
                  <Input name="sellerZip" value={formData.sellerZip} onChange={handleInputChange} placeholder="Zip" className="bg-muted/50 border-border text-foreground" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Purchase Price ($)<span className="text-red-500 ml-1">*</span></Label>
                <Input name="purchasePrice" value={formData.purchasePrice} onChange={handleInputChange} type="number" placeholder="0" required className="bg-muted/50 border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Payment Method</Label>
                <Select onValueChange={(v) => handleSelectChange('paymentMethod', v)} value={formData.paymentMethod}>
                  <SelectTrigger className="bg-muted/50 border-border text-foreground">
                    <SelectValue placeholder="Select method">{formData.paymentMethod || 'Select method'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-muted/50 border-border text-foreground">
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Check">Check</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Additional Costs */}
          <div>
            <h3 className="font-semibold text-sm text-primary uppercase tracking-wider mb-3">Additional Costs</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Transport Cost ($)</Label>
                <Input name="transportCost" value={formData.transportCost} onChange={handleInputChange} type="number" placeholder="0" className="bg-muted/50 border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Repair Cost ($)</Label>
                <Input name="repairCost" value={formData.repairCost} onChange={handleInputChange} type="number" placeholder="0" className="bg-muted/50 border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Inspection Cost ($)</Label>
                <Input name="inspectionCost" value={formData.inspectionCost} onChange={handleInputChange} type="number" placeholder="0" className="bg-muted/50 border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Fees ($)</Label>
                <Input name="registrationCost" value={formData.registrationCost} onChange={handleInputChange} type="number" placeholder="0" className="bg-muted/50 border-border text-foreground" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => handleDialogChange(false)} className="border-border text-muted-foreground">Cancel</Button>
            <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary-hover text-black">
              {loading ? 'Adding...' : 'Add Vehicle'}
            </Button>
          </div>
        </form>

        <DocumentViewerDialog
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          documentBase64={pdfData?.base64 || null}
          vehicleName={`${formData.year} ${formData.make} ${formData.model}`}
          documentType="Scanned Record Preview"
        />
      </DialogContent>
    </Dialog>
  );
}
