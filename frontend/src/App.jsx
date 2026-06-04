import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Customer from './pages/Customer';
import CompanyDetails from './pages/CompanyDetails';
import ProductMaster from './pages/ProductMaster';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/customer" replace />} />
          <Route path="/customer" element={<Customer />} />
          <Route path="/company-details" element={<CompanyDetails />} />
          <Route path="/product-master" element={<ProductMaster />} />
          <Route path="*" element={<div className="p-8">Page under construction...</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
