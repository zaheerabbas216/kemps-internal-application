import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import Layout from './components/layout/Layout';
import { useAuth } from './context/AuthContext';

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
const OrderDetails = lazy(() => import('./pages/OrderDetails'));
const DistributionOrder = lazy(() => import('./pages/DistributionOrder'));
const RawMaterialLedger = lazy(() => import('./pages/RawMaterialLedger'));
const RawMaterialHistory = lazy(() => import('./pages/RawMaterialHistory'));
const GoodsLedger = lazy(() => import('./pages/GoodsLedger'));
const GoodsHistory = lazy(() => import('./pages/GoodsHistory'));
const CanSupply = lazy(() => import('./pages/CanSupply'));
const CanDepositLedger = lazy(() => import('./pages/CanDepositLedger'));
const BankDeposit = lazy(() => import('./pages/BankDeposit'));
const BankDepositHistory = lazy(() => import('./pages/BankDepositHistory'));
const MaintenanceForm = lazy(() => import('./pages/MaintenanceForm'));
const MaintenanceHistory = lazy(() => import('./pages/MaintenanceHistory'));
const MaintenanceMaster = lazy(() => import('./pages/MaintenanceMaster'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const StockDashboard = lazy(() => import('./pages/StockDashboard'));
const ProductionDashboard = lazy(() => import('./pages/ProductionDashboard'));
const SundayDashboard = lazy(() => import('./pages/SundayDashboard'));
const TotalSales = lazy(() => import('./pages/TotalSales'));
const UserAuthentication = lazy(() => import('./pages/UserAuthentication'));
const AccountsLedger = lazy(() => import('./pages/AccountsLedger'));
const SupplierLedger = lazy(() => import('./pages/SupplierLedger'));
const CashLedger = lazy(() => import('./pages/CashLedger'));
const Timer = lazy(() => import('./pages/Timer'));
const TimerHistory = lazy(() => import('./pages/TimerHistory'));
const SundayLoading = lazy(() => import('./pages/SundayLoading'));
const SundayLoadingHistory = lazy(() => import('./pages/SundayLoadingHistory'));
const RolePermissions = lazy(() => import('./pages/RolePermissions'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const PaymentApproval = lazy(() => import('./pages/PaymentApproval'));

// ─────────────────────────────────────────────
// Route guard: must be logged in
// ─────────────────────────────────────────────
const ProtectedRoute = () => {
  const isLoggedIn = localStorage.getItem('kemps_logged_in') === 'true';
  return isLoggedIn ? <Outlet /> : <Navigate to="/login" replace />;
};

// ─────────────────────────────────────────────
// Route guard: redirect logged-in users away from login page
// ─────────────────────────────────────────────
const LoginRoute = () => {
  const isLoggedIn = localStorage.getItem('kemps_logged_in') === 'true';
  const { getFirstPermittedPath } = useAuth();
  return isLoggedIn ? <Navigate to={getFirstPermittedPath()} replace /> : <Login />;
};

// ─────────────────────────────────────────────
// Route guard: superadmin only
// ─────────────────────────────────────────────
const AdminRoute = () => {
  const { isSuperAdmin, getFirstPermittedPath } = useAuth();
  return isSuperAdmin ? <Outlet /> : <Navigate to={getFirstPermittedPath()} replace />;
};

// ─────────────────────────────────────────────
// Route guard: permission-based (canRead check)
// Props: module (string), children
// ─────────────────────────────────────────────
const PermissionRoute = ({ module, children }) => {
  const { isSuperAdmin, canRead, getFirstPermittedPath } = useAuth();
  const location = useLocation();

  if (isSuperAdmin || canRead(module)) {
    return children;
  }
  return <Navigate to={getFirstPermittedPath()} replace state={{ from: location, denied: true }} />;
};

// ─────────────────────────────────────────────
// Route guard: root redirect to first permitted route
// ─────────────────────────────────────────────
const HomeRedirect = () => {
  const { getFirstPermittedPath } = useAuth();
  return <Navigate to={getFirstPermittedPath()} replace />;
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

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<HomeRedirect />} />

              {/* Dashboards — permission gated */}
              <Route path="/dashboard"            element={<PermissionRoute module="dashboard"><Dashboard /></PermissionRoute>} />
              <Route path="/stock-dashboard"      element={<PermissionRoute module="stock-dashboard"><StockDashboard /></PermissionRoute>} />
              <Route path="/production-dashboard" element={<PermissionRoute module="production-dashboard"><ProductionDashboard /></PermissionRoute>} />
              <Route path="/sunday-dashboard"     element={<PermissionRoute module="sunday-dashboard"><SundayDashboard /></PermissionRoute>} />

              {/* Change password — all logged-in users */}
              <Route path="/change-password" element={<ChangePassword />} />

              {/* Permission-gated routes */}
              <Route path="/customer"           element={<PermissionRoute module="customer"><Customer /></PermissionRoute>} />
              <Route path="/company-details"    element={<PermissionRoute module="company-details"><CompanyDetails /></PermissionRoute>} />
              <Route path="/product-master"     element={<PermissionRoute module="product-master"><ProductMaster /></PermissionRoute>} />
              <Route path="/expense"            element={<PermissionRoute module="expense"><Expense /></PermissionRoute>} />
              <Route path="/expense-history"    element={<PermissionRoute module="expense"><ExpenseHistory /></PermissionRoute>} />
              <Route path="/inventory"          element={<PermissionRoute module="inventory"><Inventory /></PermissionRoute>} />
              <Route path="/inventory-history"  element={<PermissionRoute module="inventory"><InventoryHistory /></PermissionRoute>} />
              <Route path="/stock-correction"         element={<PermissionRoute module="stock-correction"><StockCorrection /></PermissionRoute>} />
              <Route path="/stock-correction-history" element={<PermissionRoute module="stock-correction"><StockCorrectionHistory /></PermissionRoute>} />
              <Route path="/supplier-payments"  element={<PermissionRoute module="supplier-payments"><SupplierPayments /></PermissionRoute>} />
              <Route path="/pet-bottle"         element={<PermissionRoute module="pet-bottle"><PetBottle /></PermissionRoute>} />
              <Route path="/pet-bottle-history" element={<PermissionRoute module="pet-bottle"><PetBottleHistory /></PermissionRoute>} />
              <Route path="/production-form"    element={<PermissionRoute module="production"><Production /></PermissionRoute>} />
              <Route path="/production-history" element={<PermissionRoute module="production"><ProductionHistory /></PermissionRoute>} />
              <Route path="/billing"            element={<PermissionRoute module="billing"><Billing /></PermissionRoute>} />
              <Route path="/billing-form"       element={<PermissionRoute module="billing"><BillingForm /></PermissionRoute>} />
              <Route path="/billing-history"    element={<PermissionRoute module="billing"><BillingHistory /></PermissionRoute>} />
              <Route path="/credit-balance"     element={<PermissionRoute module="credit-balance"><CreditBalance /></PermissionRoute>} />
              <Route path="/credit-history"     element={<PermissionRoute module="credit-balance"><CreditHistory /></PermissionRoute>} />
              <Route path="/accounts-ledger"    element={<PermissionRoute module="accounts-ledger"><AccountsLedger /></PermissionRoute>} />
              <Route path="/supplier-ledger"    element={<PermissionRoute module="supplier-ledger"><SupplierLedger /></PermissionRoute>} />
              <Route path="/cash-ledger"        element={<PermissionRoute module="cash-ledger"><CashLedger /></PermissionRoute>} />
              <Route path="/loading"            element={<PermissionRoute module="loading"><Loading /></PermissionRoute>} />
              <Route path="/sales-return"       element={<PermissionRoute module="sales-return"><SalesReturn /></PermissionRoute>} />
              <Route path="/orders"             element={<PermissionRoute module="orders"><Orders /></PermissionRoute>} />
              <Route path="/order-details"      element={<PermissionRoute module="order-details"><OrderDetails /></PermissionRoute>} />
              <Route path="/distribution-order" element={<PermissionRoute module="distribution-order"><DistributionOrder /></PermissionRoute>} />
              <Route path="/do-order-view"      element={<PermissionRoute module="distribution-order"><DistributionOrder /></PermissionRoute>} />
              <Route path="/raw-material-ledger"  element={<PermissionRoute module="raw-material-ledger"><RawMaterialLedger /></PermissionRoute>} />
              <Route path="/raw-material-history" element={<PermissionRoute module="raw-material-ledger"><RawMaterialHistory /></PermissionRoute>} />
              <Route path="/goods-ledger"       element={<PermissionRoute module="goods-ledger"><GoodsLedger /></PermissionRoute>} />
              <Route path="/goods-history"      element={<PermissionRoute module="goods-history"><GoodsHistory /></PermissionRoute>} />
              <Route path="/can-supply"         element={<PermissionRoute module="can-supply"><CanSupply /></PermissionRoute>} />
              <Route path="/can-deposit"        element={<PermissionRoute module="can-deposit"><CanDepositLedger /></PermissionRoute>} />
              <Route path="/bank-deposit"         element={<PermissionRoute module="bank-deposit"><BankDeposit /></PermissionRoute>} />
              <Route path="/bank-deposit-history" element={<PermissionRoute module="bank-deposit"><BankDepositHistory /></PermissionRoute>} />
              <Route path="/maintenance-form"    element={<PermissionRoute module="maintenance-form"><MaintenanceForm /></PermissionRoute>} />
              <Route path="/maintenance-history" element={<PermissionRoute module="maintenance-history"><MaintenanceHistory /></PermissionRoute>} />
              <Route path="/maintenance-master"  element={<PermissionRoute module="maintenance-master"><MaintenanceMaster /></PermissionRoute>} />
              <Route path="/timer"              element={<PermissionRoute module="timer"><Timer /></PermissionRoute>} />
              <Route path="/timer-history"      element={<PermissionRoute module="timer"><TimerHistory /></PermissionRoute>} />
              <Route path="/total-sales"        element={<PermissionRoute module="total-sales"><TotalSales /></PermissionRoute>} />
              <Route path="/payment-approval"   element={<PermissionRoute module="payment-approval"><PaymentApproval /></PermissionRoute>} />
              <Route path="/sunday-loading"         element={<PermissionRoute module="sunday-loading"><SundayLoading /></PermissionRoute>} />
              <Route path="/sunday-loading-history" element={<PermissionRoute module="sunday-loading-history"><SundayLoadingHistory /></PermissionRoute>} />

              {/* Admin Console — superadmin only */}
              <Route element={<AdminRoute />}>
                <Route path="/user-authentication" element={<UserAuthentication />} />
                <Route path="/admin/roles"         element={<RolePermissions />} />
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
