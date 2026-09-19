# Cash Ledger historical reconciliation

This utility repairs historical transactions that are absent from Cash Ledger because of stale statuses, missing payment-mode splits, or an approved payment request whose legacy `cash_ledger` row was never inserted.

## Production procedure

1. Take a database backup or snapshot.
2. Stop financial writes or run during a maintenance window.
3. Run the dry-run and save its output:

   ```powershell
   npm.cmd run reconcile:cash-ledger
   ```

4. Review every row under `ambiguousSplits`. The utility never guesses how a mixed or unknown payment method should be divided.
   Also review `pendingPaymentReview`; unresolved pending transactions are reported but never promoted automatically.
   Rows under `duplicatePendingPayments` meet strict duplicate criteria and are quarantined as rejected records on apply.
5. Apply the safe candidates:

   ```powershell
   npm.cmd run reconcile:cash-ledger:apply
   ```

6. Run the dry-run again. Safe candidate counts should be zero. Ambiguous records remain for manual investigation.

## Safety properties

- Dry-run is the default.
- Applying requires both `--apply` and `--yes`.
- A MySQL advisory lock prevents concurrent reconciliation runs.
- Repairs execute in one transaction.
- Pending and rejected records are never promoted. Exact legacy duplicate rows are quarantined, not approved or deleted.
- Missing legacy ledger rows use `NOT EXISTS`, making insertion idempotent.
- Every applied change is recorded in `cash_ledger_reconciliation_audit` with its run ID and before/after JSON.

## What it does not repair automatically

- Mixed payment methods whose Cash/UPI/Bank breakdown is missing.
- Pending or rejected approval records that do not meet the strict duplicate criteria.
- Historical amounts that may have been modified by the old Cash Ledger route-startup reconciliation.
- Business decisions about whether an advance payment should require approval.

Those cases require source-document verification before changing production data.
