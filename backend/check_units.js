import pool from './config/db.js';

async function main() {
  try {
    const [invItems] = await pool.query(
      `SELECT rmc.name AS category_name, bi.unit, COUNT(*) as count, SUM(bi.bags_box) as total_bags_box, SUM(bi.total_quantity) as total_quantity
       FROM inventory_bill_items bi
       JOIN raw_materials rm ON bi.raw_material_id = rm.id
       JOIN raw_material_categories rmc ON rm.category_id = rmc.id
       GROUP BY rmc.name, bi.unit`
    );
    console.log("Inventory Bill items units by Category:", invItems);

    const [regItems] = await pool.query(
      `SELECT rmc.name AS category_name, rm.unit, COUNT(*) as count
       FROM stock_register sr
       JOIN raw_materials rm ON sr.item_id = rm.id AND sr.item_type = 'RAW_MATERIAL'
       JOIN raw_material_categories rmc ON rm.category_id = rmc.id
       GROUP BY rmc.name, rm.unit`
    );
    console.log("Stock Register items by Category and RM unit:", regItems);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
