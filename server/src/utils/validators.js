import { z } from 'zod';

export const vehicleSchema = z.object({
  vin: z.string().min(1, "VIN is required"),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.number().or(z.string().transform(Number)).refine((y) => !isNaN(y), "Invalid year"),
  mileage: z.number().or(z.string().transform(Number)).refine((m) => !isNaN(m), "Invalid mileage"),
  color: z.string().min(1, "Color is required"),
  purchaseDate: z.string().datetime().or(z.date()).or(z.string().refine((d) => !isNaN(Date.parse(d)), "Invalid date format")),
  purchasedFrom: z.string().min(1, "Seller name is required"),
  purchasePrice: z.number().or(z.string().transform(Number)),
  paymentMethod: z.string().min(1, "Payment method is required"),
  titleNumber: z.string().optional().nullable(),
  transportCost: z.number().or(z.string().transform(Number)).optional().default(0),
  buyerFee: z.number().or(z.string().transform(Number)).optional().default(0),
  inspectionCost: z.number().or(z.string().transform(Number)).optional().default(0),
  registrationCost: z.number().or(z.string().transform(Number)).optional().default(0),
  repairCost: z.number().or(z.string().transform(Number)).optional().default(0),
  documentBase64: z.string().optional().nullable(),
});

export const saleSchema = z.object({
  vehicleId: z.string().length(24, "Invalid vehicle ID format"),
  saleDate: z.string().or(z.date()).refine((d) => !isNaN(Date.parse(d)), "Invalid date format"),
  salePrice: z.number().or(z.string().transform(Number)),
  customerName: z.string().min(1, "Customer name is required"),
  email: z.string().email("Invalid email").optional().nullable().or(z.literal('')),
  phone: z.string().min(1, "Phone is required"),
  address: z.string().min(1, "Address is required"),
  driverLicense: z.string().optional().nullable(),
  paymentMethod: z.string().min(1, "Payment method is required"),
  financeCompany: z.string().optional().nullable(),
  downPayment: z.number().or(z.string().transform(Number)).optional().nullable(),
  loanAmount: z.number().or(z.string().transform(Number)).optional().nullable(),
  interestRate: z.number().or(z.string().transform(Number)).optional().nullable(),
  loanTerm: z.number().or(z.string().transform(Number)).optional().nullable(),
  monthlyPayment: z.number().or(z.string().transform(Number)).optional().nullable(),
});

export const expenseSchema = z.object({
  category: z.string().min(1, "Category is required"),
  amount: z.number().or(z.string().transform(Number)),
  date: z.string().or(z.date()).refine((d) => !isNaN(Date.parse(d)), "Invalid date format"),
  notes: z.string().optional().nullable(),
});

export const advertisingSchema = z.object({
  campaignName: z.string().min(1, "Campaign name is required"),
  platform: z.string().min(1, "Platform is required"),
  startDate: z.string().or(z.date()).refine((d) => !isNaN(Date.parse(d)), "Invalid start date"),
  endDate: z.string().or(z.date()).refine((d) => !isNaN(Date.parse(d)), "Invalid end date"),
  amountSpent: z.number().or(z.string().transform(Number)),
  budgetLimit: z.number().or(z.string().transform(Number)).optional().nullable(),
  status: z.string().optional().nullable(),
  adCopy: z.string().optional().nullable(),
  linkedVehicleId: z.string().length(24, "Invalid vehicle ID").optional().nullable(),
});

export const validate = (schema) => (req, res, next) => {
  try {
    const validData = schema.parse(req.body);
    req.body = validData;
    next();
  } catch (error) {
    const errors = error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    res.status(400).json({ message: 'Validation Error', errors });
  }
};
