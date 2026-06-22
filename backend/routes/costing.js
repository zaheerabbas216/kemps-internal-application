import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// Helper: Recalculate finished product costs and log history
export async function recalculateFinishedProductCosts(connection) {
  // 1. Fetch all active costing configurations of raw materials
  const [rmCosts] = await connection.query(`
    SELECT 
      rm.id,
      COALESCE(rmc.use_purchase_cost, 1) AS use_purchase_cost,
      COALESCE(rmc.manual_cost, 0.0000) AS manual_cost
    FROM raw_materials rm
    LEFT JOIN raw_material_costs rmc ON rm.id = rmc.raw_material_id
  `);

  const rmCostMap = {};
  for (const rm of rmCosts) {
    if (rm.use_purchase_cost) {
      // Fetch latest purchase rate
      const [latest] = await connection.query(`
        SELECT bi.rate_per_unit 
        FROM inventory_bill_items bi
        JOIN inventory_bills b ON bi.bill_id = b.id
        WHERE bi.raw_material_id = ?
        ORDER BY b.bill_date DESC, bi.id DESC
        LIMIT 1
      `, [rm.id]);

      if (latest.length > 0) {
        rmCostMap[rm.id] = parseFloat(latest[0].rate_per_unit) || 0.0000;
      } else {
        // Fallback to manual cost if never purchased
        rmCostMap[rm.id] = parseFloat(rm.manual_cost) || 0.0000;
      }
    } else {
      rmCostMap[rm.id] = parseFloat(rm.manual_cost) || 0.0000;
    }
  }

  // 2. Fetch all finished product cost sheets
  const [costSheets] = await connection.query(`
    SELECT id, finished_product_id, total_cost FROM cost_sheets
  `);

  const todayStr = new Date().toISOString().split('T')[0];

  for (const sheet of costSheets) {
    // Fetch items in this cost sheet
    const [items] = await connection.query(`
      SELECT id, component_type, raw_material_id, quantity, cost_value 
      FROM cost_sheet_items 
      WHERE cost_sheet_id = ?
    `, [sheet.id]);

    let calculatedTotal = 0;

    for (const item of items) {
      let currentVal = 0;
      if (item.component_type === 'RAW_MATERIAL') {
        const rawMatCost = rmCostMap[item.raw_material_id] || 0.0000;
        currentVal = rawMatCost * parseFloat(item.quantity);
        // Update item cost value
        await connection.query(`
          UPDATE cost_sheet_items SET cost_value = ? WHERE id = ?
        `, [currentVal, item.id]);
      } else {
        // Overhead
        currentVal = parseFloat(item.cost_value) || 0.0000;
      }
      calculatedTotal += currentVal;
    }

    const oldTotal = parseFloat(sheet.total_cost) || 0.0000;
    const diff = Math.abs(calculatedTotal - oldTotal);

    if (diff > 0.0001) {
      // Log history
      await connection.query(`
        INSERT INTO cost_sheet_history (finished_product_id, change_date, old_cost, new_cost)
        VALUES (?, ?, ?, ?)
      `, [sheet.finished_product_id, todayStr, oldTotal, calculatedTotal]);

      // Update cost sheet total cost
      await connection.query(`
        UPDATE cost_sheets SET total_cost = ? WHERE id = ?
      `, [calculatedTotal, sheet.id]);
    }
  }
}

