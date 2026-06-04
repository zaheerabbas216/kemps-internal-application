import express from 'express';
import cors from 'cors';
import customerRoutes from './routes/customer.js';
import companyDetailsRoutes from './routes/companyDetails.js';
import rawMaterialsRoutes from './routes/rawMaterials.js';
import finishedProductsRoutes from './routes/finishedProducts.js';

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/customers', customerRoutes);
app.use('/api/company-details', companyDetailsRoutes);
app.use('/api/raw-materials', rawMaterialsRoutes);
app.use('/api/finished-products', finishedProductsRoutes);

// Database connection test can happen in server.js
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ ok: false, error: err.message || 'Server error' });
});

export default app;
