-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vin" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "mileage" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "purchaseDate" DATETIME NOT NULL,
    "purchasedFrom" TEXT NOT NULL,
    "purchasePrice" REAL NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "transportCost" REAL NOT NULL DEFAULT 0,
    "repairCost" REAL NOT NULL DEFAULT 0,
    "inspectionCost" REAL NOT NULL DEFAULT 0,
    "registrationCost" REAL NOT NULL DEFAULT 0,
    "totalPurchaseCost" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Available',
    "daysInInventory" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "driverLicense" TEXT,
    "saleDate" DATETIME NOT NULL,
    "salePrice" REAL NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "profit" REAL NOT NULL,
    "financeCompany" TEXT,
    "downPayment" REAL,
    "loanAmount" REAL,
    "interestRate" REAL,
    "loanTerm" INTEGER,
    "monthlyPayment" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sale_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdvertisingExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignName" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "amountSpent" REAL NOT NULL,
    "linkedVehicleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BusinessExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vin_key" ON "Vehicle"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_vehicleId_key" ON "Sale"("vehicleId");
