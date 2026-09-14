-- CreateTable
CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "externalInvoiceNumber" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_externalInvoiceNumber_key" ON "sales_orders"("externalInvoiceNumber");

-- CreateIndex
CREATE INDEX "sales_orders_externalInvoiceNumber_idx" ON "sales_orders"("externalInvoiceNumber");

-- CreateIndex
CREATE INDEX "sales_orders_orderDate_idx" ON "sales_orders"("orderDate");
