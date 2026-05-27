import { useState } from 'react';
import { formatSafeDate } from '@/lib/dateUtils';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Vehicle } from '@/types/inventory';
import { useRepairs } from '@/hooks/useRepairs';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useSales } from '@/hooks/useSales';
import { toast } from '@/components/ui/toast-utils';
import { Pencil, Receipt, Megaphone, Info, Plus, FileText, Download, ShoppingCart, Trash2, AlertTriangle, FileUp, CheckCircle2, Copy, Users, MessageSquare } from 'lucide-react';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/context/auth-hooks';
import { apiUrl } from '@/lib/api';
import { useNotes } from '@/hooks/useNotes';
import DocumentViewerDialog from './DocumentViewerDialog';

interface VehicleDetailDialogProps {
  vehicle: Vehicle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function VehicleDetailDialog({ vehicle, open, onOpenChange }: VehicleDetailDialogProps) {
  const { token } = useAuth();
  const { addRepair } = useRepairs();
  const { addAd } = useAdvertising();
  const { addSale } = useSales();
  const { deleteVehicle } = useInventory();
  const { user } = useAuth();
  const { notes, addNote, deleteNote } = useNotes(vehicle?.id);
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';
  
  const [isEditing, setIsEditing] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<{ base64: string; name: string; type: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [uploadingSale, setUploadingSale] = useState(false);
  const [saleFile, setSaleFile] = useState<File | null>(null);

  const handleView = async (docType: 'report' | 'source' | 'bill_of_sale') => {
    if (!token || !vehicle) return;
    try {
      const resp = await fetch(apiUrl(`/vehicles/${vehicle.id}/data`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error('Failed to fetch document data');
      const data = await resp.json();
      
      let targetBase64;
      let name = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
      let typeLabel = '';

      if (docType === 'source') {
        targetBase64 = data.sourceDocumentBase64;
        name += ' (Source)';
        typeLabel = 'Original Source';
      } else if (docType === 'bill_of_sale') {
        targetBase64 = data.billOfSaleBase64;
        name += ' (Bill of Sale)';
        typeLabel = 'Bill of Sale';
      } else {
        targetBase64 = data.documentBase64;
        typeLabel = 'Generated Record';
      }
      
      if (targetBase64) {
        setViewerDoc({ base64: targetBase64, name, type: typeLabel });
        setViewerOpen(true);
      } else {
        toast.error(`No ${typeLabel.toLowerCase()} available to preview.`);
      }
    } catch (e) {
      toast.error('Error loading document preview.');
    }
  };

  const handleDownload = (type: 'report' | 'source' | 'sale' = 'report') => {
    if (!token || !vehicle) return;
    let typeParam = '';
    if (type === 'source') typeParam = '&type=source';
    else if (type === 'sale') typeParam = '&type=sale';
    
    const downloadUrl = apiUrl(`/vehicles/${vehicle.id}/document?token=${encodeURIComponent(token)}${typeParam}`);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = downloadUrl;
    document.body.appendChild(iframe);
    setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe); }, 60000);
    toast.success(`Downloading ${type.replace('_', ' ')}...`);
  };

  const handleRepairPreview = (repair: any) => {
    if (!repair?.documentBase64) {
      toast.error('No repair document available to preview.');
      return;
    }
    setViewerDoc({
      base64: repair.documentBase64,
      name: repair.sourceFileName || `${vehicle.year} ${vehicle.make} ${vehicle.model} Repair`,
      type: 'Repair Document'
    });
    setViewerOpen(true);
  };

  const handleRepairDownload = (repair: any) => {
    if (!repair?.documentBase64) {
      toast.error('No repair document available to download.');
      return;
    }
    try {
      let cleanBase64 = String(repair.documentBase64);
      if (cleanBase64.includes('base64,')) cleanBase64 = cleanBase64.split('base64,')[1];
      cleanBase64 = cleanBase64.replace(/[^A-Za-z0-9+/=]/g, '');

      const byteCharacters = atob(cleanBase64);
      const byteArrays = [];
      for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) byteNumbers[i] = slice.charCodeAt(i);
        byteArrays.push(new Uint8Array(byteNumbers));
      }

      const blob = new Blob(byteArrays, { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = repair.sourceFileName || `${vehicle.vin}_repair.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast.error('Failed to download repair document.');
    }
  };

  const [editForm, setEditForm] = useState({
    make: '',
    model: '',
    year: '',
    vin: '',
    color: '',
    mileage: '',
    purchasedFrom: '',
    sellerAddress: '',
    sellerCity: '',
    sellerState: '',
    sellerZip: '',
    purchasePrice: '',
    transportCost: '',
    inspectionCost: '',
    registrationCost: '',
    titleNumber: '',
    purchaseDate: '',
    status: '',
  });

  const [repairForm, setRepairForm] = useState({
    shop: '',
    parts: '',
    labor: '',
    desc: '',
  });

  const [adForm, setAdForm] = useState({
    name: '',
    platform: 'Facebook',
    amount: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const [saleForm, setSaleForm] = useState({
    customerName: '',
    email: '',
    phone: '',
    address: '',
    salePrice: '',
    saleDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'Cash',
  });

  const [noteForm, setNoteForm] = useState({
    customerName: '',
    phone: '',
    email: '',
    note: '',
  });

  const handleDelete = async () => {
    if (!vehicle) return;
    try {
      await deleteVehicle(vehicle.id);
      toast.success('Vehicle deleted successfully');
      onOpenChange(false);
      setShowDeleteConfirm(false);
    } catch (err) {
      toast.error('Failed to delete vehicle');
      console.error(err);
    }
  };

  if (!vehicle) return null;

  const startEditing = () => {
    setEditForm({
      make: vehicle.make || '',
      model: vehicle.model || '',
      year: String(vehicle.year || ''),
      vin: vehicle.vin || '',
      color: vehicle.color || '',
      mileage: String(vehicle.mileage || ''),
      purchasedFrom: vehicle.purchase?.sellerName || '',
      sellerAddress: vehicle.purchase?.sellerAddress || '',
      sellerCity: vehicle.purchase?.sellerCity || '',
      sellerState: vehicle.purchase?.sellerState || '',
      sellerZip: vehicle.purchase?.sellerZip || '',
      purchasePrice: String(vehicle.purchase?.purchasePrice || ''),
      transportCost: String(vehicle.purchase?.transportCost || ''),
      inspectionCost: String(vehicle.purchase?.inspectionCost || ''),
      registrationCost: String(vehicle.purchase?.registrationCost || ''),
      titleNumber: vehicle.titleNumber || '',
      purchaseDate: vehicle.purchaseDate ? new Date(vehicle.purchaseDate).toISOString().split('T')[0] : '',
      status: vehicle.status || 'Available',
    });
    setIsEditing(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(apiUrl(`/vehicles/${vehicle.id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...editForm,
          year: parseInt(editForm.year),
          mileage: parseInt(editForm.mileage),
          purchasePrice: parseFloat(editForm.purchasePrice) || 0,
          transportCost: parseFloat(editForm.transportCost) || 0,
          inspectionCost: parseFloat(editForm.inspectionCost) || 0,
          registrationCost: parseFloat(editForm.registrationCost) || 0,
          titleNumber: editForm.titleNumber || undefined,
          status: editForm.status,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to update vehicle');
      }

      toast.success('Vehicle updated and PDF regenerated');
      setIsEditing(false);
      // We should ideally trigger a refresh of the vehicle list here.
      // For now, we'll suggest the user to refresh or rely on the parent component.
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      toast.error(err.message || 'Update failed');
    }
  };

  const handleRepairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addRepair({
        vehicleId: vehicle.id,
        repairShop: repairForm.shop,
        partsCost: parseFloat(repairForm.parts),
        laborCost: parseFloat(repairForm.labor),
        description: repairForm.desc,
      });
      toast.success('Repair cost added to vehicle inventory');
      setRepairForm({ shop: '', parts: '', labor: '', desc: '' });
    } catch (err) {
      toast.error('Failed to add repair cost');
    }
  };

  const handleAdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addAd({
        campaignName: adForm.name,
        platform: adForm.platform,
        amountSpent: parseFloat(adForm.amount),
        startDate: adForm.startDate,
        endDate: adForm.endDate,
        linkedVehicleId: vehicle.id,
      });
      toast.success('Advertising campaign linked to vehicle');
      setAdForm({ ...adForm, name: '', amount: '' });
    } catch (err) {
      toast.error('Failed to link advertising campaign');
    }
  };

  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadingSale(true);
    try {
      const formData = new FormData();
      formData.append('vehicleId', vehicle.id);
      formData.append('customerName', saleForm.customerName);
      formData.append('email', saleForm.email);
      formData.append('phone', saleForm.phone);
      formData.append('address', saleForm.address);
      formData.append('saleDate', saleForm.saleDate);
      formData.append('salePrice', saleForm.salePrice);
      formData.append('paymentMethod', saleForm.paymentMethod);
      if (saleFile) {
        formData.append('file', saleFile);
      }

      const response = await fetch(apiUrl('/sales'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to record sale');
      }

      toast.success('Vehicle marked as sold!');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to record sale');
    } finally {
      setUploadingSale(false);
    }
  };

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicle) return;
    try {
      await addNote({
        vehicleId: vehicle.id,
        customerName: noteForm.customerName,
        phone: noteForm.phone,
        email: noteForm.email,
        note: noteForm.note,
      });
      toast.success('Customer viewing note added');
      setNoteForm({ customerName: '', phone: '', email: '', note: '' });
    } catch (err) {
      toast.error('Failed to add viewing note');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground custom-scrollbar p-0 md:p-6">
        <DialogHeader className="p-6 pb-2 md:p-6">
          <DialogDescription className="sr-only">Vehicle details and management tabs.</DialogDescription>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <DialogTitle className="flex items-center gap-3 text-xl md:text-2xl font-black font-display tracking-tight text-foreground">
              <span className="p-2 bg-primary/10 rounded-lg shrink-0"><Info className="text-primary h-5 w-5" /></span>
              <span className="truncate">{isEditing ? 'Editing Vehicle Record' : `${vehicle.year} ${vehicle.make} ${vehicle.model}`}</span>
            </DialogTitle>
            
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={isEditing ? () => setIsEditing(false) : startEditing}
                className="flex-1 sm:flex-none border-primary/30 text-[10px] font-black uppercase tracking-widest text-foreground/70 hover:bg-primary/10 h-9"
              >
                {isEditing ? 'Cancel' : <><Pencil className="w-3.5 h-3.5 mr-2" /> Edit Details</>}
              </Button>
              
              {isAdmin && !isEditing && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-destructive hover:bg-destructive/10 text-[10px] font-black uppercase tracking-widest h-9 px-3"
                  title="Delete from Inventory"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}

              {(vehicle.hasDocument || vehicle.hasSourceDocument || vehicle.hasBillOfSale) && !isEditing && (
                <div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 border-border/50 text-[10px] font-black uppercase tracking-widest gap-2">
                        <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Documents</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white border-border text-foreground min-w-[200px]">
                        <div className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b border-border/50 mb-1">Preview Documents</div>
                        {vehicle.hasDocument && (
                        <DropdownMenuItem onClick={() => handleView('report')} className="text-[10px] font-black uppercase cursor-pointer py-2 hover:bg-muted/50"><FileText className="w-3.5 h-3.5 mr-2" /> Used Vehicle Record</DropdownMenuItem>
                        )}
                        {vehicle.hasSourceDocument && (
                        <DropdownMenuItem onClick={() => handleView('source')} className="text-[10px] font-black uppercase cursor-pointer py-2 hover:bg-muted/50"><Receipt className="w-3.5 h-3.5 mr-2" /> Original Source</DropdownMenuItem>
                        )}
                        {vehicle.hasBillOfSale && (
                        <DropdownMenuItem onClick={() => handleView('bill_of_sale')} className="text-[10px] font-black uppercase cursor-pointer py-2 text-foreground hover:bg-muted/50"><ShoppingCart className="w-3.5 h-3.5 mr-2" /> Bill of Sale</DropdownMenuItem>
                        )}
                        
                        <div className="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b border-t border-border/50 my-1">Download Files</div>
                        {vehicle.hasDocument && (
                        <DropdownMenuItem onClick={() => handleDownload('report')} className="text-[10px] font-black uppercase cursor-pointer py-2 hover:bg-muted/50"><Download className="w-3.5 h-3.5 mr-2 text-primary" /> Download Record</DropdownMenuItem>
                        )}
                        {vehicle.hasSourceDocument && (
                        <DropdownMenuItem onClick={() => handleDownload('source')} className="text-[10px] font-black uppercase cursor-pointer py-2 hover:bg-muted/50"><Download className="w-3.5 h-3.5 mr-2 text-primary" /> Download Source</DropdownMenuItem>
                        )}
                        {vehicle.hasBillOfSale && (
                        <DropdownMenuItem onClick={() => handleDownload('sale')} className="text-[10px] font-black uppercase cursor-pointer py-2 text-foreground hover:bg-muted/50"><Download className="w-3.5 h-3.5 mr-2" /> Download Bill of Sale</DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <div className="group relative flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground bg-muted/50 border border-border/60 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-muted transition-colors" onClick={() => { navigator.clipboard.writeText(vehicle.vin); toast.success('VIN copied to clipboard'); }}>
              <span>VIN: {vehicle.vin}</span>
              <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            {vehicle.titleNumber && (
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-500 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg">
                Title #: {vehicle.titleNumber}
              </div>
            )}
            <div className="text-[10px] font-black uppercase tracking-[0.1em] text-primary bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-lg">
               Investment: ${(((vehicle.totalPurchaseCost || vehicle.purchase?.totalPurchaseCost || 0)) + ((vehicle.repairCost || vehicle.repairs?.reduce((s,r)=>s+(r.partsCost||0)+(r.laborCost||0),0) || 0))).toLocaleString()}
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue={isEditing ? "edit" : "financials"} value={isEditing ? "edit" : undefined} className="mt-4 px-6 md:px-0">
          <TabsList className={`bg-muted/50 border border-border/50 p-1 rounded-xl h-auto grid grid-cols-2 sm:flex sm:flex-wrap gap-1 ${isEditing ? 'hidden' : ''}`}>
            <TabsTrigger value="financials" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 sm:px-5 py-2.5 rounded-lg font-black uppercase text-[9px] sm:text-[10px] tracking-widest gap-2 transition-all">
              <Receipt className="w-3.5 h-3.5" /> Financials
            </TabsTrigger>
            <TabsTrigger value="repairs" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 sm:px-5 py-2.5 rounded-lg font-black uppercase text-[9px] sm:text-[10px] tracking-widest gap-2 transition-all">
              <Pencil className="w-3.5 h-3.5" /> Manage Repairs
            </TabsTrigger>
            <TabsTrigger value="ads" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 sm:px-5 py-2.5 rounded-lg font-black uppercase text-[9px] sm:text-[10px] tracking-widest gap-2 transition-all">
              <Megaphone className="w-3.5 h-3.5" /> Advertising
            </TabsTrigger>
            {vehicle.status !== 'Sold' && (
              <TabsTrigger value="sale" className="data-[state=active]:bg-foreground data-[state=active]:text-primary-foreground px-3 sm:px-5 py-2.5 rounded-lg font-black uppercase text-[9px] sm:text-[10px] tracking-widest gap-2 transition-all">
                <ShoppingCart className="w-3.5 h-3.5" /> Record Sale
              </TabsTrigger>
            )}
            <TabsTrigger value="notes" className="data-[state=active]:bg-amber-500 data-[state=active]:text-primary-foreground px-3 sm:px-5 py-2.5 rounded-lg font-black uppercase text-[9px] sm:text-[10px] tracking-widest gap-2 transition-all">
              <MessageSquare className="w-3.5 h-3.5" /> Viewing Notes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-secondary/10 border border-border/40 rounded-xl p-5 mt-4 space-y-6">
              <form onSubmit={handleUpdate} className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-primary border-b border-primary/20 pb-2">Vehicle Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Year</Label>
                       <Input value={editForm.year} onChange={e => setEditForm({...editForm, year: e.target.value})} className="bg-muted border-border h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Make</Label>
                       <Input value={editForm.make} onChange={e => setEditForm({...editForm, make: e.target.value})} className="bg-muted border-border h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Model</Label>
                       <Input value={editForm.model} onChange={e => setEditForm({...editForm, model: e.target.value})} className="bg-muted border-border h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Color</Label>
                       <Input value={editForm.color} onChange={e => setEditForm({...editForm, color: e.target.value})} className="bg-muted border-border h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Mileage (In)</Label>
                       <Input type="number" value={editForm.mileage} onChange={e => setEditForm({...editForm, mileage: e.target.value})} className="bg-muted border-border h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">VIN</Label>
                       <Input value={editForm.vin} onChange={e => setEditForm({...editForm, vin: e.target.value})} className="bg-muted border-border h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Title Number</Label>
                       <Input value={editForm.titleNumber} onChange={e => setEditForm({...editForm, titleNumber: e.target.value})} placeholder="e.g. T-12345678" className="bg-muted border-blue-500/20 h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground font-semibold text-primary">Current Status</Label>
                       <select 
                         value={editForm.status} 
                         onChange={e => setEditForm({...editForm, status: e.target.value})}
                         className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                       >
                         <option value="Available">Available</option>
                         <option value="Reserved">Reserved</option>
                         <option value="Sold" disabled>Sold (Auto-updated)</option>
                         <option value="Returned">Returned</option>
                       </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-primary border-b border-primary/20 pb-2">Purchase & Seller Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="space-y-2 col-span-2">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Seller Name (Obtained From)</Label>
                        <Input value={editForm.purchasedFrom} onChange={e => setEditForm({...editForm, purchasedFrom: e.target.value})} className="bg-muted border-border h-9 text-sm" />
                     </div>
                     <div className="space-y-2 col-span-2">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Seller Address</Label>
                        <Input value={editForm.sellerAddress} onChange={e => setEditForm({...editForm, sellerAddress: e.target.value})} className="bg-muted border-border h-9 text-sm" />
                     </div>
                     <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">City</Label>
                        <Input value={editForm.sellerCity} onChange={e => setEditForm({...editForm, sellerCity: e.target.value})} className="bg-muted border-border h-9 text-sm" />
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                       <div className="space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">State</Label>
                          <Input value={editForm.sellerState} onChange={e => setEditForm({...editForm, sellerState: e.target.value})} maxLength={2} className="bg-muted border-border h-9 text-sm" />
                       </div>
                       <div className="space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Zip</Label>
                          <Input value={editForm.sellerZip} onChange={e => setEditForm({...editForm, sellerZip: e.target.value})} className="bg-muted border-border h-9 text-sm" />
                       </div>
                     </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-primary border-b border-primary/20 pb-2">Purchase Breakdown (Financials)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Purchase Price ($)</Label>
                       <Input type="number" value={editForm.purchasePrice} onChange={e => setEditForm({...editForm, purchasePrice: e.target.value})} className="bg-muted border-primary/20 h-9 text-sm font-bold text-primary" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Transport ($)</Label>
                       <Input type="number" value={editForm.transportCost} onChange={e => setEditForm({...editForm, transportCost: e.target.value})} className="bg-muted border-border h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Inspection ($)</Label>
                       <Input type="number" value={editForm.inspectionCost} onChange={e => setEditForm({...editForm, inspectionCost: e.target.value})} className="bg-muted border-border h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Fees ($)</Label>
                       <Input type="number" value={editForm.registrationCost} onChange={e => setEditForm({...editForm, registrationCost: e.target.value})} className="bg-muted border-border h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] uppercase font-bold text-muted-foreground">Purchase Date</Label>
                       <Input type="date" value={editForm.purchaseDate} onChange={e => setEditForm({...editForm, purchaseDate: e.target.value})} className="bg-muted border-border h-9 text-sm" />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="submit" className="flex-1 bg-primary text-primary-foreground font-black uppercase tracking-tighter h-12 hover:bg-primary/90">
                    Update Vehicle & Regenerate PDF
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setIsEditing(false)} className="px-8 border-border h-12 uppercase font-black text-xs tracking-widest">
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </TabsContent>

          <TabsContent value="financials" className="animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="bg-secondary/10 border border-border/40 rounded-xl p-4 space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Purchase Breakdown</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Purchase Price</span>
                    <span className="font-bold text-foreground">${vehicle.purchasePrice.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Transport</span>
                    <span className="font-bold text-foreground">${vehicle.transportCost.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Inspection</span>
                    <span className="font-bold text-foreground">${vehicle.inspectionCost.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Fees</span>
                    <span className="font-bold text-foreground">${vehicle.registrationCost.toLocaleString()}</span>
                  </div>
                  <div className="pt-2 border-t border-border/40 flex justify-between text-sm">
                    <span className="font-black uppercase tracking-widest text-[10px] text-primary">Initial Total</span>
                    <span className="font-black text-primary">${((vehicle.totalPurchaseCost || vehicle.purchase?.totalPurchaseCost || 0)).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="bg-secondary/10 border border-border/40 rounded-xl p-4 space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Maintenance & Other</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Repair Total</span>
                    <span className="font-bold text-foreground">${(vehicle.repairs?.reduce((acc, r) => acc + r.partsCost + r.laborCost, 0) || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-border/20 pt-2 mt-2">
                    <span className="text-muted-foreground font-bold">Total Investment</span>
                    <span className="font-black text-foreground text-base">
                      ${((vehicle.totalPurchaseCost || vehicle.purchase?.totalPurchaseCost || 0) + (vehicle.repairs?.reduce((acc, r) => acc + r.partsCost + r.laborCost, 0) || 0)).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {vehicle.repairs && vehicle.repairs.length > 0 && (
              <div className="mt-4 bg-secondary/5 border border-border/20 rounded-xl p-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Recent Repair History</h4>
                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                  {vehicle.repairs.map((repair) => (
                    <div key={repair.id} className="flex justify-between items-center text-[11px] bg-black/20 p-2 rounded-lg border border-white/5">
                      <div>
                        <p className="font-bold text-foreground">{repair.repairShop}</p>
                        <p className="text-muted-foreground italic">{repair.description}</p>
                        {repair.documentBase64 && (
                          <div className="mt-2 flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[9px] font-black uppercase tracking-widest"
                              onClick={() => handleRepairPreview(repair)}
                            >
                              Preview
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-6 px-2 text-[9px] font-black uppercase tracking-widest bg-primary hover:bg-primary/90"
                              onClick={() => handleRepairDownload(repair)}
                            >
                              Download
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-black text-primary">${(repair.partsCost + repair.laborCost).toLocaleString()}</p>
                        <p className="text-[9px] text-muted-foreground uppercase">{formatSafeDate(repair.repairDate)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {vehicle.status === 'Sold' && (
              <div className="mt-4 bg-foreground/5 border border-foreground/20 rounded-xl p-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-foreground mb-3">Buyer Information</h4>
                <BuyerInfoSection vehicleId={vehicle.id} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="repairs" className="animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-secondary/10 border border-border/40 rounded-xl p-5 mt-4 space-y-4">
              <h4 className="text-sm font-black uppercase tracking-widest text-primary">Add Post-Purchase Repair</h4>
              <form onSubmit={handleRepairSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Repair Shop<span className="text-red-500 ml-1">*</span></Label>
                  <Input 
                    value={repairForm.shop} 
                    onChange={e => setRepairForm({...repairForm, shop: e.target.value})}
                    placeholder="e.g. Master Auto" required className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Parts Cost ($)<span className="text-red-500 ml-1">*</span></Label>
                  <Input 
                    type="number" value={repairForm.parts} 
                    onChange={e => setRepairForm({...repairForm, parts: e.target.value})}
                    placeholder="0.00" required className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Labor Cost ($)<span className="text-red-500 ml-1">*</span></Label>
                  <Input 
                    type="number" value={repairForm.labor} 
                    onChange={e => setRepairForm({...repairForm, labor: e.target.value})}
                    placeholder="0.00" required className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Description</Label>
                  <Input 
                    value={repairForm.desc} 
                    onChange={e => setRepairForm({...repairForm, desc: e.target.value})}
                    placeholder="Brief description" required className="bg-muted border-border"
                  />
                </div>
                <Button className="col-span-2 bg-primary text-primary-foreground font-black h-11 uppercase" type="submit">
                  <Plus className="w-4 h-4 mr-2" /> Record Repair Cost
                </Button>
              </form>
            </div>
          </TabsContent>

          <TabsContent value="ads" className="animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-secondary/10 border border-border/40 rounded-xl p-5 mt-4 space-y-4">
              <h4 className="text-sm font-black uppercase tracking-widest text-primary">Link Advertising Campaign</h4>
              <form onSubmit={handleAdSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Campaign Name</Label>
                  <Input 
                    value={adForm.name} 
                    onChange={e => setAdForm({...adForm, name: e.target.value})}
                    placeholder="e.g. FB Ad for Honda Civic" required className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Platform</Label>
                  <Input 
                    value={adForm.platform} 
                    onChange={e => setAdForm({...adForm, platform: e.target.value})}
                    placeholder="Facebook / Google" required className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Spend Amount ($)</Label>
                  <Input 
                    type="number" value={adForm.amount} 
                    onChange={e => setAdForm({...adForm, amount: e.target.value})}
                    placeholder="0.00" required className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Start Date</Label>
                  <Input 
                    type="date" value={adForm.startDate} 
                    onChange={e => setAdForm({...adForm, startDate: e.target.value})}
                    required className="bg-muted border-border"
                  />
                </div>
                 <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">End Date</Label>
                  <Input 
                    type="date" value={adForm.endDate} 
                    onChange={e => setAdForm({...adForm, endDate: e.target.value})}
                    required className="bg-muted border-border"
                  />
                </div>
                <Button className="col-span-2 bg-primary text-primary-foreground font-black h-11 uppercase" type="submit">
                  <Plus className="w-4 h-4 mr-2" /> Link Ad Campaign
                </Button>
              </form>
            </div>
          </TabsContent>

          {vehicle.status !== 'Sold' && (
            <TabsContent value="sale" className="animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="bg-secondary/10 border border-border/40 rounded-xl p-5 mt-4 space-y-4">
                <h4 className="text-sm font-black uppercase tracking-widest text-foreground">Process Vehicle Sale</h4>
                <form onSubmit={handleSaleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2 md:col-span-1">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Customer Name<span className="text-red-500 ml-1">*</span></Label>
                    <Input 
                      value={saleForm.customerName} 
                      onChange={e => setSaleForm({...saleForm, customerName: e.target.value})}
                      placeholder="e.g. John Doe" required className="bg-muted border-border"
                    />
                  </div>
                  <div className="space-y-2 col-span-2 md:col-span-1">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Phone Number<span className="text-red-500 ml-1">*</span></Label>
                    <Input 
                      value={saleForm.phone} 
                      onChange={e => setSaleForm({...saleForm, phone: e.target.value})}
                      placeholder="e.g. 555-0199" required className="bg-muted border-border"
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Email</Label>
                    <Input 
                      type="email"
                      value={saleForm.email} 
                      onChange={e => setSaleForm({...saleForm, email: e.target.value})}
                      placeholder="customer@email.com" className="bg-muted border-border"
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Customer Address<span className="text-red-500 ml-1">*</span></Label>
                    <Input 
                      value={saleForm.address} 
                      onChange={e => setSaleForm({...saleForm, address: e.target.value})}
                      placeholder="123 Main St, Springfield" required className="bg-muted border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Sale Price ($)<span className="text-red-500 ml-1">*</span></Label>
                    <Input 
                      type="number" value={saleForm.salePrice} 
                      onChange={e => setSaleForm({...saleForm, salePrice: e.target.value})}
                      placeholder="0.00" required className="bg-muted border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Sale Date<span className="text-red-500 ml-1">*</span></Label>
                    <Input 
                      type="date" value={saleForm.saleDate} 
                      onChange={e => setSaleForm({...saleForm, saleDate: e.target.value})}
                      required className="bg-muted border-border"
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Payment Method</Label>
                    <select
                      value={saleForm.paymentMethod}
                      onChange={e => setSaleForm({...saleForm, paymentMethod: e.target.value})}
                      className="flex h-10 w-full rounded-md border border-border bg-muted px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                      required
                    >
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Loan">Loan / Finance</option>
                      <option value="Check">Check</option>
                    </select>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Bill of Sale Document (Optional)</Label>
                    <div 
                      onClick={() => document.getElementById('sale-file-upload')?.click()}
                      className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-foreground/50 hover:bg-foreground/5 transition-all"
                    >
                      {saleFile ? (
                        <div className="flex items-center gap-2 text-foreground">
                          <CheckCircle2 className="w-5 h-5" />
                          <span className="text-xs font-bold">{saleFile.name}</span>
                        </div>
                      ) : (
                        <>
                          <FileUp className="w-6 h-6 text-muted-foreground" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Click to upload Bill of Sale</span>
                        </>
                      )}
                      <input 
                        type="file" 
                        id="sale-file-upload" 
                        className="hidden" 
                        accept="image/*,.pdf"
                        onChange={(e) => setSaleFile(e.target.files?.[0] || null)}
                      />
                    </div>
                  </div>
                  <Button 
                    className="col-span-2 bg-foreground text-primary-foreground hover:bg-foreground/90 font-black h-11 uppercase mt-2" 
                    type="submit"
                    disabled={uploadingSale}
                  >
                    {uploadingSale ? 'Processing...' : <><ShoppingCart className="w-4 h-4 mr-2" /> Mark as Sold</>}
                  </Button>
                </form>
              </div>
            </TabsContent>
          )}

          <TabsContent value="notes" className="animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-secondary/10 border border-border/40 rounded-xl p-5 mt-4 space-y-4">
              <h4 className="text-sm font-black uppercase tracking-widest text-amber-500">Customer Viewing Notes</h4>
              <form onSubmit={handleNoteSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Customer Name<span className="text-red-500 ml-1">*</span></Label>
                  <Input 
                    value={noteForm.customerName} 
                    onChange={e => setNoteForm({...noteForm, customerName: e.target.value})}
                    placeholder="Full Name" required className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Contact Number<span className="text-red-500 ml-1">*</span></Label>
                  <Input 
                    value={noteForm.phone} 
                    onChange={e => setNoteForm({...noteForm, phone: e.target.value})}
                    placeholder="Phone Number" required className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Email (Optional)</Label>
                  <Input 
                    type="email" value={noteForm.email} 
                    onChange={e => setNoteForm({...noteForm, email: e.target.value})}
                    placeholder="customer@email.com" className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Note/Feedback<span className="text-red-500 ml-1">*</span></Label>
                  <textarea 
                    value={noteForm.note} 
                    onChange={e => setNoteForm({...noteForm, note: e.target.value})}
                    placeholder="Describe customer interaction or feedback..." required 
                    className="flex min-h-[100px] w-full rounded-md border border-border bg-muted px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <Button className="col-span-2 bg-amber-500 text-primary-foreground font-black h-11 uppercase" type="submit">
                  <Plus className="w-4 h-4 mr-2" /> Add Viewing Note
                </Button>
              </form>

              {notes && notes.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Previous Viewings</h5>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {notes.map((note) => (
                      <div key={note.id} className="bg-black/20 border border-white/5 rounded-xl p-4 space-y-2 relative group">
                        <div className="flex justify-between items-start">
                          <div>
                            <h6 className="font-bold text-foreground flex items-center gap-2">
                              <Users className="w-3.5 h-3.5 text-amber-500" /> {note.customerName}
                            </h6>
                            <p className="text-[10px] text-muted-foreground font-medium">{note.phone} {note.email ? `• ${note.email}` : ''}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] text-muted-foreground uppercase font-black">{formatSafeDate(note.createdAt)}</p>
                            <p className="text-[8px] text-muted-foreground/60 uppercase">{formatSafeDate(note.createdAt, true)}</p>
                          </div>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-3">
                          <p className="text-xs text-foreground leading-relaxed italic">"{note.note}"</p>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => deleteNote(note.id)}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DocumentViewerDialog 
          open={viewerOpen} 
          onOpenChange={setViewerOpen}
          documentBase64={viewerDoc?.base64 || null}
          vehicleName={viewerDoc?.name || ''}
          documentType={viewerDoc?.type || ''}
        />

        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                </div>
                <AlertDialogTitle className="text-xl font-black uppercase tracking-tight text-foreground">Confirm Deletion</AlertDialogTitle>
              </div>
              <AlertDialogDescription className="text-muted-foreground font-medium">
                Are you sure you want to delete <span className="text-foreground font-bold">{vehicle?.year} {vehicle?.make} {vehicle?.model}</span>? 
                This will permanently remove all associated records including repairs, purchases, and sales. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-6 gap-3">
              <AlertDialogCancel className="bg-muted border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 font-bold uppercase tracking-widest text-[10px] h-11">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                className="bg-destructive text-foreground hover:bg-destructive/90 font-black uppercase tracking-widest text-[10px] h-11 px-6"
                onClick={handleDelete}
              >
                Delete Vehicle
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function BuyerInfoSection({ vehicleId }: { vehicleId: string }) {
  const { sales } = useSales();
  const sale = sales.find(s => s.vehicleId === vehicleId);

  if (!sale) {
    return <p className="text-xs text-muted-foreground italic">Sale record not found.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Buyer Name</span>
        <span className="font-bold text-foreground">{sale.customerName}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Phone</span>
        <span className="font-bold text-foreground">{sale.phone}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Address</span>
        <span className="font-bold text-foreground">{sale.address}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Sale Price</span>
        <span className="font-bold text-primary">${sale.salePrice.toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Sale Date</span>
        <span className="font-bold text-foreground">{formatSafeDate(sale.saleDate)}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Payment Method</span>
        <span className="font-bold text-foreground">{sale.paymentMethod}</span>
      </div>
      <div className="flex justify-between items-center text-xs pt-2 border-t border-border/40">
        <span className="font-black uppercase tracking-widest text-[10px] text-foreground">Net Profit</span>
        <span className={`font-black ${sale.profit >= 0 ? 'text-primary' : 'text-foreground'}`}>${sale.profit.toLocaleString()}</span>
      </div>

      <div className="pt-4 flex flex-wrap gap-2">
        {sale.hasBillOfSale && (
          <Button 
            size="sm" 
            variant="outline" 
            className="h-8 text-[10px] font-black uppercase tracking-widest border-foreground/30 text-foreground hover:bg-foreground/10"
            onClick={() => {
              // We need a way to trigger handleViewDocument from here
              // Since this is a sub-component, we'll assume the parent has handleViewDocument
              // For now, let's just use a simple fetch
              window.dispatchEvent(new CustomEvent('view-document', { detail: { type: 'bill_of_sale', vehicleId: sale.vehicleId } }));
            }}
          >
            <ShoppingCart className="w-3.5 h-3.5 mr-2" /> Bill of Sale
          </Button>
        )}
      </div>
    </div>
  );
}

