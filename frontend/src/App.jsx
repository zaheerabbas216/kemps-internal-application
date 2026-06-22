import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Customer from './pages/Customer';
import CompanyDetails from './pages/CompanyDetails';
import ProductMaster from './pages/ProductMaster';
import Expense from './pages/Expense';
import ExpenseHistory from './pages/ExpenseHistory';
import Inventory from './pages/Inventory';
import InventoryHistory from './pages/InventoryHistory';
import StockCorrection from './pages/StockCorrection';
import StockCorrectionHistory from './pages/StockCorrectionHistory';
import SupplierPayments from './pages/SupplierPayments';
import PetBottle from './pages/PetBottle';
import PetBottleHistory from './pages/PetBottleHistory';
import Production from './pages/Production';
import ProductionHistory from './pages/ProductionHistory';
import Billing from './pages/Billing';
import BillingForm from './pages/BillingForm';
import BillingHistory from './pages/BillingHistory';
import CreditBalance from './pages/CreditBalance';
import CreditHistory from './pages/CreditHistory';
import Login from './pages/Login';
import Loading from './pages/Loading';
import SalesReturn from './pages/SalesReturn';
import Orders from './pages/Orders';
import DistributionOrder from './pages/DistributionOrder';
import RawMaterialLedger from './pages/RawMaterialLedger';
import GoodsLedger from './pages/GoodsLedger';
import CanSupply from './pages/CanSupply';
import CanDepositLedger from './pages/CanDepositLedger';
import BankDeposit from './pages/BankDeposit';
import BankDepositHistory from './pages/BankDepositHistory';
import MaintenanceForm from './pages/MaintenanceForm';
import MaintenanceHistory from './pages/MaintenanceHistory';
import Dashboard from './pages/Dashboard';
import TotalSales from './pages/TotalSales';
import PaymentApproval from './pages/PaymentApproval';
import CostingMaster from './pages/CostingMaster';
import UserAuthentication from './pages/UserAuthentication';
import AccountsLedger from './pages/AccountsLedger';
import SupplierLedger from './pages/SupplierLedger';

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
            <Route path="/costing-master" element={<CostingMaster />} />
            
            {/* Admin only routes */}
            <Route element={<AdminRoute />}>
              <Route path="/payment-approval" element={<PaymentApproval />} />
              <Route path="/user-authentication" element={<UserAuthentication />} />
            </Route>
            <Route path="*" element={<div className="p-8">Page under construction...</div>} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

