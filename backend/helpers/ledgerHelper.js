export async function addLedgerEntry(connection, { date, customerId, entryType, referenceNo, particular, debit, credit }) {
  await connection.query(
    `INSERT INTO customer_ledger (date, customer_id, entry_type, reference_no, particular, debit, credit, balance)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0.00)`,
    [date, customerId, entryType, referenceNo, particular, parseFloat(debit) || 0.00, parseFloat(credit) || 0.00]
  );
  await recalculateLedgerBalances(connection, customerId);
}

export async function deleteLedgerEntry(connection, referenceNo, entryType) {
  const [rows] = await connection.query(
    `SELECT DISTINCT customer_id FROM customer_ledger WHERE reference_no = ? AND entry_type = ?`,
    [referenceNo, entryType]
  );
  if (rows.length > 0) {
    const customerId = rows[0].customer_id;
    await connection.query(
      `DELETE FROM customer_ledger WHERE reference_no = ? AND entry_type = ?`,
      [referenceNo, entryType]
    );
    await recalculateLedgerBalances(connection, customerId);
  }
}

export async function deleteLedgerEntriesForReference(connection, referenceNo) {
  const [rows] = await connection.query(
    `SELECT DISTINCT customer_id FROM customer_ledger WHERE reference_no = ?`,
    [referenceNo]
  );
  if (rows.length > 0) {
    const customerId = rows[0].customer_id;
    await connection.query(
      `DELETE FROM customer_ledger WHERE reference_no = ?`,
      [referenceNo]
    );
    await recalculateLedgerBalances(connection, customerId);
  }
}

export async function recalculateLedgerBalances(connection, customerId) {
  const [rows] = await connection.query(
    `SELECT id, debit, credit FROM customer_ledger WHERE customer_id = ? ORDER BY date ASC, id ASC FOR UPDATE`,
    [customerId]
  );
  let balance = 0.00;
  for (const row of rows) {
    balance = balance + parseFloat(row.debit) - parseFloat(row.credit);
    await connection.query(
      `UPDATE customer_ledger SET balance = ? WHERE id = ?`,
      [balance, row.id]
    );
  }
}

export async function addSupplierLedgerEntry(connection, { date, supplierId, entryType, referenceNo, particular, debit, credit }) {
  await connection.query(
    `INSERT INTO supplier_ledger (date, supplier_id, entry_type, reference_no, particular, debit, credit, balance)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0.00)`,
    [date, supplierId, entryType, referenceNo, particular, parseFloat(debit) || 0.00, parseFloat(credit) || 0.00]
  );
  await recalculateSupplierLedgerBalances(connection, supplierId);
}

export async function deleteSupplierLedgerEntriesForReference(connection, referenceNo) {
  const [rows] = await connection.query(
    `SELECT DISTINCT supplier_id FROM supplier_ledger WHERE reference_no = ?`,
    [referenceNo]
  );
  if (rows.length > 0) {
    const supplierId = rows[0].supplier_id;
    await connection.query(
      `DELETE FROM supplier_ledger WHERE reference_no = ?`,
      [referenceNo]
    );
    await recalculateSupplierLedgerBalances(connection, supplierId);
  }
}

export async function recalculateSupplierLedgerBalances(connection, supplierId) {
  const [rows] = await connection.query(
    `SELECT id, debit, credit FROM supplier_ledger WHERE supplier_id = ? ORDER BY date ASC, id ASC FOR UPDATE`,
    [supplierId]
  );
  let balance = 0.00;
  for (const row of rows) {
    balance = balance + parseFloat(row.credit) - parseFloat(row.debit);
    await connection.query(
      `UPDATE supplier_ledger SET balance = ? WHERE id = ?`,
      [balance, row.id]
    );
  }
}
