import jwt from 'jsonwebtoken';
import pool from './config/db.js';
import app from './app.js';

async function runTests() {
  console.log('--- STARTING ORDER MANAGEMENT INTEGRATION TEST ---');
  let server;
  let finishedProductId = null;
  let createdOrderIds = [];
  let testCustomerId = null;

  try {
    // 1. Verify/Setup Master Data
    console.log('Step 1: Setting up master product and customer...');
    
    // Check if we have at least one finished product
    const [products] = await pool.query('SELECT id FROM finished_products LIMIT 1');
    if (products.length > 0) {
      finishedProductId = products[0].id;
      console.log(`Using existing finished product ID: ${finishedProductId}`);
    } else {
      // Create a temporary finished product
      const [insertProduct] = await pool.query(
        `INSERT INTO finished_products (name, size, type, rate) 
         VALUES ('Test Product Order Unit', '500ml', 'PET Bottle', 10.00)`
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
    server = app.listen(0); // Random port
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}/api/orders`;
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

    // 4. Test Create Order
    console.log('Step 4: Creating a new customer order...');
    const orderPayload = {
      customerId: null,
      customerName: 'Test Integration Order Customer',
      customerPhone: '9999988888',
      customerGstin: '29ABCDE1234F1Z5',
      customerAddress: '123 Test Street, Bangalore',
      customerType: 'General Customer',
      alternatePhone: '8888877777',
      supplyDate: '2026-07-10',
      supplyTime: '14:30:00',
      deliveryAddress: '456 Delivery Lane, Bangalore',
      deliveryInstructions: 'Deliver by truck, handle with care',
      subTotal: 1000.00,
      discount: 0.00,
      tax: 0.00,
      grandTotal: 1000.00,
      paymentMode: 'Cash',
      advanceAmount: 400.00,
      notes: 'Initial test order notes',
      items: [
        {
          finishedProductId: finishedProductId,
          quantity: 100,
          rate: 10.00
        }
      ]
    };

    const createRes = await authFetch(baseUrl, {
      method: 'POST',
      body: JSON.stringify(orderPayload)
    });

    if (!createRes.data.ok) {
      throw new Error(`Failed to create order: ${createRes.data.error}`);
    }

    const orderId1 = createRes.data.id;
    createdOrderIds.push(orderId1);
    console.log(`Order created successfully with ID: ${orderId1}`);

    // Capture the customer ID created during the process for cleanup later
    const [orderRow] = await pool.query('SELECT customer_id FROM customer_orders WHERE id = ?', [orderId1]);
    if (orderRow.length > 0) {
      testCustomerId = orderRow[0].customer_id;
      console.log(`Resolved test customer ID: ${testCustomerId}`);
    }

    // 5. Test Retrieve & Verify Calculations
    console.log('Step 5: Retrieving order and verifying pending amount...');
    const getRes = await authFetch(`${baseUrl}/${orderId1}`);
    if (!getRes.data.ok) {
      throw new Error(`Failed to retrieve order: ${getRes.data.error}`);
    }

    const order = getRes.data.order;
    const items = getRes.data.items;

    console.log(`- Grand Total: ₹${order.grand_total}`);
    console.log(`- Advance Amount: ₹${order.advance_amount}`);
    console.log(`- Pending Amount: ₹${order.pending_amount}`);
    console.log(`- Status: ${order.status}`);

    if (parseFloat(order.grand_total) !== 1000.00) throw new Error('Grand Total mismatch');
    if (parseFloat(order.advance_amount) !== 400.00) throw new Error('Advance Amount mismatch');
    if (parseFloat(order.pending_amount) !== 600.00) throw new Error('Pending Amount mismatch (should be 600)');
    if (order.status !== 'PENDING') throw new Error('Initial status should be PENDING');
    if (items.length !== 1 || parseInt(items[0].quantity) !== 100) throw new Error('Items list is incorrect');

    // 6. Test Edit Order
    console.log('Step 6: Editing the order (increasing quantity to change grand total)...');
    const editPayload = {
      supplyDate: '2026-07-11',
      supplyTime: '15:00:00',
      deliveryAddress: '456 Updated Lane, Bangalore',
      deliveryInstructions: 'Call customer before delivery',
      alternatePhone: '8888877770',
      subTotal: 1200.00,
      discount: 0.00,
      tax: 0.00,
      grandTotal: 1200.00,
      paymentMode: 'Cash',
      advanceAmount: 400.00,
      notes: 'Updated order notes',
      items: [
        {
          finishedProductId: finishedProductId,
          quantity: 120, // Increased
          rate: 10.00
        }
      ]
    };

    const editRes = await authFetch(`${baseUrl}/${orderId1}`, {
      method: 'PUT',
      body: JSON.stringify(editPayload)
    });

    if (!editRes.data.ok) {
      throw new Error(`Failed to edit order: ${editRes.data.error}`);
    }
    console.log('Order updated successfully.');

    // Verify edited details
    const getRes2 = await authFetch(`${baseUrl}/${orderId1}`);
    const updatedOrder = getRes2.data.order;
    console.log(`- Updated Grand Total: ₹${updatedOrder.grand_total}`);
    console.log(`- Updated Pending Amount: ₹${updatedOrder.pending_amount}`);
    if (parseFloat(updatedOrder.grand_total) !== 1200.00) throw new Error('Updated Grand Total mismatch');
    if (parseFloat(updatedOrder.pending_amount) !== 800.00) throw new Error('Updated Pending Amount mismatch (should be 800)');

    // 7. Test Mark as Supplied & Lock constraints
    console.log('Step 7: Marking the order as supplied and verifying status lock...');
    const supplyRes = await authFetch(`${baseUrl}/${orderId1}/supply`, { method: 'POST' });
    if (!supplyRes.data.ok) {
      throw new Error(`Failed to mark supplied: ${supplyRes.data.error}`);
    }
    console.log('Order marked as SUPPLIED.');

    // Verify state
    const getRes3 = await authFetch(`${baseUrl}/${orderId1}`);
    if (getRes3.data.order.status !== 'SUPPLIED') {
      throw new Error(`Expected status SUPPLIED but got: ${getRes3.data.order.status}`);
    }

    // Try to edit supplied order - should be blocked
    console.log('Verifying editing a SUPPLIED order is blocked...');
    const failEditRes = await authFetch(`${baseUrl}/${orderId1}`, {
      method: 'PUT',
      body: JSON.stringify(editPayload)
    });
    if (failEditRes.status !== 400 || failEditRes.data.ok) {
      throw new Error('Expected 400 error when trying to edit a supplied order, but succeeded.');
    }
    console.log(`Success: Blocked edit correctly with message: "${failEditRes.data.error}"`);

    // Try to cancel supplied order - should be blocked
    console.log('Verifying cancelling a SUPPLIED order is blocked...');
    const failCancelRes = await authFetch(`${baseUrl}/${orderId1}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Cancelled test' })
    });
    if (failCancelRes.status !== 400 || failCancelRes.data.ok) {
      throw new Error('Expected 400 error when trying to cancel a supplied order, but succeeded.');
    }
    console.log(`Success: Blocked cancellation correctly with message: "${failCancelRes.data.error}"`);

    // 8. Test Cancellation Flow
    console.log('Step 8: Logging a second order and cancelling it...');
    const order2Payload = { ...orderPayload, customerId: testCustomerId, customerPhone: '9999988888' };
    const createRes2 = await authFetch(baseUrl, {
      method: 'POST',
      body: JSON.stringify(order2Payload)
    });
    const orderId2 = createRes2.data.id;
    createdOrderIds.push(orderId2);
    console.log(`Second order created: ${orderId2}`);

    // Cancel order 2
    const cancelRes = await authFetch(`${baseUrl}/${orderId2}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Customer changed mind' })
    });
    if (!cancelRes.data.ok) {
      throw new Error(`Failed to cancel order 2: ${cancelRes.data.error}`);
    }
    console.log('Second order cancelled successfully.');

    // Verify cancellation audit
    const getRes4 = await authFetch(`${baseUrl}/${orderId2}`);
    const cancelledOrder = getRes4.data.order;
    if (cancelledOrder.status !== 'CANCELLED') throw new Error('Expected status CANCELLED');
    if (cancelledOrder.cancellation_reason !== 'Customer changed mind') {
      throw new Error(`Cancellation reason mismatch, got: ${cancelledOrder.cancellation_reason}`);
    }
    console.log(`- Cancellation Reason logged: "${cancelledOrder.cancellation_reason}"`);

    // Try to edit cancelled order - should be blocked
    console.log('Verifying editing a CANCELLED order is blocked...');
    const failEditRes2 = await authFetch(`${baseUrl}/${orderId2}`, {
      method: 'PUT',
      body: JSON.stringify(editPayload)
    });
    if (failEditRes2.status !== 400 || failEditRes2.data.ok) {
      throw new Error('Expected 400 error when trying to edit a cancelled order, but succeeded.');
    }
    console.log(`Success: Blocked edit on cancelled order correctly with message: "${failEditRes2.data.error}"`);

    // 9. Verify Dashboard Widgets
    console.log('Step 9: Testing dashboard widgets logic...');
    const widgetRes = await authFetch(`${baseUrl}/dashboard-widgets`);
    if (!widgetRes.data.ok) {
      throw new Error(`Failed to retrieve widgets: ${widgetRes.data.error}`);
    }
    const widgets = widgetRes.data.widgets;
    console.log('Dashboard widgets loaded:', widgets);
    // Since we created, edited, cancelled, and supplied in the same run, counts should update.
    console.log(`- Today's Deliveries: ${widgets.todayDeliveries}`);
    console.log(`- Pending Count: ${widgets.pendingCount}`);
    console.log(`- Supplied Today: ${widgets.suppliedToday}`);
    console.log(`- Cancelled Today: ${widgets.cancelledToday}`);

    console.log('--- ALL INTEGRATION TESTS PASSED SUCCESSFULLY ---');
  } catch (error) {
    console.error('--- INTEGRATION TEST FAILED ---');
    console.error(error);
    process.exitCode = 1;
  } finally {
    // 10. Database Cleanup
    console.log('Step 10: Cleaning up database test records...');
    try {
      if (createdOrderIds.length > 0) {
        console.log(`Deleting test order items and orders for: ${createdOrderIds.join(', ')}`);
        // Cascades will delete items
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
