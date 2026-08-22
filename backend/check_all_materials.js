import pool from './config/db.js';

async function main() {
  try {
    const [categories] = await pool.query("SELECT * FROM raw_material_categories");
    console.log("Categories:", categories);

    const [materials] = await pool.query(
      `SELECT rm.id, rm.category_id, rmc.name AS category_name, rm.sub_product_name, rm.unit, rm.qty_in_pc_per_kg
       FROM raw_materials rm
       JOIN raw_material_categories rmc ON rm.category_id = rmc.id`
    );
    console.log("Materials list (first 50):", materials.slice(0, 50));
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
