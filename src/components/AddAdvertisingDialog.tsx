import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Megaphone, Plus, Sparkles, Loader2 } from 'lucide-react';
import { useAdvertising } from '@/hooks/useAdvertising';
import { useInventory } from '@/hooks/useInventory';
import { toast } from 'sonner';
import { AdvertisingExpense } from '@/types/inventory';

interface AddAdvertisingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ad?: AdvertisingExpense | null;
}

export default function AddAdvertisingDialog({ open, onOpenChange, ad }: AddAdvertisingDialogProps) {
  const { addAd, updateAd, generateAdCopy } = useAdvertising();
  const { vehicles } = useInventory();
  
  const [formData, setFormData] = useState({
    campaignName: '',
    platform: 'Facebook',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    amountSpent: '',
    budgetLimit: '',
    status: 'Active',
    linkedVehicleId: 'none',
    adCopy: '',
  });

  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (ad) {
      setFormData({
        campaignName: ad.campaignName,
        platform: ad.platform,
        startDate: new Date(ad.startDate).toISOString().split('T')[0],
        endDate: new Date(ad.endDate).toISOString().split('T')[0],
        amountSpent: ad.amountSpent.toString(),
        budgetLimit: ad.budgetLimit ? ad.budgetLimit.toString() : '',
        status: ad.status || 'Active',
        linkedVehicleId: ad.linkedVehicleId || 'none',
        adCopy: ad.adCopy || '',
      });
    } else {
      setFormData({
        campaignName: '',
        platform: 'Facebook',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        amountSpent: '',
        budgetLimit: '',
        status: 'Active',
        linkedVehicleId: 'none',
        adCopy: '',
      });
    }
  }, [ad, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        campaignName: formData.campaignName,
        platform: formData.platform,
        startDate: formData.startDate,
        endDate: formData.endDate,
        amountSpent: parseFloat(formData.amountSpent || '0'),
        budgetLimit: formData.budgetLimit ? parseFloat(formData.budgetLimit) : undefined,
        status: formData.status,
        adCopy: formData.adCopy,
        linkedVehicleId: formData.linkedVehicleId === 'none' ? undefined : formData.linkedVehicleId,
      };

      if (ad) {
        await updateAd({ id: ad.id, ...payload });
        toast.success('Advertising campaign updated!');
      } else {
        await addAd(payload);
        toast.success('Advertising campaign recorded!');
      }
      
      onOpenChange(false);
    } catch (err) {
      toast.error(ad ? 'Failed to update campaign' : 'Failed to record campaign');
    }
  };

  const handleGenerateCopy = async () => {
    if (formData.linkedVehicleId === 'none') {
      toast.error('Please link a vehicle first to generate copy.');
      return;
    }
    setIsGenerating(true);
    try {
      const res = await generateAdCopy(formData.linkedVehicleId);
      if (res && res.adCopy) {
        setFormData((prev) => ({ ...prev, adCopy: res.adCopy }));
        toast.success('Ad copy generated successfully!');
      } else {
        toast.error('Failed to generate ad copy.');
      }
    } catch (err) {
      toast.error('Failed to generate ad copy.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-card border-border text-foreground max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <span className="p-2 bg-primary/10 rounded-lg">
              <Megaphone className="text-primary w-5 h-5" />
            </span>
            <DialogTitle className="text-xl font-black font-display tracking-tight text-foreground uppercase">
              {ad ? 'Edit Campaign' : 'Launch Campaign'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-xs uppercase tracking-widest font-bold">
            {ad ? 'Modify platform budget and timeline.' : 'Track marketing spend and platform performance.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Campaign Name</Label>
            <Input 
              value={formData.campaignName} 
              onChange={e => setFormData({...formData, campaignName: e.target.value})}
              placeholder="e.g. Summer Blowout, FB Marketplace Promo" required className="bg-muted border-border focus:ring-primary/50"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Platform</Label>
              <Select value={formData.platform} onValueChange={v => setFormData({...formData, platform: v})}>
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue placeholder="Select Platform" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="Facebook">Facebook</SelectItem>
                  <SelectItem value="Google">Google</SelectItem>
                  <SelectItem value="Instagram">Instagram</SelectItem>
                  <SelectItem value="Tiktok">TikTok</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</Label>
              <Select value={formData.status} onValueChange={v => setFormData({...formData, status: v})}>
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Paused">Paused</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Amount Spent ($)</Label>
              <Input 
                type="number" value={formData.amountSpent} 
                onChange={e => setFormData({...formData, amountSpent: e.target.value})}
                placeholder="0.00" required className="bg-muted border-border focus:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Budget Limit ($)</Label>
              <Input 
                type="number" value={formData.budgetLimit} 
                onChange={e => setFormData({...formData, budgetLimit: e.target.value})}
                placeholder="Optional budget cap" className="bg-muted border-border focus:ring-primary/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Start Date</Label>
              <Input 
                type="date" value={formData.startDate} 
                onChange={e => setFormData({...formData, startDate: e.target.value})}
                required className="bg-muted border-border focus:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">End Date</Label>
              <Input 
                type="date" value={formData.endDate} 
                onChange={e => setFormData({...formData, endDate: e.target.value})}
                required className="bg-muted border-border focus:ring-primary/50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Link to Vehicle (Optional)</Label>
            <div className="flex gap-2">
              <Select value={formData.linkedVehicleId} onValueChange={v => setFormData({...formData, linkedVehicleId: v})}>
                <SelectTrigger className="bg-muted border-border flex-1">
                  <SelectValue placeholder="Select a Vehicle" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="none">General / No Vehicle</SelectItem>
                  {vehicles.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model} ({v.vin.slice(-6)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                type="button" 
                variant="secondary" 
                onClick={handleGenerateCopy} 
                disabled={isGenerating || formData.linkedVehicleId === 'none'}
              >
                {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                AI Assist
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ad Copy</Label>
            <Textarea
              value={formData.adCopy}
              onChange={(e) => setFormData({...formData, adCopy: e.target.value})}
              placeholder="Auto-generated or custom ad copy here..."
              className="bg-muted border-border focus:ring-primary/50 min-h-[100px]"
            />
          </div>

          <Button className="w-full bg-primary text-primary-foreground font-black h-12 uppercase tracking-widest text-xs mt-2" type="submit">
            {ad ? <Plus className="w-4 h-4 mr-2 hidden" /> : <Plus className="w-4 h-4 mr-2" />}
            {ad ? 'Save Changes' : 'Launch Campaign'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