// GET /api/costing/raw-materials
// Fetch all raw materials with costing details
router.get('/raw-materials', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        rm.id, 
        rm.sub_product_name, 
        rm.unit, 
        rmc.name AS category_name,
        COALESCE(rmc_rule.use_purchase_cost, 1) AS use_purchase_cost,
        COALESCE(rmc_rule.manual_cost, 0.0000) AS manual_cost,
        (
          SELECT bi.rate_per_unit 
          FROM inventory_bill_items bi
          JOIN inventory_bills b ON bi.bill_id = b.id
          WHERE bi.raw_material_id = rm.id
          ORDER BY b.bill_date DESC, bi.id DESC
          LIMIT 1
        ) AS latest_purchase_rate
      FROM raw_materials rm
      JOIN raw_material_categories rmc ON rm.category_id = rmc.id
      LEFT JOIN raw_material_costs rmc_rule ON rm.id = rmc_rule.raw_material_id
      ORDER BY rmc.name ASC, rm.sub_product_name ASC
    `);

    // Format boolean values
    const formatted = rows.map(r => ({
      ...r,
      use_purchase_cost: !!r.use_purchase_cost,
      latest_purchase_rate: r.latest_purchase_rate !== null ? parseFloat(r.latest_purchase_rate) : null,
      manual_cost: parseFloat(r.manual_cost),
      effective_cost: r.use_purchase_cost && r.latest_purchase_rate !== null 
        ? parseFloat(r.latest_purchase_rate) 
        : parseFloat(r.manual_cost)
    }));

    res.json({ ok: true, materials: formatted });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/costing/raw-materials
// Save raw material costing configs
router.post('/raw-materials', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { configs } = req.body; // Array of { rawMaterialId, usePurchaseCost, manualCost }
    if (!configs || !Array.isArray(configs)) {
      throw new Error('Invalid configs data structure.');
    }

    for (const conf of configs) {
      const rmId = parseInt(conf.rawMaterialId, 10);
      const usePurchase = conf.usePurchaseCost ? 1 : 0;
      const mCost = parseFloat(conf.manualCost) || 0.0000;

      if (isNaN(rmId)) continue;

      await connection.query(`
        INSERT INTO raw_material_costs (raw_material_id, use_purchase_cost, manual_cost)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          use_purchase_cost = VALUES(use_purchase_cost), 
          manual_cost = VALUES(manual_cost)
      `, [rmId, usePurchase, mCost]);
    }

    // Recalculate
    await recalculateFinishedProductCosts(connection);

    await connection.commit();
    res.json({ ok: true, message: 'Raw material costing configurations updated successfully!' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/costing/templates
// Fetch all cost templates
router.get('/templates', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT id, name, components FROM cost_templates ORDER BY name ASC`);
    const formatted = rows.map(r => ({
      ...r,
      components: JSON.parse(r.components || '[]')
    }));
    res.json({ ok: true, templates: formatted });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/costing/templates
