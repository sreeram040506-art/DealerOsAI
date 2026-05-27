export type VehicleStatus = 'Available' | 'Reserved' | 'Sold' | 'Returned';
export type PaymentMethod = 'Cash' | 'Check' | 'Bank Transfer' | 'Loan';
export type PurchaseSource = 'Dealer' | 'Auction' | 'Individual';

export interface Vehicle {
  id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  color: string;
  purchaseDate: string;
  purchasedFrom: PurchaseSource;
  purchasePrice: number;
  paymentMethod: string;
  transportCost: number;
  repairCost: number;
  inspectionCost: number;
  registrationCost: number;
  totalPurchaseCost: number;
  status: VehicleStatus;
  titleNumber?: string;
  daysInInventory: number;
  documentBase64?: string | null;
  hasDocument?: boolean;
  hasSourceDocument?: boolean;
  hasBillOfSale?: boolean;
  purchase?: {
    id: string;
    sellerName: string;
    sellerAddress?: string;
    sellerCity?: string;
    sellerState?: string;
    sellerZip?: string;
    purchasePrice: number;
    transportCost: number;
    inspectionCost: number;
    registrationCost: number;
    totalPurchaseCost: number;
    purchaseDate: string;
  };
  repairs?: Repair[];
  customerNotes?: CustomerNote[];
}

export interface CustomerNote {
  id: string;
  vehicleId: string;
  customerName: string;
  phone: string;
  email?: string;
  note: string;
  createdAt: string;
}

export interface ExtractedVehicleDocumentInfo extends Partial<Vehicle> {
  usedVehicleSourceName?: string;
  usedVehicleSourceAddress?: string;
  usedVehicleSourceCity?: string;
  usedVehicleSourceState?: string;
  usedVehicleSourceZipCode?: string;
  // Disposition details
  disposedTo?: string;
  disposedAddress?: string;
  disposedCity?: string;
  disposedState?: string;
  disposedZip?: string;
  disposedDate?: string;
  disposedPrice?: number;
  disposedOdometer?: number;
  disposedDlNumber?: string;
  disposedDlState?: string;
}

export interface LoanDetails {
  financeCompany: string;
  downPayment: number;
  loanAmount: number;
  interestRate: number;
  loanTerm: number;
  monthlyPayment: number;
}

export interface Sale {
  id: string;
  vehicleId: string;
  vehicle?: Vehicle; // Nested vehicle object
  customerName: string;
  email?: string;
  phone: string;
  address: string;
  driverLicense?: string;
  saleDate: string;
  salePrice: number;
  paymentMethod: PaymentMethod;
  loanDetails?: LoanDetails;
  profit: number;
  hasBillOfSale?: boolean;
  billOfSaleBase64?: string | null;
}

export interface AdvertisingExpense {
  id: string;
  campaignName: string;
  platform: string;
  startDate: string;
  endDate: string;
  amountSpent: number;
  budgetLimit?: number;
  status?: string;
  adCopy?: string;
  linkedVehicleId?: string;
}

export interface BusinessExpense {
  id: string;
  category: string;
  amount: number;
  date: string;
  notes?: string;
}

export interface Repair {
  id: string;
  vehicleId: string;
  repairShop: string;
  partsCost: number;
  laborCost: number;
  description?: string;
  documentBase64?: string | null;
  sourceFileName?: string | null;
  repairDate: string;
}
