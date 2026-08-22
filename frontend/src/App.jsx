import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/layout/Layout';

// Lazy load pages for code-splitting and performance
const Customer = lazy(() => import('./pages/Customer'));
const CompanyDetails = lazy(() => import('./pages/CompanyDetails'));
const ProductMaster = lazy(() => import('./pages/ProductMaster'));
const Expense = lazy(() => import('./pages/Expense'));
const ExpenseHistory = lazy(() => import('./pages/ExpenseHistory'));
const Inventory = lazy(() => import('./pages/Inventory'));
const InventoryHistory = lazy(() => import('./pages/InventoryHistory'));
const StockCorrection = lazy(() => import('./pages/StockCorrection'));
const StockCorrectionHistory = lazy(() => import('./pages/StockCorrectionHistory'));
const SupplierPayments = lazy(() => import('./pages/SupplierPayments'));
const PetBottle = lazy(() => import('./pages/PetBottle'));
const PetBottleHistory = lazy(() => import('./pages/PetBottleHistory'));
const Production = lazy(() => import('./pages/Production'));
const ProductionHistory = lazy(() => import('./pages/ProductionHistory'));
const Billing = lazy(() => import('./pages/Billing'));
const BillingForm = lazy(() => import('./pages/BillingForm'));
const BillingHistory = lazy(() => import('./pages/BillingHistory'));
const CreditBalance = lazy(() => import('./pages/CreditBalance'));
const CreditHistory = lazy(() => import('./pages/CreditHistory'));
const Login = lazy(() => import('./pages/Login'));
const Loading = lazy(() => import('./pages/Loading'));
const SalesReturn = lazy(() => import('./pages/SalesReturn'));
const Orders = lazy(() => import('./pages/Orders'));
const DistributionOrder = lazy(() => import('./pages/DistributionOrder'));
const RawMaterialLedger = lazy(() => import('./pages/RawMaterialLedger'));
const GoodsLedger = lazy(() => import('./pages/GoodsLedger'));
const CanSupply = lazy(() => import('./pages/CanSupply'));
const CanDepositLedger = lazy(() => import('./pages/CanDepositLedger'));
const BankDeposit = lazy(() => import('./pages/BankDeposit'));
const BankDepositHistory = lazy(() => import('./pages/BankDepositHistory'));
const MaintenanceForm = lazy(() => import('./pages/MaintenanceForm'));
const MaintenanceHistory = lazy(() => import('./pages/MaintenanceHistory'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TotalSales = lazy(() => import('./pages/TotalSales'));
const UserAuthentication = lazy(() => import('./pages/UserAuthentication'));
const AccountsLedger = lazy(() => import('./pages/AccountsLedger'));
const SupplierLedger = lazy(() => import('./pages/SupplierLedger'));
const CashLedger = lazy(() => import('./pages/CashLedger'));

// Route guard for authenticated pages
const ProtectedRoute = () => {
  const isLoggedIn = localStorage.getItem('kemps_logged_in') === 'true';
  return isLoggedIn ? <Outlet /> : <Navigate to="/login" replace />;
};

// Route guard to prevent logged-in users from seeing the Login page again
const LoginRoute = () => {
  const isLoggedIn = localStorage.getItem('kemps_logged_in') === 'true';
  return isLoggedIn ? <Navigate to="/dashboard" replace /> : <Login />;
};

// Route guard for admin-only pages
const AdminRoute = () => {
  const isAdmin = localStorage.getItem('kemps_username')?.toLowerCase() === 'admin';
  return isAdmin ? <Outlet /> : <Navigate to="/dashboard" replace />;
};

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen bg-base-100">
          <span className="loading loading-spinner loading-lg text-primary"></span>
        </div>
      }>
        <Routes>
          {/* Public / Auth routes */}
          <Route path="/login" element={<LoginRoute />} />

          {/* Protected Dashboard routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/customer" element={<Customer />} />
              <Route path="/company-details" element={<CompanyDetails />} />
              <Route path="/product-master" element={<ProductMaster />} />
              <Route path="/expense" element={<Expense />} />
              <Route path="/expense-history" element={<ExpenseHistory />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/inventory-history" element={<InventoryHistory />} />
              <Route path="/stock-correction" element={<StockCorrection />} />
              <Route path="/stock-correction-history" element={<StockCorrectionHistory />} />
              <Route path="/supplier-payments" element={<SupplierPayments />} />
              <Route path="/pet-bottle" element={<PetBottle />} />
              <Route path="/pet-bottle-history" element={<PetBottleHistory />} />
              <Route path="/production-form" element={<Production />} />
              <Route path="/production-history" element={<ProductionHistory />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/billing-form" element={<BillingForm />} />
              <Route path="/billing-history" element={<BillingHistory />} />
              <Route path="/credit-balance" element={<CreditBalance />} />
              <Route path="/credit-history" element={<CreditHistory />} />
              <Route path="/accounts-ledger" element={<AccountsLedger />} />
              <Route path="/supplier-ledger" element={<SupplierLedger />} />
              <Route path="/cash-ledger" element={<CashLedger />} />
              <Route path="/loading" element={<Loading />} />
              <Route path="/sales-return" element={<SalesReturn />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/distribution-order" element={<DistributionOrder />} />
              <Route path="/do-order-view" element={<DistributionOrder />} />
              <Route path="/raw-material-ledger" element={<RawMaterialLedger />} />
              <Route path="/goods-ledger" element={<GoodsLedger />} />
              <Route path="/can-supply" element={<CanSupply />} />
              <Route path="/can-deposit" element={<CanDepositLedger />} />
              <Route path="/bank-deposit" element={<BankDeposit />} />
              <Route path="/bank-deposit-history" element={<BankDepositHistory />} />
              <Route path="/maintenance-form" element={<MaintenanceForm />} />
              <Route path="/maintenance-history" element={<MaintenanceHistory />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/total-sales" element={<TotalSales />} />

              {/* Admin only routes */}
              <Route element={<AdminRoute />}>
                <Route path="/user-authentication" element={<UserAuthentication />} />
              </Route>
              <Route path="*" element={<div className="p-8">Page under construction...</div>} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