// Save or update template
router.post('/templates', async (req, res) => {
  try {
    const { id, name, components } = req.body;
    const nameTrimmed = String(name || '').trim();
    if (!nameTrimmed) throw new Error('Template name is required.');
    if (!components || !Array.isArray(components)) throw new Error('Components must be a list.');

    const componentsJson = JSON.stringify(components.map(c => String(c || '').trim()).filter(Boolean));

    if (id) {
      await pool.query(`
        UPDATE cost_templates SET name = ?, components = ? WHERE id = ?
      `, [nameTrimmed, componentsJson, id]);
    } else {
      await pool.query(`
        INSERT INTO cost_templates (name, components) VALUES (?, ?)
      `, [nameTrimmed, componentsJson]);
    }

    res.json({ ok: true, message: 'Cost template saved successfully!' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// DELETE /api/costing/templates/:id
router.delete('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM cost_templates WHERE id = ?`, [id]);
    res.json({ ok: true, message: 'Cost template deleted successfully!' });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/costing/sheets
// Fetch finished products with their costing summary
router.get('/sheets', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        fp.id, 
        fp.name, 
        fpc.name AS category_name,
        cs.id AS cost_sheet_id,
        COALESCE(cs.total_cost, 0.0000) AS total_cost,
        (SELECT COUNT(*) FROM cost_sheet_items WHERE cost_sheet_id = cs.id) AS component_count
      FROM finished_products fp
      LEFT JOIN finished_product_categories fpc ON fp.category_id = fpc.id
      LEFT JOIN cost_sheets cs ON fp.id = cs.finished_product_id
      WHERE fp.status = 1
      ORDER BY fpc.name ASC, fp.name ASC
    `);

    res.json({ ok: true, sheets: rows });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/costing/sheets/:productId
// Fetch detailed items of a specific cost sheet
router.get('/sheets/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const [sheetRows] = await pool.query(`
      SELECT id, finished_product_id, total_cost FROM cost_sheets WHERE finished_product_id = ?
    `, [productId]);

    if (sheetRows.length === 0) {
      return res.json({ ok: true, sheet: null, items: [] });
    }

    const [itemRows] = await pool.query(`
      SELECT 
        csi.id,
        csi.component_name,
        csi.component_type,
        csi.raw_material_id,
        rm.sub_product_name AS raw_material_name,
        rm.unit AS raw_material_unit,
        csi.quantity,
        csi.cost_value
      FROM cost_sheet_items csi
      LEFT JOIN raw_materials rm ON csi.raw_material_id = rm.id
      WHERE csi.cost_sheet_id = ?
    `, [sheetRows[0].id]);

    res.json({ 
      ok: true, 
      sheet: sheetRows[0], 
      items: itemRows.map(it => ({
        ...it,
        quantity: parseFloat(it.quantity),
        cost_value: parseFloat(it.cost_value)
      })) 
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// POST /api/costing/sheets
// Save costing sheet for a product
router.post('/sheets', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { productId, items } = req.body; // items is array of { componentName, componentType, rawMaterialId, quantity, costValue }
    if (!productId) throw new Error('Product ID is required.');
    if (!items || !Array.isArray(items)) throw new Error('Cost items list is required.');

    // 1. Create or get cost sheet
    await connection.query(`
      INSERT INTO cost_sheets (finished_product_id, total_cost)
      VALUES (?, 0.0000)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
    `, [productId]);

    // Get inserted ID
    const [sheetResult] = await connection.query(`SELECT LAST_INSERT_ID() as id`);
    const sheetId = sheetResult[0].id;

    // 2. Clear old items
    await connection.query(`DELETE FROM cost_sheet_items WHERE cost_sheet_id = ?`, [sheetId]);

    // 3. Insert items
    for (const it of items) {
      const compName = String(it.componentName || '').trim();
      const compType = it.componentType; // 'RAW_MATERIAL' or 'OVERHEAD'
      const rmId = compType === 'RAW_MATERIAL' ? parseInt(it.rawMaterialId, 10) : null;
      const qty = compType === 'RAW_MATERIAL' ? (parseFloat(it.quantity) || 0) : 1.0000;
      const costVal = compType === 'OVERHEAD' ? (parseFloat(it.costValue) || 0) : 0.0000;

      if (!compName) continue;

      await connection.query(`
        INSERT INTO cost_sheet_items (cost_sheet_id, component_name, component_type, raw_material_id, quantity, cost_value)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [sheetId, compName, compType, rmId, qty, costVal]);
    }

    // 4. Run recalculation
    await recalculateFinishedProductCosts(connection);

    await connection.commit();
    res.json({ ok: true, message: 'Cost sheet saved and product cost updated successfully!' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// POST /api/costing/bulk-assign
// Sets a component with specified cost to multiple products in bulk
router.post('/bulk-assign', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { productIds, componentName, componentType, rawMaterialId, quantity, costValue } = req.body;
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      throw new Error('Select at least one product.');
    }
    const compName = String(componentName || '').trim();
    if (!compName) throw new Error('Component Name is required.');
    if (!componentType) throw new Error('Component Type is required.');

    const qty = componentType === 'RAW_MATERIAL' ? (parseFloat(quantity) || 0) : 1.0000;
    const cVal = componentType === 'OVERHEAD' ? (parseFloat(costValue) || 0) : 0.0000;
    const rmId = componentType === 'RAW_MATERIAL' ? parseInt(rawMaterialId, 10) : null;

    for (const pId of productIds) {
      // 1. Create or get cost sheet
      await connection.query(`
        INSERT INTO cost_sheets (finished_product_id, total_cost)
        VALUES (?, 0.0000)
        ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
      `, [pId]);

      const [sheetResult] = await connection.query(`SELECT LAST_INSERT_ID() as id`);
      const sheetId = sheetResult[0].id;

      // 2. Check if component exists
      const [existing] = await connection.query(`
        SELECT id FROM cost_sheet_items WHERE cost_sheet_id = ? AND component_name = ?
      `, [sheetId, compName]);

      if (existing.length > 0) {
        // Update
        await connection.query(`
          UPDATE cost_sheet_items 
          SET component_type = ?, raw_material_id = ?, quantity = ?, cost_value = ? 
          WHERE id = ?
        `, [componentType, rmId, qty, cVal, existing[0].id]);
      } else {
        // Insert
        await connection.query(`
          INSERT INTO cost_sheet_items (cost_sheet_id, component_name, component_type, raw_material_id, quantity, cost_value)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [sheetId, compName, componentType, rmId, qty, cVal]);
      }
    }

    // 3. Recalculate
    await recalculateFinishedProductCosts(connection);

    await connection.commit();
    res.json({ ok: true, message: 'Bulk cost assignment completed successfully!' });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/costing/history
// Timeline log of cost sheet adjustments
router.get('/history', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        csh.id,
        DATE_FORMAT(csh.change_date, '%Y-%m-%d') as change_date,
        csh.finished_product_id,
        fp.name AS product_name,
        fpc.name AS category_name,
        csh.old_cost,
        csh.new_cost,
        csh.created_at
      FROM cost_sheet_history csh
      JOIN finished_products fp ON csh.finished_product_id = fp.id
      LEFT JOIN finished_product_categories fpc ON fp.category_id = fpc.id
      ORDER BY csh.created_at DESC
    `);
    res.json({ ok: true, history: rows });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/costing/analysis
// Product profit margins and stock value reports
router.get('/analysis', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        fp.id,
        fp.name AS product_name,
        fpc.name AS category_name,
        COALESCE(cs.total_cost, 0.0000) AS unit_cost,
        COALESCE(
          (SELECT SUM(sr.quantity) 
           FROM stock_register sr 
           WHERE sr.item_type = 'FINISHED_PRODUCT' AND sr.item_id = fp.id), 
          0
        ) AS stock_qty,
        COALESCE(
          (SELECT cbi.rate_with_tax / (1 + cbi.tax_percent/100)
           FROM customer_bill_items cbi
           JOIN customer_bills cb ON cbi.bill_id = cb.id
           WHERE cbi.finished_product_id = fp.id AND cb.payment_status = 'Approved'
           ORDER BY cb.billing_date DESC, cbi.id DESC
           LIMIT 1),
          0.00
        ) AS latest_selling_price,
        COALESCE(
          (SELECT SUM(cbi.quantity)
           FROM customer_bill_items cbi
           JOIN customer_bills cb ON cbi.bill_id = cb.id
           WHERE cbi.finished_product_id = fp.id AND cb.payment_status = 'Approved'),
          0
        ) AS sales_qty,
        COALESCE(
          (SELECT SUM(cbi.quantity * (cbi.rate_with_tax / (1 + cbi.tax_percent/100) - cbi.unit_cost))
           FROM customer_bill_items cbi
           JOIN customer_bills cb ON cbi.bill_id = cb.id
           WHERE cbi.finished_product_id = fp.id AND cb.payment_status = 'Approved'),
          0.00
        ) AS total_profit
      FROM finished_products fp
      LEFT JOIN finished_product_categories fpc ON fp.category_id = fpc.id
      LEFT JOIN cost_sheets cs ON fp.id = cs.finished_product_id
      WHERE fp.status = 1
      ORDER BY fpc.name ASC, fp.name ASC
    `);

    const formatted = rows.map(r => {
      const uCost = parseFloat(r.unit_cost) || 0;
      const sPrice = parseFloat(r.latest_selling_price) || 0;
      const sQty = parseFloat(r.stock_qty) || 0;
      const marginVal = sPrice - uCost;
      const marginPercent = sPrice > 0 ? (marginVal / sPrice) * 100 : 0;

      return {
        ...r,
        unit_cost: uCost,
        stock_qty: sQty,
        stock_value: sQty * uCost,
        latest_selling_price: sPrice,
        margin_value: marginVal,
        margin_percent: marginPercent,
        sales_qty: parseFloat(r.sales_qty) || 0,
        total_profit: parseFloat(r.total_profit) || 0
      };
    });

    res.json({ ok: true, analysis: formatted });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// GET /api/costing/pl
// Fetch Profit & Loss statement for date range
router.get('/pl', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      throw new Error('Start date and End date are required.');
    }

    // 1. Sales revenue and COGS from Approved invoices
    const [salesRows] = await pool.query(`
      SELECT 
        COALESCE(SUM(grand_total - total_tax), 0) AS sales_revenue,
        COALESCE(SUM(cogs), 0) AS sales_cogs
      FROM customer_bills
      WHERE billing_date BETWEEN ? AND ? AND payment_status = 'Approved'
    `, [startDate, endDate]);

    const salesRevenue = parseFloat(salesRows[0].sales_revenue) || 0;
    const salesCogs = parseFloat(salesRows[0].sales_cogs) || 0;

    // 2. Sales Returns deduction
    const [returnRows] = await pool.query(`
      SELECT 
        COALESCE(SUM(sri.quantity * (sri.rate_with_tax / (1 + sri.tax_percent/100))), 0) AS returned_revenue,
        COALESCE(SUM(sr.cogs), 0) AS returned_cogs
      FROM sales_returns sr
      JOIN sales_return_items sri ON sr.id = sri.sales_return_id
      WHERE sr.return_date BETWEEN ? AND ?
    `, [startDate, endDate]);

    const returnedRevenue = parseFloat(returnRows[0].returned_revenue) || 0;
    const returnedCogs = parseFloat(returnRows[0].returned_cogs) || 0;

    // 3. Net figures
    const netRevenue = salesRevenue - returnedRevenue;
    const netCogs = salesCogs - returnedCogs;
    const grossProfit = netRevenue - netCogs;

    // 4. Expenses (excluding credit notes double counts)
    const [expenseRows] = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total_expenses
      FROM expenses
      WHERE expense_date BETWEEN ? AND ? 
        AND payment_status = 'Approved'
        AND particulars NOT LIKE 'Sales Return: SR-%'
    `, [startDate, endDate]);

    const expenses = parseFloat(expenseRows[0].total_expenses) || 0;
    const netProfit = grossProfit - expenses;

    res.json({
      ok: true,
      data: {
        salesRevenue,
        returnedRevenue,
        netRevenue,
        salesCogs,
        returnedCogs,
        netCogs,
        grossProfit,
        expenses,
        netProfit
      }
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

export default router;
