import express from 'express';
import pool from '../config/db.js';
import authMiddleware from '../middleware/auth.js';
import { getPerPcRates } from './rawMaterialLedger.js';

const router = express.Router();

// GET /api/wastage
// Aggregates wastage across PET Bottle Production, Finished Goods Production, and Stock Corrections
router.get('/', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      startDate,
      endDate,
      date,
      source, // ALL, PET_BOTTLE, PRODUCTION, CORRECTION
      categoryId,
      search,
      page = 1,
      limit = 15
    } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 15);
    const offset = (parsedPage - 1) * parsedLimit;

    // Fetch latest per-piece rates map for valuation
    const perPcRateMap = await getPerPcRates(connection);

    // Build unified query across the 3 sources
    let queries = [];
    let queryParams = [];

    // 1. PET Bottle Production Wastage (using difference_val as scrap/wastage)
    if (!source || source === 'ALL' || source === 'PET_BOTTLE') {
      queries.push(`
        SELECT 
          'PET_BOTTLE' AS source_type,
          'PET Bottle Production' AS source_name,
          pbb.id AS reference_id,
          DATE_FORMAT(pbb.batch_date, '%Y-%m-%d') AS record_date,
          pbb.raw_material_id AS raw_material_id,
          rm.sub_product_name AS raw_material_name,
          rm.unit AS raw_material_unit,
          rm.category_id,
          rmc.name AS category_name,
          COALESCE(fp.name, rmf.sub_product_name, 'PET Bottle') AS target_product_name,
          CAST(pbb.difference_val AS DECIMAL(12, 2)) AS wastage_qty,
          'PCS' AS wastage_unit,
          COALESCE(pbb.notes, '') AS remarks,
          'Admin' AS created_by,
          pbb.created_at AS created_at
        FROM pet_bottle_batches pbb
        JOIN raw_materials rm ON pbb.raw_material_id = rm.id
        JOIN raw_material_categories rmc ON rm.category_id = rmc.id
        LEFT JOIN finished_products fp ON pbb.finished_product_id = fp.id
        LEFT JOIN raw_materials rmf ON pbb.finished_product_id = rmf.id
        WHERE pbb.difference_val > 0
      `);
    }

    // 2. Finished Goods Production Wastage
    if (!source || source === 'ALL' || source === 'PRODUCTION') {
      queries.push(`
        SELECT 
          'PRODUCTION' AS source_type,
          'Finished Goods Production' AS source_name,
          pb.id AS reference_id,
          DATE_FORMAT(pb.production_date, '%Y-%m-%d') AS record_date,
          pmu.raw_material_id AS raw_material_id,
          rm.sub_product_name AS raw_material_name,
          rm.unit AS raw_material_unit,
          rm.category_id,
          rmc.name AS category_name,
          fp.name AS target_product_name,
          CAST(pmu.wastage AS DECIMAL(12, 2)) AS wastage_qty,
          rm.unit AS wastage_unit,
          COALESCE(pb.notes, '') AS remarks,
          'Admin' AS created_by,
          pb.created_at AS created_at
        FROM production_material_usages pmu
        JOIN production_batches pb ON pmu.production_batch_id = pb.id
        JOIN raw_materials rm ON pmu.raw_material_id = rm.id
        JOIN raw_material_categories rmc ON rm.category_id = rmc.id
        LEFT JOIN finished_products fp ON pb.finished_product_id = fp.id
        WHERE pmu.wastage > 0
      `);
    }

    // 3. Stock Correction Wastage (Shortages)
    if (!source || source === 'ALL' || source === 'CORRECTION') {
      queries.push(`
        SELECT 
          'CORRECTION' AS source_type,
          'Stock Correction' AS source_name,
          sc.id AS reference_id,
          DATE_FORMAT(sc.correction_date, '%Y-%m-%d') AS record_date,
          sc.raw_material_id AS raw_material_id,
          rm.sub_product_name AS raw_material_name,
          rm.unit AS raw_material_unit,
          rm.category_id,
          rmc.name AS category_name,
          NULL AS target_product_name,
          CAST(ABS(sc.difference_qty) AS DECIMAL(12, 2)) AS wastage_qty,
          CASE WHEN LOWER(rmc.name) = 'preforms' THEN 'PCS' ELSE rm.unit END AS wastage_unit,
          COALESCE(sc.remarks, '') AS remarks,
          sc.created_by AS created_by,
          sc.created_at AS created_at
        FROM stock_corrections sc
        JOIN raw_materials rm ON sc.raw_material_id = rm.id
        JOIN raw_material_categories rmc ON rm.category_id = rmc.id
        WHERE (sc.difference_qty < 0 OR sc.adjustment_type = 'WASTAGE')
      `);
    }

    const unifiedSql = queries.join(' UNION ALL ');

    // Outer filter wrapper
    let outerWhere = [];
    let outerParams = [];

    if (date) {
      outerWhere.push('u.record_date = ?');
      outerParams.push(date);
    } else {
      if (startDate) {
        outerWhere.push('u.record_date >= ?');
        outerParams.push(startDate);
      }
      if (endDate) {
        outerWhere.push('u.record_date <= ?');
        outerParams.push(endDate);
      }
    }

    if (categoryId && categoryId !== 'ALL') {
      outerWhere.push('(u.category_id = ? OR u.category_name = ?)');
      outerParams.push(categoryId, categoryId);
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      outerWhere.push('(u.reference_id LIKE ? OR u.raw_material_name LIKE ? OR u.category_name LIKE ? OR u.target_product_name LIKE ? OR u.remarks LIKE ?)');
      outerParams.push(s, s, s, s, s);
    }

    const whereClause = outerWhere.length > 0 ? `WHERE ${outerWhere.join(' AND ')}` : '';

    // Fetch all matching records to compute accurate metrics & valuation
    const fullQuery = `
      SELECT u.* FROM (${unifiedSql}) u
      ${whereClause}
      ORDER BY u.record_date DESC, u.created_at DESC, u.reference_id DESC
    `;

    const [allRows] = await connection.query(fullQuery, outerParams);

    // Compute valuations and summary statistics
    let totalWastageRecords = allRows.length;
    let totalWastageQty = 0;
    let totalWastageValue = 0;

    const sourceBreakdown = {
      PET_BOTTLE: { name: 'PET Bottle Production', count: 0, qty: 0, value: 0 },
      PRODUCTION: { name: 'Finished Goods Production', count: 0, qty: 0, value: 0 },
      CORRECTION: { name: 'Stock Correction', count: 0, qty: 0, value: 0 }
    };

    const categoryMap = {};

    const enrichedRows = allRows.map(row => {
      const rateInfo = perPcRateMap[row.raw_material_id] || { rate: 0, source: 'Default / Not billed' };
      const rate = typeof rateInfo === 'object' ? rateInfo.rate : (rateInfo || 0);
      const qty = parseFloat(row.wastage_qty) || 0;
      const value = parseFloat((qty * rate).toFixed(2));

      totalWastageQty += qty;
      totalWastageValue += value;

      // Update source breakdown
      if (sourceBreakdown[row.source_type]) {
        sourceBreakdown[row.source_type].count += 1;
        sourceBreakdown[row.source_type].qty += qty;
        sourceBreakdown[row.source_type].value += value;
      }

      // Update category breakdown
      const catKey = row.category_name || 'Others';
      if (!categoryMap[catKey]) {
        categoryMap[catKey] = { categoryName: catKey, count: 0, qty: 0, value: 0 };
      }
      categoryMap[catKey].count += 1;
      categoryMap[catKey].qty += qty;
      categoryMap[catKey].value += value;

      return {
        ...row,
        wastage_qty: qty,
        per_pc_rate: rate,
        wastage_value: value,
        rate_source: rateInfo.source || 'Latest Rate'
      };
    });

    // Paginate enriched rows
    const paginatedItems = enrichedRows.slice(offset, offset + parsedLimit);
    const totalPages = Math.ceil(totalWastageRecords / parsedLimit) || 1;

    // Convert category map to array sorted by value desc
    const categoryBreakdown = Object.values(categoryMap).sort((a, b) => b.value - a.value);

    res.json({
      ok: true,
      items: paginatedItems,
      pagination: {
        total: totalWastageRecords,
        page: parsedPage,
        limit: parsedLimit,
        totalPages
      },
      summary: {
        totalWastageRecords,
        totalWastageQty: parseFloat(totalWastageQty.toFixed(2)),
        totalWastageValue: parseFloat(totalWastageValue.toFixed(2)),
        sourceBreakdown: {
          PET_BOTTLE: {
            ...sourceBreakdown.PET_BOTTLE,
            qty: parseFloat(sourceBreakdown.PET_BOTTLE.qty.toFixed(2)),
            value: parseFloat(sourceBreakdown.PET_BOTTLE.value.toFixed(2))
          },
          PRODUCTION: {
            ...sourceBreakdown.PRODUCTION,
            qty: parseFloat(sourceBreakdown.PRODUCTION.qty.toFixed(2)),
            value: parseFloat(sourceBreakdown.PRODUCTION.value.toFixed(2))
          },
          CORRECTION: {
            ...sourceBreakdown.CORRECTION,
            qty: parseFloat(sourceBreakdown.CORRECTION.qty.toFixed(2)),
            value: parseFloat(sourceBreakdown.CORRECTION.value.toFixed(2))
          }
        },
        categoryBreakdown
      }
    });

  } catch (error) {
    console.error('Error fetching wastage records:', error);
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    connection.release();
  }
});

export default router;
