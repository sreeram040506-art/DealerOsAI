import { useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import QueryErrorState from '@/components/QueryErrorState';
import { Customer, CustomerDocument, useCustomers } from '@/hooks/useCustomers';
import { useInventory } from '@/hooks/useInventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Car, Download, FileUp, Loader2, Mail, MapPin, Pencil, Phone, Plus, Search, Users } from 'lucide-react';
import { toast } from '@/components/ui/toast-utils';
import { useAuth } from '@/context/auth-hooks';
import { apiFetch, apiUrl, handleApiResponse } from '@/lib/api';
import CustomerDetailDialog from '@/components/CustomerDetailDialog';

const CUSTOMER_CATEGORIES = ['Bought Vehicle', 'Came for Visit', 'Lead', 'Follow Up', 'Other'] as const;
const META_PREFIX = 'APH_CUSTOMER_META:';
const NO_VEHICLE = 'none';

type CustomerCategory = typeof CUSTOMER_CATEGORIES[number];

type CustomerMeta = {
  category: CustomerCategory;
  vehicleId?: string;
  vehicleLabel?: string;
};

type CustomerForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  category: CustomerCategory;
  vehicleId: string;
};

const emptyForm: CustomerForm = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  category: 'Lead',
  vehicleId: NO_VEHICLE,
};

function parseCustomerMeta(notes?: string | null): CustomerMeta {
  if (!notes?.startsWith(META_PREFIX)) return { category: 'Lead' };

  try {
    const parsed = JSON.parse(notes.slice(META_PREFIX.length));
    const category = CUSTOMER_CATEGORIES.includes(parsed.category) ? parsed.category : 'Lead';
    return {
      category,
      vehicleId: parsed.vehicleId || undefined,
      vehicleLabel: parsed.vehicleLabel || undefined,
    };
  } catch {
    return { category: 'Lead' };
  }
}

function buildCustomerNotes(meta: CustomerMeta) {
  return `${META_PREFIX}${JSON.stringify(meta)}`;
}

function getVehicleLabel(vehicle: { year?: number; make?: string; model?: string; vin?: string }) {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin || 'Vehicle';
}

