import pool from './config/db.js';

/** Recalculate available_quantity from transaction history (fixes double-deduction drift). */
async function syncStockFromTransactions() {
  const { rows: components } = await pool.query('SELECT id, total_quantity FROM components');
  let updated = 0;

  for (const comp of components) {
    const { rows: txs } = await pool.query(
      `SELECT transaction_type, quantity FROM inventory_transactions WHERE component_id = $1`,
      [comp.id]
    );
    let available = Number(comp.total_quantity) || 0;
    for (const t of txs) {
      const q = Number(t.quantity) || 0;
      if (t.transaction_type === 'issue' || t.transaction_type === 'damaged') available -= q;
      else if (t.transaction_type === 'return') available += q;
    }
    available = Math.max(0, Math.min(available, Number(comp.total_quantity) || 0));

    await pool.query(
      'UPDATE components SET available_quantity = $1, updated_at = NOW() WHERE id = $2',
      [available, comp.id]
    );
    updated++;
  }

  await pool.query(`
    UPDATE components
    SET status = CASE
      WHEN status IN ('expired', 'defective') THEN status
      WHEN total_quantity = 0 OR available_quantity <= 0 THEN 'out_of_stock'
      WHEN available_quantity <= GREATEST(1, CEIL(total_quantity * 0.2)) THEN 'low_stock'
      ELSE 'active'
    END,
    updated_at = NOW()
  `);

  console.log(`Synced available_quantity for ${updated} component(s)`);
  process.exit(0);
}

syncStockFromTransactions().catch((e) => {
  console.error(e);
  process.exit(1);
});
