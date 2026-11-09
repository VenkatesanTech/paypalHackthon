CREATE TABLE "Invoice" (
 "id" TEXT NOT NULL PRIMARY KEY, "number" TEXT NOT NULL, "clientName" TEXT NOT NULL,
 "clientEmail" TEXT NOT NULL, "dueDate" DATETIME NOT NULL, "currency" TEXT NOT NULL DEFAULT 'USD',
 "notes" TEXT NOT NULL DEFAULT '', "items" TEXT NOT NULL, "totalCents" INTEGER NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'DRAFT', "paymentToken" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");
CREATE UNIQUE INDEX "Invoice_paymentToken_key" ON "Invoice"("paymentToken");
CREATE TABLE "Payment" (
 "id" TEXT NOT NULL PRIMARY KEY, "invoiceId" TEXT NOT NULL, "requestId" TEXT NOT NULL,
 "captureRequestId" TEXT NOT NULL, "paypalOrderId" TEXT, "captureId" TEXT,
 "status" TEXT NOT NULL DEFAULT 'CREATING', "amountCents" INTEGER NOT NULL, "currency" TEXT NOT NULL,
 "approvalUrl" TEXT, "leaseExpiresAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL,
 CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Payment_invoiceId_key" ON "Payment"("invoiceId");
CREATE UNIQUE INDEX "Payment_requestId_key" ON "Payment"("requestId");
CREATE UNIQUE INDEX "Payment_captureRequestId_key" ON "Payment"("captureRequestId");
CREATE UNIQUE INDEX "Payment_paypalOrderId_key" ON "Payment"("paypalOrderId");
CREATE UNIQUE INDEX "Payment_captureId_key" ON "Payment"("captureId");
