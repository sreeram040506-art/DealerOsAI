import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Receipt, Plus, Save } from 'lucide-react';
import { useExpenses } from '@/hooks/useExpenses';
import { BusinessExpense } from '@/types/inventory';
import { toast } from '@/components/ui/toast-utils';

interface AddExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: BusinessExpense | null;
}

export default function AddExpenseDialog({ open, onOpenChange, expense }: AddExpenseDialogProps) {
  const { addExpense, updateExpense } = useExpenses();
  const [formData, setFormData] = useState({
    category: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  useEffect(() => {
    if (expense) {
      setFormData({
        category: expense.category,
        amount: expense.amount.toString(),
        date: new Date(expense.date).toISOString().split('T')[0],
        notes: expense.notes || '',
      });
    } else {
      setFormData({
        category: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });
    }
  }, [expense, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        category: formData.category,
        amount: parseFloat(formData.amount),
        date: formData.date,
        notes: formData.notes,
      };

      if (expense) {
        await updateExpense({ id: expense.id, ...data });
        toast.success('Business expense updated successfully');
      } else {
        await addExpense(data);
        toast.success('Business expense recorded successfully');
      }
      
      onOpenChange(false);
    } catch (err) {
      toast.error(expense ? 'Failed to update expense' : 'Failed to record expense');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border text-foreground">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <span className="p-2 bg-primary/10 rounded-lg">
              <Receipt className="text-primary w-5 h-5" />
            </span>
            <DialogTitle className="text-xl font-black font-display tracking-tight text-foreground uppercase">
              {expense ? 'Edit Expense' : 'Add Business Expense'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-xs uppercase tracking-widest font-bold">
            {expense ? 'Modify recorded cost details.' : 'Record operational or maintenance costs.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Category<span className="text-red-500 ml-1">*</span></Label>
            <Input 
              value={formData.category} 
              onChange={e => setFormData({...formData, category: e.target.value})}
              placeholder="e.g. Rent, Utilities, Software" required className="bg-muted border-border focus:ring-primary/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Amount ($)<span className="text-red-500 ml-1">*</span></Label>
              <Input 
                type="number" value={formData.amount} 
                onChange={e => setFormData({...formData, amount: e.target.value})}
                placeholder="0.00" required className="bg-muted border-border focus:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date<span className="text-red-500 ml-1">*</span></Label>
              <Input 
                type="date" value={formData.date} 
                onChange={e => setFormData({...formData, date: e.target.value})}
                required className="bg-muted border-border focus:ring-primary/50"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Notes (Optional)</Label>
            <Input 
              value={formData.notes} 
              onChange={e => setFormData({...formData, notes: e.target.value})}
              placeholder="Brief description..." className="bg-muted border-border focus:ring-primary/50"
            />
          </div>
          <Button className="w-full bg-primary text-primary-foreground font-black h-12 uppercase tracking-widest text-xs mt-2" type="submit">
            {expense ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            {expense ? 'Save Changes' : 'Record Expense'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
