import pool from '../config/db.js';

/**
 * Returns the second unit of a raw material category if applicable.
 * @param {string} categoryName 
 * @returns {string|null}
 */
export function getSecondUnit(categoryName) {
  const cat = String(categoryName || '').toLowerCase().trim();
  if (cat === 'preforms') return 'BAGS';
  if (cat === 'labels') return 'ROLLS';
  if (cat === 'caps') return 'BOXES';
  if (cat === 'shrink rolls') return 'ROLLS';
  if (cat === 'handles') return 'BAGS';
  if (cat === 'box') return 'CUTS';
  if (cat === 'bottles') return 'BAGS';
  return null;
}

/**
 * Dynamically computes the conversion factor (PCS per BAG/BOX/ROLLS/CUTS) for a raw material.
 * @param {Object} connection 
 * @param {Object} rawMaterial 
 * @returns {Promise<number>}
 */
export async function getConversionFactor(connection, rawMaterial) {
  const db = connection || pool;
  const cat = String(rawMaterial.category_name || '').toLowerCase().trim();
  const subProductName = String(rawMaterial.sub_product_name || '');
  const mainUnit = rawMaterial.unit;
  const secondUnit = getSecondUnit(rawMaterial.category_name);

  // Special case: Preforms
  if (cat === 'preforms') {
    const weight = parseFloat(subProductName) || 0;
    if (weight > 0) {
      return 25000 / weight;
    }
  }

  if (!secondUnit) return 1;
  if (mainUnit === secondUnit) return 1;

  // 1. Try fetching from inventory_bill_items (for purchases)
  const [invRows] = await db.query(
    `SELECT bi.total_quantity, bi.qty_in_pcs, bi.bags_box 
     FROM inventory_bill_items bi 
     JOIN inventory_bills b ON bi.bill_id = b.id 
     WHERE bi.raw_material_id = ? AND bi.bags_box > 0 AND (bi.qty_in_pcs > 0 OR bi.total_quantity > 0) 
     ORDER BY b.bill_date DESC, bi.created_at DESC LIMIT 1`,
    [rawMaterial.id]
  );
  if (invRows.length > 0) {
    const pcs = parseFloat(invRows[0].qty_in_pcs);
    const qty = pcs > 0 ? pcs : parseFloat(invRows[0].total_quantity);
    const bb = parseFloat(invRows[0].bags_box);
    if (qty > 0 && bb > 0) {
      return qty / bb;
    }
  }

  // 2. Try fetching from pet_bottle_batches (for Bottles production)
  if (cat === 'bottles') {
    const [pbRows] = await db.query(
      `SELECT actual_reading, bottle_bags 
       FROM pet_bottle_batches 
       WHERE finished_product_id = ? AND actual_reading > 0 AND bottle_bags > 0 
       ORDER BY batch_date DESC, created_at DESC LIMIT 1`,
      [rawMaterial.id]
    );
    if (pbRows.length > 0) {
      const actual = parseFloat(pbRows[0].actual_reading);
      const bags = parseFloat(pbRows[0].bottle_bags);
      if (actual > 0 && bags > 0) {
        return actual / bags;
      }
    }
  }

  // 3. Try manual opening stock overrides
  const [manRows] = await db.query(
    `SELECT unit, quantity FROM raw_material_ledger_manual_opening 
     WHERE raw_material_id = ? AND quantity > 0 
     ORDER BY ledger_date DESC`,
    [rawMaterial.id]
  );
  if (manRows.length >= 2) {
    const mainQtyRow = manRows.find(r => r.unit === mainUnit);
    const secQtyRow = manRows.find(r => r.unit === secondUnit);
    if (mainQtyRow && secQtyRow) {
      const mainQty = parseFloat(mainQtyRow.quantity);
      const secQty = parseFloat(secQtyRow.quantity);
      if (mainQty > 0 && secQty > 0) {
        return mainQty / secQty;
      }
    }
  }

  // 4. Default Category/Unit Fallbacks
  if (cat === 'caps') return 3000;
  if (cat === 'labels') {
    return mainUnit === 'KG' ? 10 : 5000;
  }
  if (cat === 'handles') return 5000;
  if (cat === 'box') return 20; 
  if (cat === 'bottles') return 100; 
  if (cat === 'shrink rolls') return 1;

  return 1000; // General safe default fallback
}
