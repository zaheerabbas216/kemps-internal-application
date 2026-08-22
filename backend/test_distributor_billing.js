import jwt from 'jsonwebtoken';
import pool from './config/db.js';
import app from './app.js';

async function runTests() {
  console.log('--- STARTING DISTRIBUTOR BILLING INTEGRATION TEST ---');
  let server;
  let finishedProductId = null;
  let createdOrderIds = [];
  let createdBillIds = [];
  let testCustomerId = null;

  try {
    // 1. Setup Master Product
    console.log('Step 1: Setting up master product...');
    const [products] = await pool.query('SELECT id FROM finished_products LIMIT 1');
    if (products.length > 0) {
      finishedProductId = products[0].id;
      console.log(`Using existing finished product ID: ${finishedProductId}`);
    } else {
      const [insertProduct] = await pool.query(
        `INSERT INTO finished_products (name, size, type, rate) 
         VALUES ('Test Distributor Product Unit', '1 Litre', 'PET Bottle', 15.00)`
      );
      finishedProductId = insertProduct.insertId;
      console.log(`Created temporary finished product ID: ${finishedProductId}`);
    }

    // 2. Generate Auth Token
    console.log('Step 2: Generating signed test JWT...');
    const JWT_SECRET = process.env.JWT_SECRET || 'kemps_secret_key_123';
    const token = jwt.sign({ username: 'test_admin', name: 'Test Admin' }, JWT_SECRET, { expiresIn: '1h' });

    // 3. Start Test Express Server
    console.log('Step 3: Starting test Express server...');
    server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}/api`;
    console.log(`Test server listening on port: ${port}`);

    // Helper for authenticated fetch
    const authFetch = async (url, options = {}) => {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
      };
      const response = await fetch(url, { ...options, headers });
      const data = await response.json();
      return { status: response.status, data };
    };

    // 4. Create a Distributor Order
    console.log('Step 4: Creating a new Distributor order...');
    const orderPayload = {
      customerId: null,
      customerName: 'Integration Distributor Customer',
      customerPhone: '9888877777',
      customerGstin: '29DISTRIB1234F1',
      customerAddress: '789 Distributor warehouse, Belgaum',
      customerType: 'Distributor', // Locked to Distributor
      alternatePhone: '9777766666',
      supplyDate: '2026-06-15',
      supplyTime: '09:00:00',
      deliveryAddress: '789 Distributor warehouse, Belgaum',
      deliveryInstructions: 'Wholesale delivery',
      subTotal: 1500.00,
      discount: 0.00,
      tax: 0.00,
      grandTotal: 1500.00,
      paymentMode: 'Credit',
      advanceAmount: 500.00,
      notes: 'Distributor test order notes',
      items: [
        {
          finishedProductId: finishedProductId,
          quantity: 100,
          rate: 15.00
        }
      ]
    };

    const orderCreateRes = await authFetch(`${baseUrl}/orders`, {
      method: 'POST',
      body: JSON.stringify(orderPayload)
    });

    if (!orderCreateRes.data.ok) {
      throw new Error(`Failed to create distributor order: ${orderCreateRes.data.error}`);
    }

    const orderId = orderCreateRes.data.id;
    createdOrderIds.push(orderId);
    console.log(`Distributor order created successfully with ID: ${orderId}`);

    // Capture created customer ID
    const [orderRow] = await pool.query('SELECT customer_id FROM customer_orders WHERE id = ?', [orderId]);
    if (orderRow.length > 0) {
      testCustomerId = orderRow[0].customer_id;
      console.log(`Resolved test customer ID: ${testCustomerId}`);
    }

    // 5. Verify customerType Query Filtering in Orders List
    console.log('Step 5: Verifying customerType filtering on GET /api/orders...');
    
    // Querying for customerType=Distributor
    const listDistRes = await authFetch(`${baseUrl}/orders?customerType=Distributor`);
    if (!listDistRes.data.ok) {
      throw new Error(`Failed to list distributor orders: ${listDistRes.data.error}`);
    }
    const distOrderFound = listDistRes.data.orders.some(o => o.id === orderId);
    if (!distOrderFound) {
      throw new Error('Distributor order was not found when querying with customerType=Distributor');
    }
    console.log('✔ Successfully retrieved distributor order with filter customerType=Distributor');

    // Querying for customerType=Function Order
    const listFuncRes = await authFetch(`${baseUrl}/orders?customerType=Function Order`);
    if (!listFuncRes.data.ok) {
      throw new Error(`Failed to list function orders: ${listFuncRes.data.error}`);
    }
    const distOrderInFuncList = listFuncRes.data.orders.some(o => o.id === orderId);
    if (distOrderInFuncList) {
      throw new Error('Distributor order incorrectly returned when querying with customerType=Function Order');
    }
    console.log('✔ Verified distributor order is NOT returned under customerType=Function Order');

    // 6. Generate Bill from Distributor Order
    console.log('Step 6: Simulating Generate Bill flow via POST /api/billing...');
    const billingPayload = {
      billingDate: '2026-06-09',
      company: 'Kempannavar Industries',
      customerType: 'Distributor', // Locked to Distributor
      customerName: 'Integration Distributor Customer',
      customerPhone: '9888877777',
      customerGstin: '29DISTRIB1234F1',
      customerAddress: '789 Distributor warehouse, Belgaum',
      grandTotal: 1500.00,
      paymentMode: 'Cash + Credit',
      amountPaid: 500.00,
      dueAmount: 1000.00,
      items: [
        {
          finishedProductId: finishedProductId,
          quantity: 100,
          rateWithTax: 15.00,
          taxPercent: 18
        }
      ],
      orderId: orderId, // Links and marks order as SUPPLIED
      cashPaid: 500.00,
      upiPaid: 0.00,
      bankPaid: 0.00
    };

    const billCreateRes = await authFetch(`${baseUrl}/billing`, {
      method: 'POST',
      body: JSON.stringify(billingPayload)
    });

    if (!billCreateRes.data.ok) {
      throw new Error(`Failed to generate bill from order: ${billCreateRes.data.error}`);
    }

    const billId = billCreateRes.data.id;
    createdBillIds.push(billId);
    console.log(`Bill generated successfully with ID: ${billId}`);

    // 7. Verify Order Status Changed to SUPPLIED
    console.log('Step 7: Checking order status after bill generation...');
    const getOrderRes = await authFetch(`${baseUrl}/orders/${orderId}`);
    if (!getOrderRes.data.ok) {
      throw new Error(`Failed to fetch order: ${getOrderRes.data.error}`);
    }
    const orderStatus = getOrderRes.data.order.status;
    console.log(`- Order Status: ${orderStatus}`);
    if (orderStatus !== 'SUPPLIED') {
      throw new Error(`Expected order status to be SUPPLIED, but got: ${orderStatus}`);
    }
    console.log('✔ Verified order status updated to SUPPLIED.');

    // 8. Verify Credit Balance under Distributor
    console.log('Step 8: Checking if due amount shows up on Credit Balance under Distributor...');
    const creditRes = await authFetch(`${baseUrl}/credit-balance/outstanding?customerType=Distributor`);
    if (!creditRes.data.ok) {
      throw new Error(`Failed to fetch outstanding balances: ${creditRes.data.error}`);
    }

    const outstandingBill = creditRes.data.bills.find(b => b.id === billId);
    if (!outstandingBill) {
      throw new Error('Distributor bill with due amount was not found in outstanding list');
    }

    console.log(`- Outstanding Invoice Total: ₹${outstandingBill.grand_total}`);
    console.log(`- Outstanding Invoice Paid: ₹${outstandingBill.amount_paid}`);
    console.log(`- Outstanding Invoice Due: ₹${outstandingBill.due_amount}`);
    console.log(`- Outstanding Invoice Customer Type: ${outstandingBill.customer_type}`);

    if (parseFloat(outstandingBill.due_amount) !== 1000.00) {
      throw new Error(`Expected outstanding due of 1000.00, but got: ${outstandingBill.due_amount}`);
    }
    if (outstandingBill.customer_type !== 'Distributor') {
      throw new Error(`Expected customer type to be Distributor, but got: ${outstandingBill.customer_type}`);
    }
    console.log('✔ Verified due amount is correctly logged and filtered under credit balance.');

    console.log('--- ALL DISTRIBUTOR BILLING INTEGRATION TESTS PASSED ---');
  } catch (error) {
    console.error('--- DISTRIBUTOR BILLING INTEGRATION TEST FAILED ---');
    console.error(error);
    process.exitCode = 1;
  } finally {
    // 9. Database Cleanup
    console.log('Step 9: Cleaning up test records...');
    try {
      if (createdBillIds.length > 0) {
        console.log(`Deleting customer bill items, stock register entries, customer payments, and bills for: ${createdBillIds.join(', ')}`);
        // Cascading deletes
        await pool.query('DELETE FROM customer_bill_items WHERE bill_id IN (?)', [createdBillIds]);
        await pool.query('DELETE FROM stock_register WHERE reference_id IN (?) AND transaction_type = "SALE"', [createdBillIds]);
        await pool.query('DELETE FROM customer_payments WHERE bill_id IN (?)', [createdBillIds]);
        await pool.query('DELETE FROM customer_bills WHERE id IN (?)', [createdBillIds]);
      }
      if (createdOrderIds.length > 0) {
        console.log(`Deleting customer order items and orders for: ${createdOrderIds.join(', ')}`);
        await pool.query('DELETE FROM customer_order_items WHERE order_id IN (?)', [createdOrderIds]);
        await pool.query('DELETE FROM customer_orders WHERE id IN (?)', [createdOrderIds]);
      }
      if (testCustomerId) {
        console.log(`Deleting test customer ID: ${testCustomerId}`);
        await pool.query('DELETE FROM customers WHERE id = ?', [testCustomerId]);
      }
      console.log('Database cleanup finished.');
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }

    if (server) {
      server.close();
      console.log('Test Express server stopped.');
    }
    await pool.end();
    console.log('Database connection pool closed.');
  }
}

runTests();
