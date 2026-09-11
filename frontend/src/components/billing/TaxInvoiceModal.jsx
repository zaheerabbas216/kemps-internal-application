import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Helper to format currency in Indian Rupees format (₹ xx,xxx.xx)
 */
export const formatINR = (val) => {
  const num = parseFloat(val) || 0;
  return '₹ ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Helper to format date string to DD/MM/YYYY
 */
export const formatInvoiceDate = (dateStr) => {
  if (!dateStr) return '—';
  const parts = String(dateStr).split('T')[0].split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

/**
 * Compute itemized GST calculations ensuring no rounding drift:
 * taxableAmount + cgstAmount + sgstAmount === totalAmount
 */
export const computeItemGst = (item) => {
  const qty = parseInt(item.quantity, 10) || 0;
  const rateWithTax = parseFloat(item.rate_with_tax || item.rateWithTax) || 0;
  const taxPercent = parseFloat(item.tax_percent || item.taxPercent) || 0;
  const totalAmount = parseFloat(item.total_amount || item.totalAmount) || (qty * rateWithTax);

  // Basic rate & taxable amount
  const basicRate = (rateWithTax / (1 + taxPercent / 100));
  const taxableAmount = Math.round((totalAmount / (1 + taxPercent / 100)) * 100) / 100;
  const totalTax = Math.round((totalAmount - taxableAmount) * 100) / 100;

  // Split equally into CGST and SGST for Intra-State
  const cgstPercent = taxPercent / 2;
  const sgstPercent = taxPercent / 2;

  const cgstAmount = Math.round((totalTax / 2) * 100) / 100;
  const sgstAmount = Math.round((totalTax - cgstAmount) * 100) / 100;

  return {
    productName: item.product_name || item.name || 'Product',
    hsn: item.hsn_code || item.hsn || '',
    quantity: qty,
    rateWithTax,
    basicRate,
    taxPercent,
    taxableAmount,
    totalTax,
    cgstPercent,
    cgstAmount,
    sgstPercent,
    sgstAmount,
    totalAmount
  };
};

/**
 * Generate isolated printable HTML document for A4 or A2 paper sizes
 */
export const generatePrintableInvoiceHtml = (bill, itemsList, companyInfo, paperSize = 'A4') => {
  const isA2 = paperSize.toUpperCase() === 'A2';
  const computedItems = (itemsList || []).map(computeItemGst);

  // Aggregates
  const totalTaxable = computedItems.reduce((acc, i) => acc + i.taxableAmount, 0);
  const totalCgst = computedItems.reduce((acc, i) => acc + i.cgstAmount, 0);
  const totalSgst = computedItems.reduce((acc, i) => acc + i.sgstAmount, 0);
  const grandTotal = parseFloat(bill.grand_total) || (totalTaxable + totalCgst + totalSgst);
  const amountPaid = parseFloat(bill.amount_paid) || 0;
  const dueAmount = parseFloat(bill.due_amount) || 0;

  // Grouped GST Summary per Tax Slab
  const gstSlabs = {};
  computedItems.forEach(i => {
    const key = `${i.taxPercent}%`;
    if (!gstSlabs[key]) {
      gstSlabs[key] = {
        taxPercent: i.taxPercent,
        cgstPercent: i.cgstPercent,
        sgstPercent: i.sgstPercent,
        taxableAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        totalTax: 0
      };
    }
    gstSlabs[key].taxableAmount += i.taxableAmount;
    gstSlabs[key].cgstAmount += i.cgstAmount;
    gstSlabs[key].sgstAmount += i.sgstAmount;
    gstSlabs[key].totalTax += i.totalTax;
  });

  const companyName = companyInfo?.company_name || bill.company || 'Kempannavar Industries';
  const companyPhone = companyInfo?.phone_number || '';
  const companyGst = companyInfo?.gst_number || '';
  const companyAddress = companyInfo?.address || '';

  // CSS sizing scale for A4 vs A2
  const fontSizeBase = isA2 ? '22px' : '11px';
  const titleSize = isA2 ? '36px' : '18px';
  const bannerSize = isA2 ? '28px' : '14px';
  const headerPad = isA2 ? '18px' : '8px';
  const tablePad = isA2 ? '14px 16px' : '6px 8px';
  const borderW = isA2 ? '2px' : '1px';
  const pageMargin = isA2 ? '25mm 20mm' : '12mm 15mm';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>TAX INVOICE - ${bill.id}</title>
      <style>
        @page {
          size: ${paperSize.toUpperCase()} portrait;
          margin: ${pageMargin};
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #0f172a;
          background: #ffffff;
          font-size: ${fontSizeBase};
          line-height: 1.35;
          padding: ${isA2 ? '20px' : '0'};
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .invoice-card {
          width: 100%;
          border: ${borderW} solid #0f172a;
        }
        .company-header {
          padding: ${headerPad};
          text-align: center;
          border-bottom: ${borderW} solid #0f172a;
          background: #f8fafc;
        }
        .company-name {
          font-size: ${titleSize};
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #0f172a;
        }
        .company-sub {
          font-size: ${isA2 ? '18px' : '10px'};
          color: #334155;
          margin-top: ${isA2 ? '6px' : '2px'};
          font-weight: 600;
        }
        .tax-invoice-banner {
          background: #0f172a;
          color: #ffffff;
          text-align: center;
          font-size: ${bannerSize};
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 2px;
          padding: ${isA2 ? '10px 0' : '4px 0'};
        }
        .meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border-bottom: ${borderW} solid #0f172a;
        }
        .meta-col {
          padding: ${headerPad};
        }
        .meta-col:first-child {
          border-right: ${borderW} solid #0f172a;
        }
        .section-tag {
          font-size: ${isA2 ? '15px' : '9px'};
          font-weight: 800;
          text-transform: uppercase;
          color: #475569;
          letter-spacing: 1px;
          margin-bottom: ${isA2 ? '8px' : '4px'};
          border-bottom: 1px dashed #cbd5e1;
          padding-bottom: 2px;
        }
        .meta-row {
          display: flex;
          margin-bottom: ${isA2 ? '4px' : '2px'};
        }
        .meta-label {
          width: ${isA2 ? '180px' : '100px'};
          font-weight: 700;
          color: #334155;
        }
        .meta-val {
          flex: 1;
          font-weight: 700;
          color: #0f172a;
        }
        table.invoice-table {
          width: 100%;
          border-collapse: collapse;
        }
        table.invoice-table th {
          background: #f1f5f9;
          border-bottom: ${borderW} solid #0f172a;
          border-right: ${borderW} solid #cbd5e1;
          padding: ${tablePad};
          font-size: ${isA2 ? '16px' : '9.5px'};
          font-weight: 800;
          text-transform: uppercase;
          color: #0f172a;
          text-align: left;
        }
        table.invoice-table th:last-child {
          border-right: none;
        }
        table.invoice-table td {
          border-bottom: 1px solid #e2e8f0;
          border-right: 1px solid #e2e8f0;
          padding: ${tablePad};
          vertical-align: middle;
        }
        table.invoice-table td:last-child {
          border-right: none;
        }
        .text-right { text-align: right !important; }
        .text-center { text-align: center !important; }
        .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .font-bold { font-weight: 700; }
        .font-black { font-weight: 900; }

        .summary-container {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          border-top: ${borderW} solid #0f172a;
          border-bottom: ${borderW} solid #0f172a;
        }
        .summary-left {
          padding: ${headerPad};
          border-right: ${borderW} solid #0f172a;
        }
        .summary-right {
          padding: ${headerPad};
          background: #fafafa;
        }
        .total-line {
          display: flex;
          justify-content: space-between;
          padding: ${isA2 ? '6px 0' : '3px 0'};
          font-size: ${isA2 ? '20px' : '11px'};
          font-weight: 600;
        }
        .grand-total-line {
          display: flex;
          justify-content: space-between;
          border-top: ${borderW} solid #0f172a;
          border-bottom: ${borderW} solid #0f172a;
          padding: ${isA2 ? '10px 0' : '6px 0'};
          margin: ${isA2 ? '8px 0' : '4px 0'};
          font-size: ${isA2 ? '26px' : '14px'};
          font-weight: 900;
          color: #0f172a;
        }
        .gst-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: ${isA2 ? '8px' : '4px'};
          font-size: ${isA2 ? '16px' : '9.5px'};
        }
        .gst-table th {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          padding: ${isA2 ? '6px 8px' : '3px 5px'};
          font-weight: 800;
          text-align: center;
        }
        .gst-table td {
          border: 1px solid #cbd5e1;
          padding: ${isA2 ? '6px 8px' : '3px 5px'};
          font-weight: 600;
        }
        .footer-grid {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          padding: ${headerPad};
          gap: ${isA2 ? '20px' : '10px'};
        }
        .terms-box {
          font-size: ${isA2 ? '15px' : '9px'};
          color: #475569;
          line-height: 1.4;
        }
        .terms-title {
          font-weight: 800;
          text-transform: uppercase;
          color: #0f172a;
          margin-bottom: 2px;
        }
        .signature-box {
          text-align: right;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          align-items: flex-end;
          padding-top: ${isA2 ? '50px' : '35px'};
        }
        .sig-line {
          border-top: 1px solid #0f172a;
          width: ${isA2 ? '260px' : '150px'};
          text-align: center;
          font-size: ${isA2 ? '16px' : '10px'};
          font-weight: 800;
          text-transform: uppercase;
          padding-top: 3px;
        }
      </style>
    </head>
    <body>
      <div class="invoice-card">
        
        <!-- HEADER -->
        <div class="company-header">
          <div class="company-name">${companyName}</div>
          <div class="company-sub">
            ${companyAddress ? `${companyAddress} • ` : ''}
            ${companyPhone ? `Phone: ${companyPhone} • ` : ''}
            ${companyGst ? `GSTIN: ${companyGst}` : ''}
          </div>
        </div>

        <!-- BANNER -->
        <div class="tax-invoice-banner">TAX INVOICE</div>

        <!-- METADATA -->
        <div class="meta-grid">
          <div class="meta-col">
            <div class="section-tag">Invoice Particulars</div>
            <div class="meta-row">
              <span class="meta-label">Invoice No:</span>
              <span class="meta-val font-mono font-black">${bill.id}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Invoice Date:</span>
              <span class="meta-val">${formatInvoiceDate(bill.billing_date)}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Payment Mode:</span>
              <span class="meta-val" style="text-transform: uppercase;">${bill.payment_mode || 'Cash'}</span>
            </div>
            ${bill.remarks ? `
              <div class="meta-row">
                <span class="meta-label">Remarks:</span>
                <span class="meta-val" style="font-size: ${isA2 ? '16px' : '9.5px'}; color: #475569;">${bill.remarks}</span>
              </div>
            ` : ''}
          </div>

          <div class="meta-col">
            <div class="section-tag">Billed To (Customer Details)</div>
            <div class="meta-row">
              <span class="meta-label">Customer Name:</span>
              <span class="meta-val font-black" style="text-transform: uppercase;">${bill.customer_name}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Phone:</span>
              <span class="meta-val font-mono">${bill.customer_phone || '—'}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Customer Type:</span>
              <span class="meta-val">${bill.customer_type || 'General Customer'}</span>
            </div>
            ${bill.customer_gstin ? `
              <div class="meta-row">
                <span class="meta-label">GSTIN:</span>
                <span class="meta-val font-mono font-bold">${bill.customer_gstin}</span>
              </div>
            ` : ''}
            ${bill.customer_address ? `
              <div class="meta-row">
                <span class="meta-label">Address:</span>
                <span class="meta-val" style="font-size: ${isA2 ? '16px' : '9.5px'};">${bill.customer_address}</span>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- ITEMS TABLE -->
        <table class="invoice-table">
          <thead>
            <tr>
              <th style="width: 5%;" class="text-center">Sl</th>
              <th style="width: 28%;">Product Description</th>
              ${computedItems.some(i => i.hsn) ? '<th style="width: 10%;" class="text-center">HSN/SAC</th>' : ''}
              <th style="width: 7%;" class="text-center">Qty</th>
              <th style="width: 10%;" class="text-right">Rate</th>
              <th style="width: 12%;" class="text-right">Taxable Val</th>
              <th style="width: 6%;" class="text-center">GST</th>
              <th style="width: 11%;" class="text-right">CGST</th>
              <th style="width: 11%;" class="text-right">SGST</th>
              <th style="width: 12%;" class="text-right">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${computedItems.map((item, idx) => `
              <tr>
                <td class="text-center font-bold">${idx + 1}</td>
                <td class="font-bold">${item.productName}</td>
                ${computedItems.some(i => i.hsn) ? `<td class="text-center font-mono">${item.hsn || '—'}</td>` : ''}
                <td class="text-center font-bold">${item.quantity}</td>
                <td class="text-right font-mono">₹ ${item.basicRate.toFixed(2)}</td>
                <td class="text-right font-mono font-bold">₹ ${item.taxableAmount.toFixed(2)}</td>
                <td class="text-center font-bold">${item.taxPercent}%</td>
                <td class="text-right font-mono">
                  <div style="font-size: ${isA2 ? '14px' : '8.5px'}; color: #64748b;">${item.cgstPercent}%</div>
                  ₹ ${item.cgstAmount.toFixed(2)}
                </td>
                <td class="text-right font-mono">
                  <div style="font-size: ${isA2 ? '14px' : '8.5px'}; color: #64748b;">${item.sgstPercent}%</div>
                  ₹ ${item.sgstAmount.toFixed(2)}
                </td>
                <td class="text-right font-mono font-black">₹ ${item.totalAmount.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- SUMMARY SECTION -->
        <div class="summary-container">
          
          <!-- LEFT: GST BREAKDOWN TABLE -->
          <div class="summary-left">
            <div class="section-tag">GST Summary Breakdown (Intra-State)</div>
            <table class="gst-table">
              <thead>
                <tr>
                  <th>Slab</th>
                  <th class="text-right">Taxable Amount</th>
                  <th class="text-right">CGST</th>
                  <th class="text-right">SGST</th>
                  <th class="text-right">Total Tax</th>
                </tr>
              </thead>
              <tbody>
                ${Object.values(gstSlabs).map(s => `
                  <tr>
                    <td class="text-center font-bold">${s.taxPercent}%</td>
                    <td class="text-right font-mono">₹ ${s.taxableAmount.toFixed(2)}</td>
                    <td class="text-right font-mono">₹ ${s.cgstAmount.toFixed(2)} <span style="font-size: 8px; color: #64748b;">(${s.cgstPercent}%)</span></td>
                    <td class="text-right font-mono">₹ ${s.sgstAmount.toFixed(2)} <span style="font-size: 8px; color: #64748b;">(${s.sgstPercent}%)</span></td>
                    <td class="text-right font-mono font-bold">₹ ${s.totalTax.toFixed(2)}</td>
                  </tr>
                `).join('')}
                <tr style="background: #f8fafc; font-weight: 800;">
                  <td class="text-center">Total</td>
                  <td class="text-right font-mono">₹ ${totalTaxable.toFixed(2)}</td>
                  <td class="text-right font-mono">₹ ${totalCgst.toFixed(2)}</td>
                  <td class="text-right font-mono">₹ ${totalSgst.toFixed(2)}</td>
                  <td class="text-right font-mono">₹ ${(totalCgst + totalSgst).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- RIGHT: TOTALS & SETTLEMENT -->
          <div class="summary-right">
            <div class="total-line">
              <span>Taxable Amount (Subtotal):</span>
              <span class="font-mono font-bold">₹ ${totalTaxable.toFixed(2)}</span>
            </div>
            <div class="total-line">
              <span>CGST Total:</span>
              <span class="font-mono font-bold">₹ ${totalCgst.toFixed(2)}</span>
            </div>
            <div class="total-line">
              <span>SGST Total:</span>
              <span class="font-mono font-bold">₹ ${totalSgst.toFixed(2)}</span>
            </div>
            <div class="grand-total-line">
              <span>GRAND TOTAL:</span>
              <span class="font-mono">₹ ${grandTotal.toFixed(2)}</span>
            </div>
            <div class="total-line" style="color: #16a34a;">
              <span>Amount Paid (${bill.payment_mode || 'Cash'}):</span>
              <span class="font-mono font-bold">₹ ${amountPaid.toFixed(2)}</span>
            </div>
            <div class="total-line" style="color: ${dueAmount > 0 ? '#e11d48' : '#64748b'};">
              <span>Balance Due:</span>
              <span class="font-mono font-black">₹ ${dueAmount.toFixed(2)}</span>
            </div>
          </div>

        </div>

        <!-- FOOTER / SIGNATURE -->
        <div class="footer-grid">
          <div class="terms-box">
            <div class="terms-title">Terms & Conditions</div>
            <div>1. All rates are inclusive of GST as calculated above.</div>
            <div>2. Goods once sold will not be taken back or exchanged unless approved.</div>
            <div>3. Subject to local state jurisdiction.</div>
          </div>
          <div class="signature-box">
            <div class="sig-line">For ${companyName}<br/><span style="font-weight: 500; font-size: 8px;">Authorized Signatory</span></div>
          </div>
        </div>

      </div>
    </body>
    </html>
  `;
};

/**
 * Executes browser print for A4 or A2 using an isolated iframe
 */
export const printInvoiceDocument = (bill, itemsList, companyInfo, paperSize = 'A4') => {
  const htmlContent = generatePrintableInvoiceHtml(bill, itemsList, companyInfo, paperSize);
  
  // Create hidden iframe for completely isolated printing
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(htmlContent);
  doc.close();

  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 1500);
  }, 350);
};

/**
 * Full-screen interactive modal for previewing and printing professional GST Tax Invoices
 */
const TaxInvoiceModal = ({ isOpen, onClose, bill, items = [], companyDetails = null }) => {
  if (!isOpen || !bill) return null;

  const computedItems = (items || []).map(computeItemGst);
  const totalTaxable = computedItems.reduce((acc, i) => acc + i.taxableAmount, 0);
  const totalCgst = computedItems.reduce((acc, i) => acc + i.cgstAmount, 0);
  const totalSgst = computedItems.reduce((acc, i) => acc + i.sgstAmount, 0);
  const grandTotal = parseFloat(bill.grand_total) || (totalTaxable + totalCgst + totalSgst);
  const amountPaid = parseFloat(bill.amount_paid) || 0;
  const dueAmount = parseFloat(bill.due_amount) || 0;

  // Grouped GST summary
  const gstSlabs = {};
  computedItems.forEach(i => {
    const key = `${i.taxPercent}%`;
    if (!gstSlabs[key]) {
      gstSlabs[key] = {
        taxPercent: i.taxPercent,
        cgstPercent: i.cgstPercent,
        sgstPercent: i.sgstPercent,
        taxableAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        totalTax: 0
      };
    }
    gstSlabs[key].taxableAmount += i.taxableAmount;
    gstSlabs[key].cgstAmount += i.cgstAmount;
    gstSlabs[key].sgstAmount += i.sgstAmount;
    gstSlabs[key].totalTax += i.totalTax;
  });

  const companyName = companyDetails?.company_name || bill.company || 'Kempannavar Industries';
  const companyPhone = companyDetails?.phone_number || '';
  const companyGst = companyDetails?.gst_number || '';
  const companyAddress = companyDetails?.address || '';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden relative">
        
        {/* MODAL ACTION BAR */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-base font-black">
              📄
            </span>
            <div>
              <h3 className="text-sm font-black text-slate-850 uppercase tracking-tight">GST Tax Invoice Preview</h3>
              <p className="text-[11px] text-slate-500 font-bold font-mono">{bill.id}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => printInvoiceDocument(bill, items, companyDetails, 'A4')}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 shadow-sm shadow-primary/20"
              title="Print standard A4 Invoice"
            >
              <span>🖨️</span> Print A4
            </button>
            <button
              type="button"
              onClick={() => printInvoiceDocument(bill, items, companyDetails, 'A2')}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 shadow-sm shadow-indigo-600/20"
              title="Print Large A2 Invoice"
            >
              <span>🖨️</span> Print A2
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center font-bold text-sm transition-all"
            >
              ✕
            </button>
          </div>
        </div>

        {/* MODAL INVOICE DOCUMENT PREVIEW */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-100/50">
          
          <div className="bg-white border border-slate-300 rounded-2xl shadow-sm p-6 sm:p-8 space-y-6 max-w-3xl mx-auto text-slate-800">
            
            {/* COMPANY HEADER */}
            <div className="text-center border-b border-slate-200 pb-4">
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
                {companyName}
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-1">
                {companyAddress ? `${companyAddress} • ` : ''}
                {companyPhone ? `Phone: ${companyPhone} • ` : ''}
                {companyGst ? `GSTIN: ${companyGst}` : ''}
              </p>
            </div>

            {/* TAX INVOICE BANNER */}
            <div className="bg-slate-900 text-white text-center py-1 rounded-lg text-xs font-black uppercase tracking-widest">
              TAX INVOICE
            </div>

            {/* INVOICE & CUSTOMER INFO */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border border-slate-200 rounded-xl p-4 text-xs bg-slate-50/50">
              <div className="space-y-1.5 border-b sm:border-b-0 sm:border-r border-slate-200 pb-3 sm:pb-0 sm:pr-4">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Invoice Particulars</div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Invoice No:</span>
                  <span className="font-mono font-black text-slate-900">{bill.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Invoice Date:</span>
                  <span className="font-bold text-slate-800">{formatInvoiceDate(bill.billing_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Payment Mode:</span>
                  <span className="font-bold text-slate-800 uppercase">{bill.payment_mode || 'Cash'}</span>
                </div>
                {bill.remarks && (
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span className="font-bold">Remarks:</span>
                    <span>{bill.remarks}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 sm:pl-4">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Billed To (Customer Details)</div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Name:</span>
                  <span className="font-black text-slate-900 uppercase">{bill.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Phone:</span>
                  <span className="font-mono font-bold text-slate-800">{bill.customer_phone || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Type:</span>
                  <span className="font-bold text-slate-800">{bill.customer_type || 'General Customer'}</span>
                </div>
                {bill.customer_gstin && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">GSTIN:</span>
                    <span className="font-mono font-bold text-slate-900">{bill.customer_gstin}</span>
                  </div>
                )}
                {bill.customer_address && (
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span className="font-bold">Address:</span>
                    <span className="text-right">{bill.customer_address}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ITEM TABLE */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-[9px] font-black text-slate-600 uppercase tracking-wider">
                    <th className="py-2.5 px-3 text-center">#</th>
                    <th className="py-2.5 px-3">Product Description</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Basic Rate</th>
                    <th className="py-2.5 px-3 text-right">Taxable Val</th>
                    <th className="py-2.5 px-3 text-center">GST</th>
                    <th className="py-2.5 px-3 text-right">CGST</th>
                    <th className="py-2.5 px-3 text-right">SGST</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 font-bold text-slate-700">
                  {computedItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 text-center text-slate-400">{idx + 1}</td>
                      <td className="py-2 px-3 text-slate-900 font-extrabold">{item.productName}</td>
                      <td className="py-2 px-3 text-center font-bold">{item.quantity}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600">₹ {item.basicRate.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-900 font-black">₹ {item.taxableAmount.toFixed(2)}</td>
                      <td className="py-2 px-3 text-center text-slate-600">{item.taxPercent}%</td>
                      <td className="py-2 px-3 text-right font-mono">
                        <span className="text-[9px] text-slate-400 block font-normal">{item.cgstPercent}%</span>
                        ₹ {item.cgstAmount.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        <span className="text-[9px] text-slate-400 block font-normal">{item.sgstPercent}%</span>
                        ₹ {item.sgstAmount.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-900 font-black">₹ {item.totalAmount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* GST SUMMARY & TOTALS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              {/* GST SUMMARY TABLE */}
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">GST Summary (Intra-State)</div>
                <table className="w-full text-xs border border-slate-200 bg-white rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-slate-100 text-[9px] font-black text-slate-500 uppercase">
                      <th className="p-1.5 text-center">Slab</th>
                      <th className="p-1.5 text-right">Taxable</th>
                      <th className="p-1.5 text-right">CGST</th>
                      <th className="p-1.5 text-right">SGST</th>
                      <th className="p-1.5 text-right">Total Tax</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {Object.values(gstSlabs).map((s, i) => (
                      <tr key={i}>
                        <td className="p-1.5 text-center font-bold">{s.taxPercent}%</td>
                        <td className="p-1.5 text-right">₹ {s.taxableAmount.toFixed(2)}</td>
                        <td className="p-1.5 text-right">₹ {s.cgstAmount.toFixed(2)}</td>
                        <td className="p-1.5 text-right">₹ {s.sgstAmount.toFixed(2)}</td>
                        <td className="p-1.5 text-right font-bold text-slate-900">₹ {s.totalTax.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* TOTALS & SETTLEMENT */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600 font-semibold">
                  <span>Subtotal / Taxable Amount:</span>
                  <span className="font-mono font-bold text-slate-900">₹ {totalTaxable.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600 font-semibold">
                  <span>CGST Total:</span>
                  <span className="font-mono font-bold text-slate-900">₹ {totalCgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600 font-semibold">
                  <span>SGST Total:</span>
                  <span className="font-mono font-bold text-slate-900">₹ {totalSgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t-2 border-slate-800 pt-2 text-sm font-black text-slate-900">
                  <span>Grand Total:</span>
                  <span className="font-mono text-base text-primary">₹ {grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-emerald-600 font-bold pt-1">
                  <span>Amount Paid ({bill.payment_mode || 'Cash'}):</span>
                  <span className="font-mono">₹ {amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between border-t border-dashed border-slate-200 pt-1 font-bold">
                  <span className="text-slate-500">Balance Due:</span>
                  <span className={`font-mono font-black ${dueAmount > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                    ₹ {dueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* TERMS & SIGNATURE */}
            <div className="flex justify-between items-end pt-4 border-t border-slate-200 text-xs">
              <div className="text-[10px] text-slate-400 space-y-0.5">
                <div className="font-bold text-slate-600 uppercase">Terms & Conditions</div>
                <div>1. All rates are inclusive of GST.</div>
                <div>2. Goods once sold will not be taken back without valid inspection.</div>
              </div>
              <div className="text-right">
                <div className="border-t border-slate-400 w-44 pt-1 font-bold text-[10px] uppercase text-slate-700">
                  Authorized Signatory
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={() => printInvoiceDocument(bill, items, companyDetails, 'A4')}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 shadow-sm"
          >
            🖨️ Print A4
          </button>
          <button
            type="button"
            onClick={() => printInvoiceDocument(bill, items, companyDetails, 'A2')}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 shadow-sm"
          >
            🖨️ Print A2
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all uppercase tracking-wider"
          >
            Close
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};

export default TaxInvoiceModal;