export default function Customers() {
  const { token, logout } = useAuth();
  const { customers, isLoading, isError, importFromSales, isImporting, addCustomer, updateCustomer, uploadCustomerDocument, isUploadingCustomerDocument } = useCustomers();
  const { vehicles, isLoading: vehiclesLoading, isError: vehiclesError } = useInventory();
  const [searchTerm, setSearchTerm] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerForm>(emptyForm);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [docCustomer, setDocCustomer] = useState<Customer | null>(null);
  const [docName, setDocName] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [customerDocs, setCustomerDocs] = useState<CustomerDocument[]>([]);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  const vehiclesById = useMemo(() => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);

  const filteredVehicleOptions = useMemo(() => {
    const query = vehicleSearch.trim().toLowerCase();
    return vehicles.filter((vehicle) => {
      const label = `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.vin} ${vehicle.status}`.toLowerCase();
      return !query || label.includes(query);
    });
  }, [vehicles, vehicleSearch]);

  const enrichedCustomers = useMemo(() => {
    return customers.map((customer) => {
      const meta = parseCustomerMeta(customer.notes);
      const linkedVehicle = meta.vehicleId ? vehiclesById.get(meta.vehicleId) : null;
      return {
        customer,
        meta: {
          ...meta,
          vehicleLabel: linkedVehicle ? getVehicleLabel(linkedVehicle) : meta.vehicleLabel,
        },
      };
    });
  }, [customers, vehiclesById]);

  const filteredCustomers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return enrichedCustomers;

    return enrichedCustomers.filter(({ customer, meta }) => {
      const fullName = `${customer.firstName} ${customer.lastName || ''}`.toLowerCase();
      return (
        fullName.includes(query) ||
        (customer.email || '').toLowerCase().includes(query) ||
        (customer.phone || '').toLowerCase().includes(query) ||
        (customer.address || '').toLowerCase().includes(query) ||
        (customer.city || '').toLowerCase().includes(query) ||
        meta.category.toLowerCase().includes(query) ||
        (meta.vehicleLabel || '').toLowerCase().includes(query)
      );
    });
  }, [enrichedCustomers, searchTerm]);

  const customersWithEmail = useMemo(
    () => customers.filter((customer) => customer.email).length,
    [customers]
  );

  const boughtVehicleCount = useMemo(
    () => enrichedCustomers.filter(({ meta }) => meta.category === 'Bought Vehicle').length,
    [enrichedCustomers]
  );

  const visitCount = useMemo(
    () => enrichedCustomers.filter(({ meta }) => meta.category === 'Came for Visit').length,
    [enrichedCustomers]
  );

  const handleImportFromSales = async () => {
    try {
      const result = await importFromSales();
      toast.success(result.message || 'Customers imported from sales records.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to import customers from sales.');
    }
  };

  const openNewCustomerForm = () => {
    setSelectedCustomer(null);
    setCustomerForm(emptyForm);
    setVehicleSearch('');
    setFormOpen(true);
  };

  const openEditCustomerForm = (customer: Customer) => {
    const meta = parseCustomerMeta(customer.notes);
    setSelectedCustomer(customer);
    setCustomerForm({
      firstName: customer.firstName || '',
      lastName: customer.lastName || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      city: customer.city || '',
      state: customer.state || '',
      zip: customer.zip || '',
      category: meta.category,
      vehicleId: meta.vehicleId || NO_VEHICLE,
    });
    setVehicleSearch('');
    setFormOpen(true);
  };

  const closeCustomerForm = () => {
    setFormOpen(false);
    setSelectedCustomer(null);
    setCustomerForm(emptyForm);
    setVehicleSearch('');
  };

  const openDocumentDialog = async (customer: Customer) => {
    setDocCustomer(customer);
    setDocDialogOpen(true);
    setDocName('');
    setDocFile(null);
    try {
      const response = await apiFetch(`/customers/${customer.id}/documents`, token);
      const docs = await handleApiResponse<CustomerDocument[]>(response, logout);
      setCustomerDocs(docs);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load customer documents.');
      setCustomerDocs([]);
    }
  };

  const handleUploadCustomerDocument = async () => {
    if (!docCustomer) return;
    if (!docName.trim()) return toast.error('Document name is required.');
    if (!docFile) return toast.error('Please choose a file.');
    try {
      await uploadCustomerDocument({ customerId: docCustomer.id, documentName: docName.trim(), file: docFile });
      const response = await apiFetch(`/customers/${docCustomer.id}/documents`, token);
      const docs = await handleApiResponse<CustomerDocument[]>(response, logout);
      setCustomerDocs(docs);
      setDocName('');
      setDocFile(null);
      toast.success('Customer document uploaded.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload customer document.');
    }
  };

  const handleSaveCustomer = async (event: React.FormEvent) => {
    event.preventDefault();

    const firstName = customerForm.firstName.trim();
    if (!firstName) {
      toast.error('Customer first name is required.');
      return;
    }

    const selectedVehicle = customerForm.vehicleId !== NO_VEHICLE ? vehiclesById.get(customerForm.vehicleId) : null;
    const notes = buildCustomerNotes({
      category: customerForm.category,
      vehicleId: selectedVehicle?.id,
      vehicleLabel: selectedVehicle ? getVehicleLabel(selectedVehicle) : undefined,
    });

    const payload = {
      firstName,
      lastName: customerForm.lastName.trim() || null,
      phone: customerForm.phone.trim() || null,
      email: customerForm.email.trim() || null,
      address: customerForm.address.trim() || null,
      city: customerForm.city.trim() || null,
      state: customerForm.state.trim() || null,
      zip: customerForm.zip.trim() || null,
      notes,
    };

    setSavingCustomer(true);
    try {
      if (selectedCustomer) {
        await updateCustomer({ id: selectedCustomer.id, ...payload });
        toast.success('Customer updated.');
      } else {
        await addCustomer(payload);
        toast.success('Customer added.');
      }
      closeCustomerForm();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save customer.');
    } finally {
      setSavingCustomer(false);
    }
  };

  if (isLoading || vehiclesLoading) return <div className="p-8 text-center text-muted-foreground">Loading customers...</div>;

  if (isError || vehiclesError) {
    return (
      <AppLayout>
        <QueryErrorState
          title="Could not load customers"
          description="At least one customer-related API request failed."
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 page-enter">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-display text-foreground tracking-tight">Customers</h1>
            <p className="text-muted-foreground mt-1 text-sm font-medium">Buyer, visitor, and lead tracking</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, vehicle, category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border-border bg-muted/50 pl-10 text-foreground focus-visible:ring-primary/50"
              />
            </div>
            <Button
              onClick={openNewCustomerForm}
              className="bg-foreground text-primary-foreground hover:bg-foreground/90 h-11 px-5 font-black uppercase tracking-widest text-[10px]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Customer
            </Button>
            <Button
              onClick={handleImportFromSales}
              disabled={isImporting}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-5 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20"
            >
              <Download className="w-4 h-4 mr-2" />
              {isImporting ? 'Importing...' : 'Import Sales'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="stat-card bg-secondary/30 border-border/50 shadow-sm">
            <p className="stat-label uppercase text-[10px] tracking-widest font-black text-muted-foreground/80">Total Customers</p>
            <p className="stat-value text-3xl mt-1 text-foreground font-display font-black leading-none">{customers.length}</p>
          </div>
          <div className="stat-card bg-secondary/30 border-border/50 shadow-sm">
            <p className="stat-label uppercase text-[10px] tracking-widest font-black text-muted-foreground/80">Bought Vehicle</p>
            <p className="stat-value text-3xl mt-1 text-foreground font-display font-black leading-none">{boughtVehicleCount}</p>
          </div>
          <div className="stat-card bg-secondary/30 border-border/50 shadow-sm">
            <p className="stat-label uppercase text-[10px] tracking-widest font-black text-muted-foreground/80">Came for Visit</p>
            <p className="stat-value text-3xl mt-1 text-foreground font-display font-black leading-none">{visitCount}</p>
          </div>
          <div className="stat-card bg-secondary/30 border-border/50 shadow-sm">
            <p className="stat-label uppercase text-[10px] tracking-widest font-black text-muted-foreground/80">Emails Saved</p>
            <p className="stat-value text-3xl mt-1 text-foreground font-display font-black leading-none">{customersWithEmail}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:hidden pb-6">
          {filteredCustomers.length > 0 ? (
            filteredCustomers.map(({ customer, meta }) => {
              const fullName = `${customer.firstName} ${customer.lastName || ''}`.trim();
              return (
                <div key={customer.id} className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-bold text-foreground text-base truncate">{fullName}</h2>
                      <p className="text-[10px] text-primary uppercase tracking-widest font-black">{meta.category}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditCustomerForm(customer)}
                      className="h-8 w-8 text-primary hover:bg-primary/10 shrink-0"
                      aria-label={`Edit ${fullName}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => openDocumentDialog(customer)}
                      className="h-8 w-8 text-primary hover:bg-primary/10 shrink-0"
                      aria-label={`Upload document for ${fullName}`}
                    >
                      <FileUp className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setDetailCustomer(customer)}
                      className="h-8 w-8 text-primary hover:bg-primary/10 shrink-0"
                      aria-label={`View details for ${fullName}`}
                    >
                      <Users className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> {customer.phone || 'No contact number'}</p>
                    <p className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> {customer.email || 'No email saved'}</p>
                    {meta.vehicleLabel && <p className="flex items-center gap-2"><Car className="w-3.5 h-3.5" /> {meta.vehicleLabel}</p>}
                    {(customer.address || customer.city) && (
                      <p className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> {[customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', ')}</p>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-16 text-center bg-card/40 rounded-xl border border-dashed border-border">
              <Users className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm font-medium">No customers found.</p>
            </div>
          )}
        </div>

        <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Customer</th>
                  <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Category</th>
                  <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Vehicle</th>
                  <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Contact Number</th>
                  <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Email</th>
                  <th className="text-left px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Address</th>
                  <th className="text-right px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] leading-none">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map(({ customer, meta }) => {
                  const fullName = `${customer.firstName} ${customer.lastName || ''}`.trim();
                  const address = [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', ');
                  return (
                    <tr key={customer.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-bold text-foreground text-sm tracking-tight">{fullName}</td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 rounded-md text-[10px] font-black uppercase bg-primary/10 text-primary border border-primary/20 shadow-sm">
                          {meta.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-foreground">{meta.vehicleLabel || '-'}</td>
                      <td className="px-6 py-4 text-sm text-foreground">{customer.phone || '-'}</td>
                      <td className="px-6 py-4 text-sm text-foreground">{customer.email || '-'}</td>
                      <td className="px-6 py-4 text-xs text-muted-foreground max-w-[320px] truncate">{address || '-'}</td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditCustomerForm(customer)}
                          className="h-8 w-8 text-primary hover:bg-primary/10"
                          aria-label={`Edit ${fullName}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => openDocumentDialog(customer)}
                          className="h-8 w-8 text-primary hover:bg-primary/10"
                          aria-label={`Upload document for ${fullName}`}
                        >
                          <FileUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setDetailCustomer(customer)}
                          className="h-8 w-8 text-primary hover:bg-primary/10"
                          aria-label={`View details for ${fullName}`}
                        >
                          <Users className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredCustomers.length === 0 && (
            <div className="py-16 text-center text-muted-foreground text-sm font-medium">No customers found.</div>
          )}
        </div>
      </div>

      <Dialog open={formOpen} onOpenChange={(open) => !open && closeCustomerForm()}>
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-foreground">
              {selectedCustomer ? 'Edit Customer' : 'Add Customer'}
            </DialogTitle>
            <DialogDescription>
              Save customer details, category, and the inventory vehicle they are connected to.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveCustomer} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">First Name</Label>
                <Input value={customerForm.firstName} onChange={(event) => setCustomerForm({ ...customerForm, firstName: event.target.value })} required className="bg-muted/30 border-border h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Last Name</Label>
                <Input value={customerForm.lastName} onChange={(event) => setCustomerForm({ ...customerForm, lastName: event.target.value })} className="bg-muted/30 border-border h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Contact Number</Label>
                <Input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} placeholder="Phone Number" className="bg-muted/30 border-border h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Email</Label>
                <Input type="email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} placeholder="customer@email.com" className="bg-muted/30 border-border h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Category</Label>
                <Select value={customerForm.category} onValueChange={(value: CustomerCategory) => setCustomerForm({ ...customerForm, category: value })}>
                  <SelectTrigger className="bg-muted/30 border-border h-11">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Search Inventory Vehicle</Label>
                <Input value={vehicleSearch} onChange={(event) => setVehicleSearch(event.target.value)} placeholder="Search VIN, make, model..." className="bg-muted/30 border-border h-11" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Linked Vehicle</Label>
                <Select value={customerForm.vehicleId} onValueChange={(value) => setCustomerForm({ ...customerForm, vehicleId: value })}>
                  <SelectTrigger className="bg-muted/30 border-border h-11">
                    <SelectValue placeholder="Select vehicle from inventory" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_VEHICLE}>No linked vehicle</SelectItem>
                    {filteredVehicleOptions.map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        {getVehicleLabel(vehicle)} - {vehicle.vin} - {vehicle.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Address</Label>
                <Input value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} placeholder="Street Address" className="bg-muted/30 border-border h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">City</Label>
                <Input value={customerForm.city} onChange={(event) => setCustomerForm({ ...customerForm, city: event.target.value })} className="bg-muted/30 border-border h-11" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">State</Label>
                  <Input value={customerForm.state} onChange={(event) => setCustomerForm({ ...customerForm, state: event.target.value.toUpperCase() })} maxLength={2} className="bg-muted/30 border-border h-11" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Zip</Label>
                  <Input value={customerForm.zip} onChange={(event) => setCustomerForm({ ...customerForm, zip: event.target.value })} className="bg-muted/30 border-border h-11" />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={closeCustomerForm} className="font-bold uppercase tracking-widest text-[10px]">
                Cancel
              </Button>
              <Button type="submit" disabled={savingCustomer} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest px-8 shadow-lg shadow-primary/20">
                {savingCustomer ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Customer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={docDialogOpen} onOpenChange={(open) => !open && setDocDialogOpen(false)}>
        <DialogContent className="sm:max-w-[640px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-foreground">Customer Documents</DialogTitle>
            <DialogDescription>
              {docCustomer ? `Upload documents for ${docCustomer.firstName} ${docCustomer.lastName || ''}` : 'Upload documents'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Document Name</Label>
                <Input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="ID Proof / Agreement / License..." className="bg-muted/30 border-border h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">File</Label>
                <Input type="file" onChange={(e) => setDocFile(e.target.files?.[0] || null)} className="bg-muted/30 border-border h-11" />
              </div>
            </div>
            <Button onClick={handleUploadCustomerDocument} disabled={isUploadingCustomerDocument} className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest text-[10px]">
              {isUploadingCustomerDocument ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileUp className="w-4 h-4 mr-2" />}
              Upload Document
            </Button>

            <div className="rounded-lg border border-border">
              <div className="px-3 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground border-b border-border">Stored Documents</div>
              <div className="max-h-56 overflow-y-auto">
                {customerDocs.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">No documents uploaded for this customer.</p>
                ) : (
                  customerDocs.map((doc) => (
                    <div key={doc.id} className="px-3 py-2 border-b border-border last:border-0 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{doc.documentName}</p>
                        <p className="text-xs text-muted-foreground truncate">{doc.fileName}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-[10px] font-black uppercase tracking-widest"
                        onClick={() => {
                          const iframe = document.createElement('iframe');
                          iframe.style.display = 'none';
                          iframe.src = apiUrl(`/customers/documents/${doc.id}/download?token=${encodeURIComponent(token || '')}`);
                          document.body.appendChild(iframe);
                          setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe); }, 60000);
                        }}
                      >
                        Download
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      <CustomerDetailDialog 
        customerId={detailCustomer?.id || null} 
        open={!!detailCustomer} 
        onOpenChange={(open) => !open && setDetailCustomer(null)} 
      />
    </AppLayout>
  );
}
