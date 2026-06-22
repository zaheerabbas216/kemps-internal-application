import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customer.js';
import companyDetailsRoutes from './routes/companyDetails.js';
import rawMaterialsRoutes from './routes/rawMaterials.js';
import finishedProductsRoutes from './routes/finishedProducts.js';
import expenseRoutes from './routes/expense.js';
import inventoryRoutes from './routes/inventory.js';
import supplierPaymentsRoutes from './routes/supplierPayments.js';
import petBottleRoutes from './routes/petBottle.js';
import productionRoutes from './routes/production.js';
import billingRoutes from './routes/billing.js';
import creditBalanceRoutes from './routes/creditBalance.js';
import loadingRoutes from './routes/loading.js';
import salesReturnRoutes from './routes/salesReturn.js';
import orderRoutes from './routes/order.js';
import rawMaterialLedgerRoutes from './routes/rawMaterialLedger.js';
import goodsLedgerRoutes from './routes/goodsLedger.js';
import canSupplyRoutes from './routes/canSupply.js';
import canDepositRoutes from './routes/canDeposit.js';
import bankDepositRoutes from './routes/bankDeposit.js';
import maintenanceRoutes from './routes/maintenance.js';
import taskRoutes from './routes/tasks.js';
import salesReportRoutes from './routes/salesReport.js';
import paymentApprovalRoutes from './routes/paymentApproval.js';
import costingRoutes from './routes/costing.js';
import authMiddleware from './middleware/auth.js';

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', authMiddleware, customerRoutes);
app.use('/api/company-details', authMiddleware, companyDetailsRoutes);
app.use('/api/raw-materials', authMiddleware, rawMaterialsRoutes);
app.use('/api/finished-products', authMiddleware, finishedProductsRoutes);
app.use('/api/expenses', authMiddleware, expenseRoutes);
app.use('/api/inventory', authMiddleware, inventoryRoutes);
app.use('/api/supplier-payments', authMiddleware, supplierPaymentsRoutes);
app.use('/api/pet-bottle', authMiddleware, petBottleRoutes);
app.use('/api/production', authMiddleware, productionRoutes);
app.use('/api/billing', authMiddleware, billingRoutes);
app.use('/api/credit-balance', authMiddleware, creditBalanceRoutes);
app.use('/api/loading', authMiddleware, loadingRoutes);
app.use('/api/sales-return', authMiddleware, salesReturnRoutes);
app.use('/api/orders', authMiddleware, orderRoutes);
app.use('/api/raw-material-ledger', rawMaterialLedgerRoutes);
app.use('/api/goods-ledger', authMiddleware, goodsLedgerRoutes);
app.use('/api/can-supply', authMiddleware, canSupplyRoutes);
app.use('/api/can-deposit', authMiddleware, canDepositRoutes);
app.use('/api/bank-deposits', authMiddleware, bankDepositRoutes);
app.use('/api/maintenance', authMiddleware, maintenanceRoutes);
app.use('/api/tasks', authMiddleware, taskRoutes);
app.use('/api/sales-report', authMiddleware, salesReportRoutes);
app.use('/api/payment-approval', authMiddleware, paymentApprovalRoutes);
app.use('/api/costing', authMiddleware, costingRoutes);

// Database connection test can happen in server.js
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ ok: false, error: err.message || 'Server error' });
});

export default app;
