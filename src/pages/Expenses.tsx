import { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useExpenses } from '@/hooks/useExpenses';
import QueryErrorState from '@/components/QueryErrorState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Receipt, Edit2, Trash2, Search } from 'lucide-react';
import AddExpenseDialog from '@/components/AddExpenseDialog';
import { BusinessExpense } from '@/types/inventory';
import { toast } from '@/components/ui/toast-utils';

interface ExpensesProps {
  isSubpage?: boolean;
}

export default function Expenses({ isSubpage = false }: ExpensesProps) {
  const { expenses, isLoading, isError, deleteExpense } = useExpenses();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<BusinessExpense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => 
      exp.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (exp.notes && exp.notes.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [expenses, searchTerm]);

  const totalExpenses = useMemo(() => {
    return filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  }, [filteredExpenses]);
  
  const categories = useMemo(() => {
    return [...new Set(filteredExpenses.map(e => e.category))];
  }, [filteredExpenses]);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading expenses...</div>;
  
  if (isError) {
    const errorState = (
      <QueryErrorState
        title="Could not load expenses"
        description="The expenses API request failed, so the page is not showing an empty table as if that were valid data."
      />
    );
    return isSubpage ? errorState : <AppLayout>{errorState}</AppLayout>;
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      await deleteExpense(id);
      toast.success('Expense deleted successfully');
    } catch (err) {
      toast.error('Failed to delete expense');
    }
  };

  const handleEdit = (expense: BusinessExpense) => {
    setSelectedExpense(expense);
    setIsDialogOpen(true);
  };

  const content = (
    <div className="space-y-6">
      {!isSubpage && (
        <div className="animate-in slide-in-from-top-4 duration-500 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold font-display text-foreground tracking-tight">Business Expenses</h1>
            <p className="text-muted-foreground mt-1 text-sm font-medium">Operational cost tracking</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search expenses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border-border bg-muted/50 pl-10 text-foreground focus-visible:ring-primary/50"
              />
            </div>
            <Button 
              onClick={() => {
                setSelectedExpense(null);
                setIsDialogOpen(true);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-6 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 flex-shrink-0"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Expense
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="stat-card bg-secondary/30 border-border/50 shadow-sm transition-all hover:shadow-md">
          <p className="stat-label uppercase text-[10px] tracking-widest font-black text-muted-foreground/80 lowercase">Total Expenses</p>
          <p className="stat-value text-3xl mt-1 text-foreground font-display font-black leading-none">${totalExpenses.toLocaleString()}</p>
        </div>
        <div className="stat-card bg-secondary/30 border-border/50 shadow-sm transition-all hover:shadow-md">
          <p className="stat-label uppercase text-[10px] tracking-widest font-black text-muted-foreground/80">Categories</p>
          <p className="stat-value text-3xl mt-1 text-foreground font-display font-black leading-none">{categories.length}</p>
        </div>
        <div className="stat-card bg-secondary/30 border-border/50 shadow-sm transition-all hover:shadow-md">
          <p className="stat-label uppercase text-[10px] tracking-widest font-black text-muted-foreground/80">Avg Expense</p>
          <p className="stat-value text-3xl mt-1 text-foreground font-display font-black leading-none">${expenses.length > 0 ? Math.round(totalExpenses / expenses.length).toLocaleString() : 0}</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Category</th>
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Amount</th>
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Date</th>
                <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Notes</th>
                <th className="text-right px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((exp) => (
                <tr key={exp.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-bold text-foreground text-sm tracking-tight">{exp.category}</td>
                  <td className="px-6 py-4 font-display font-black text-foreground text-base">${exp.amount.toLocaleString()}</td>
                  <td className="px-6 py-4 text-xs text-muted-foreground font-black tracking-tight">{new Date(exp.date).toLocaleDateString()}</td>
                  <td className="px-4 py-4 text-xs text-muted-foreground italic">{exp.notes || '—'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleEdit(exp)}
                        className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDelete(exp.id)}
                        className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-foreground/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {isSubpage ? content : <AppLayout>{content}</AppLayout>}
      <AddExpenseDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen} 
        expense={selectedExpense}
      />
    </>
  );
}
