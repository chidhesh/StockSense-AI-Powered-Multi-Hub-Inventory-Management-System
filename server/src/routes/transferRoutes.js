import express from 'express';
import pool from '../config/db.js';
import { query } from '../config/db.js';
import crypto from 'node:crypto';

const router = express.Router();

const sendInAppNotification = async (userIds, title, message, type, data, referenceId = null, referenceType = null) => {
  for (const userId of userIds) {
    try {
      await pool.query(
        `INSERT INTO notifications (user_id, title, message, type, data, is_read, reference_id, reference_type) 
         VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7)`,
        [userId, title, message, type, JSON.stringify(data), referenceId, referenceType]
      );
      console.log('Notification sent to user:', userId, 'title:', title);
    } catch (e) {
      console.error('Failed to send notification:', e);
    }
  }
};

const addTransferTimelineEntry = async (transferId, status, changedById, changedByName, notes) => {
  try {
    await pool.query(
      `INSERT INTO transfer_timeline (transfer_request_id, status, changed_by_id, changed_by_name, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [transferId, status, changedById, changedByName, notes]
    );
  } catch (e) {
    console.error('Failed to add timeline entry:', e);
  }
};

const getRecipients = async (roles, centerId = null) => {
  let sql = `SELECT u.id, u.email, p.full_name, p.center_id, p.role
             FROM app_users u JOIN profiles p ON u.id = p.id WHERE 1=1`;
  const params = [];

  const roleMappings = {
    'system_admin': ['system_admin', 'System Administrator'],
    'main_admin': ['main_admin', 'Main Admin'],
    'center_admin': ['center_admin', 'Center Admin'],
    'inventory_manager': ['inventory_manager', 'Inventory Manager']
  };

  const allRolesToCheck = [];
  roles.forEach(role => {
    if (roleMappings[role]) {
      allRolesToCheck.push(...roleMappings[role]);
    } else {
      allRolesToCheck.push(role);
    }
  });

  if (allRolesToCheck.length > 0) {
    sql += ` AND (p.role IN (${allRolesToCheck.map((_, i) => `$${i + 1}`).join(',')})`;
    sql += ` OR LOWER(p.role) IN (${allRolesToCheck.map((_, i) => `$${i + 1 + allRolesToCheck.length}`).join(',')}))`;
    params.push(...allRolesToCheck);
    params.push(...allRolesToCheck.map(r => r.toLowerCase()));
  }

  if (centerId) {
    sql += ` AND p.center_id = $${params.length + 1}`;
    params.push(centerId);
  }

  const result = await pool.query(sql, params);
  console.log('getRecipients called with roles:', roles, 'found:', result.rows.map(r => ({ id: r.id, role: r.role })));
  return result.rows;
};

// Generate Transfer Requests from Replenishment Request
router.post('/replenishment-requests/:id/generate-transfer-requests', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    await client.query('BEGIN');

    const repReqResult = await client.query('SELECT * FROM replenishment_requests WHERE id = $1', [id]);
    const replenishmentRequest = repReqResult.rows[0];
    if (!replenishmentRequest) {
      return res.status(404).json({ error: 'Replenishment request not found' });
    }

    const componentResult = await client.query(`SELECT * FROM components WHERE id = $1`, [replenishmentRequest.component_id]);
    const component = componentResult.rows[0];

    if (!component) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Component not found' });
    }

    let allocationPlan = [];
    try {
      if (typeof replenishmentRequest.ai_transfer_allocation === 'string') {
        allocationPlan = JSON.parse(replenishmentRequest.ai_transfer_allocation || '[]');
      } else if (Array.isArray(replenishmentRequest.ai_transfer_allocation)) {
        allocationPlan = replenishmentRequest.ai_transfer_allocation;
      }
    } catch (e) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Failed to parse transfer allocation plan' });
    }

    const userResult = await client.query('SELECT full_name FROM profiles WHERE id = $1', [userId]);
    const userName = userResult.rows[0]?.full_name || 'User';

    const createdTransfers = [];

    for (const allocation of allocationPlan) {
      const sourceManagers = await getRecipients(['center_admin', 'inventory_manager'], allocation.source_hub_id || allocation.sourceHubId);
      const sourceManager = sourceManagers[0];

      const destManagers = await getRecipients(['center_admin', 'inventory_manager'], allocation.destination_hub_id || allocation.destinationHubId);
      const destManager = destManagers[0];

      const systemAdmins = await getRecipients(['system_admin']);
      const mainAdmins = await getRecipients(['main_admin']);

      const sourceHubId = allocation.source_hub_id || allocation.sourceHubId;
      const destHubId = allocation.destination_hub_id || allocation.destinationHubId;

      const sourceHubRes = await client.query("SELECT name FROM centers WHERE id = $1", [sourceHubId]);
      const destHubRes = await client.query("SELECT name FROM centers WHERE id = $1", [destHubId]);
      const sourceHubName = sourceHubRes.rows[0]?.name || 'Unknown Hub';
      const destHubName = destHubRes.rows[0]?.name || replenishmentRequest.center_name || 'Unknown Hub';

      const now = new Date();
      const year = now.getFullYear();
      const randomSuffix = Math.floor(Math.random() * 900000 + 100000);
      const requestId = `TR-${year}-${randomSuffix}`;

      const transferQuantity = allocation.quantity || allocation.transferQuantity || allocation.transfer_quantity;
      if (!transferQuantity) continue;

      const transferResult = await client.query(
        `INSERT INTO transfer_requests 
         (id, request_id, source_hub_id, destination_hub_id, component_id, component_name,
          quantity, reason, inventory_manager_id, system_admin_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          crypto.randomUUID(), requestId,
          sourceHubId, destHubId,
          replenishmentRequest.component_id,
          component?.name || replenishmentRequest.component_name,
          transferQuantity,
          `Replenishment for ${destHubName}`,
          sourceManager?.id || null,
          userId,
          'pending'
        ]
      );

      const newTransfer = transferResult.rows[0];
      createdTransfers.push(newTransfer);

      if (sourceManager?.id) {
        await sendInAppNotification(
          [sourceManager.id],
          'New Transfer Request',
          `Transfer Request ${requestId} has been generated. ${destHubName} requires ${transferQuantity} ${component?.name || replenishmentRequest.component_name} units. Please review and approve.`,
          'transfer_recommendation',
          { transferId: newTransfer.id, requestId, componentName: component?.name || replenishmentRequest.component_name },
          requestId,
          'transfer'
        );
      }

      const adminIds = [...systemAdmins.map(a => a.id), ...mainAdmins.map(a => a.id)].filter(Boolean);
      if (adminIds.length > 0) {
        await sendInAppNotification(
          adminIds,
          'Transfer Request Created',
          `Transfer Request ${requestId} has been created for ${component?.name || replenishmentRequest.component_name}`,
          'transfer_recommendation',
          { transferId: newTransfer.id, requestId },
          requestId,
          'transfer'
        );
      }
    }

    await client.query(
      `UPDATE replenishment_requests SET status = 'TRANSFER_REQUESTS_GENERATED', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');
    return res.json({ success: true, transfers: createdTransfers });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Generate transfer requests error:', error);
    return res.status(500).json({ error: 'Failed to generate transfer requests', details: error.message });
  } finally {
    client.release();
  }
});

// Get all transfer requests, filtered for current user
router.get('/transfer-requests', async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const profileResult = await client.query('SELECT center_id, role FROM profiles WHERE id = $1', [userId]);
    const profile = profileResult.rows[0];

    let queryStr = `
      SELECT tr.*, 
        sc.name as source_hub_name, 
        dc.name as destination_hub_name,
        p.full_name as inventory_manager_name,
        p2.full_name as system_admin_name
      FROM transfer_requests tr
      JOIN centers sc ON tr.source_hub_id = sc.id
      JOIN centers dc ON tr.destination_hub_id = dc.id
      LEFT JOIN profiles p ON tr.inventory_manager_id = p.id
      LEFT JOIN profiles p2 ON tr.system_admin_id = p2.id
    `;
    const params = [];

    if (profile) {
      const normalizedRole = profile.role?.toLowerCase() || '';
      if (normalizedRole.includes('system_admin') || normalizedRole.includes('main_admin')) {
        // No filter for admins
      } else {
        // Only show transfers related to user's hub
        queryStr += ` WHERE tr.source_hub_id = $1 OR tr.destination_hub_id = $1`;
        params.push(profile.center_id);
      }
    }

    queryStr += ` ORDER BY tr.created_at DESC`;

    const result = await client.query(queryStr, params);
    return res.json(result.rows);
  } catch (error) {
    console.error('Get transfer requests error:', error);
    return res.status(500).json({ error: 'Failed to get transfer requests' });
  } finally {
    client.release();
  }
});

// Get single transfer request
router.get('/transfer-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const transferResult = await pool.query(
      `SELECT tr.*, 
        sc.name as source_hub_name, 
        dc.name as destination_hub_name,
        p.full_name as dest_manager_name,
        p.phone as dest_manager_phone
      FROM transfer_requests tr
      JOIN centers sc ON tr.source_hub_id = sc.id
      JOIN centers dc ON tr.destination_hub_id = dc.id
      LEFT JOIN profiles p ON p.center_id = tr.destination_hub_id
         AND (p.role = 'center_admin' OR p.role = 'inventory_manager')
      WHERE tr.id = $1
      LIMIT 1`,
      [id]
    );

    const transfer = transferResult.rows[0];
    if (!transfer) return res.status(404).json({ error: 'Transfer not found' });

    return res.json(transfer);
  } catch (error) {
    console.error('Get transfer error:', error);
    return res.status(500).json({ error: 'Failed to load transfer' });
  }
});

// Approve/Reject Transfer Request
router.patch('/transfer-requests/:id/approve', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { action, reason } = req.body; // action: 'approve' or 'reject'

    await client.query('BEGIN');

    const userResult = await client.query('SELECT full_name FROM profiles WHERE id = $1', [userId]);
    const userName = userResult.rows[0]?.full_name || 'User';

    const transferResult = await client.query('SELECT * FROM transfer_requests WHERE id = $1', [id]);
    const transfer = transferResult.rows[0];
    if (!transfer) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    let newStatus;
    let notes;
    if (action === 'reject') {
      newStatus = 'rejected';
      notes = `Rejected: ${reason || 'No reason provided'}`;
    } else {
      newStatus = 'approved';
      notes = 'Transfer approved';
    }

    await client.query(
      `UPDATE transfer_requests SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, id]
    );

    await addTransferTimelineEntry(id, newStatus, userId, userName, notes);

    const systemAdmins = await getRecipients(['system_admin']);
    const mainAdmins = await getRecipients(['main_admin']);
    const destManagers = await getRecipients(['center_admin', 'inventory_manager'], transfer.destination_hub_id);

    const allRecipientIds = [
      ...systemAdmins.map(a => a.id),
      ...mainAdmins.map(a => a.id),
      ...destManagers.map(a => a.id)
    ].filter(Boolean);

    await sendInAppNotification(
      allRecipientIds,
      newStatus === 'rejected' ? 'Transfer Rejected' : 'Transfer Approved',
      newStatus === 'rejected'
        ? `Transfer Request ${transfer.request_id} has been rejected.`
        : `Transfer Request ${transfer.request_id} has been approved by ${transfer.source_hub_name}.`,
      'transfer_approval',
      { transferId: id, requestId: transfer.request_id },
      transfer.request_id,
      'transfer'
    );

    await client.query('COMMIT');
    return res.json({ success: true, status: newStatus });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Approve transfer error:', error);
    return res.status(500).json({ error: 'Failed to update transfer' });
  } finally {
    client.release();
  }
});

// Mark as Shipped
router.patch('/transfer-requests/:id/ship', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    await client.query('BEGIN');

    const userResult = await client.query('SELECT full_name FROM profiles WHERE id = $1', [userId]);
    const userName = userResult.rows[0]?.full_name || 'User';

    const transferResult = await client.query(
      `UPDATE transfer_requests 
       SET status = 'in_transit', 
           shipment_date = NOW(), 
           shipped_by = $1,
           updated_at = NOW()
       WHERE id = $2 
       RETURNING *`,
      [userId, id]
    );
    const transfer = transferResult.rows[0];
    if (!transfer) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    await addTransferTimelineEntry(id, 'in_transit', userId, userName, 'Transfer marked as shipped');

    const systemAdmins = await getRecipients(['system_admin']);
    const mainAdmins = await getRecipients(['main_admin']);
    const destManagers = await getRecipients(['center_admin', 'inventory_manager'], transfer.destination_hub_id);

    const allRecipientIds = [
      ...systemAdmins.map(a => a.id),
      ...mainAdmins.map(a => a.id),
      ...destManagers.map(a => a.id)
    ].filter(Boolean);

    await sendInAppNotification(
      allRecipientIds,
      'Transfer In Transit',
      `Transfer Request ${transfer.request_id} is now in transit.`,
      'transfer_dispatch',
      { transferId: id, requestId: transfer.request_id },
      transfer.request_id,
      'transfer'
    );

    await client.query('COMMIT');
    return res.json({ success: true, transfer });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Ship transfer error:', error);
    return res.status(500).json({ error: 'Failed to ship transfer' });
  } finally {
    client.release();
  }
});

// Confirm Receipt & Update Inventory (and alias for confirm-delivery)
const handleConfirmReceipt = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    await client.query('BEGIN');

    // Get user info
    const userResult = await client.query('SELECT full_name, center_id FROM profiles WHERE id = $1', [userId]);
    const userProfile = userResult.rows[0];
    const userName = userProfile?.full_name || 'User';

    // Get transfer request
    const transferResult = await client.query('SELECT * FROM transfer_requests WHERE id = $1', [id]);
    const transfer = transferResult.rows[0];
    if (!transfer) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found' });
    }

    // Validate status is 'in_transit'
    if (transfer.status !== 'in_transit') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Transfer must be in In Transit status to confirm receipt' });
    }

    console.log('🔄 Starting transfer inventory update for:', transfer.request_id);

    // Find source component
    const sourceCompResult = await client.query(
      `SELECT * FROM components WHERE center_id = $1 AND name = $2 LIMIT 1`,
      [transfer.source_hub_id, transfer.component_name]
    );
    const sourceComp = sourceCompResult.rows[0];
    if (!sourceComp) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Source component not found' });
    }

    // Find destination component or create it
    let destCompResult = await client.query(
      `SELECT * FROM components WHERE center_id = $1 AND name = $2 LIMIT 1`,
      [transfer.destination_hub_id, transfer.component_name]
    );
    let destComp = destCompResult.rows[0];

    // 1. Update SOURCE hub component
    const newSourceTotal = sourceComp.total_quantity - transfer.quantity;
    const newSourceAvailable = sourceComp.available_quantity - transfer.quantity;
    const newSourceStatus = newSourceTotal <= 0 ? 'out_of_stock' : (newSourceTotal <= (sourceComp.min_stock_threshold || 10) ? 'low_stock' : 'active');

    await client.query(
      `UPDATE components 
       SET total_quantity = $1, available_quantity = $2, status = $3, updated_at = NOW() 
       WHERE id = $4`,
      [newSourceTotal, newSourceAvailable, newSourceStatus, sourceComp.id]
    );
    console.log(`📉 Source Hub inventory updated: ${transfer.component_name} → ${newSourceTotal} units`);

    // Create TRANSFER_OUT transaction
    await client.query(
      `INSERT INTO inventory_transactions (component_id, center_id, transaction_type, quantity, performed_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sourceComp.id, transfer.source_hub_id, 'transfer', -transfer.quantity, userId, `Transfer to ${transfer.destination_hub_name}`]
    );

    // Add audit log for source hub
    await client.query(
      `INSERT INTO audit_logs (action, component_id, hub_id, before_quantity, transferred_quantity, after_quantity, user_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'TRANSFER_OUT',
        sourceComp.id,
        transfer.source_hub_id,
        sourceComp.total_quantity,
        transfer.quantity,
        newSourceTotal,
        userId,
        JSON.stringify({
          transferId: transfer.id,
          requestId: transfer.request_id,
          destinationHubId: transfer.destination_hub_id,
          destinationHubName: transfer.destination_hub_name
        })
      ]
    );

    // 2. Update DESTINATION hub component
    if (!destComp) {
      // Create new component in destination hub
      const newDestCompResult = await client.query(
        `INSERT INTO components (id, name, category, total_quantity, available_quantity, center_id, unit_cost, status, min_stock_threshold, max_usage_limit, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         RETURNING *`,
        [
          crypto.randomUUID(), sourceComp.name, sourceComp.category,
          transfer.quantity, transfer.quantity,
          transfer.destination_hub_id, sourceComp.unit_cost, 'active',
          sourceComp.min_stock_threshold || 10, sourceComp.max_usage_limit || 2
        ]
      );
      destComp = newDestCompResult.rows[0];
      console.log(`📦 Created new component in destination hub: ${sourceComp.name} → ${transfer.quantity} units`);
    } else {
      // Update existing component in destination hub
      const newDestTotal = destComp.total_quantity + transfer.quantity;
      const newDestAvailable = destComp.available_quantity + transfer.quantity;
      const newDestStatus = newDestTotal <= 0 ? 'out_of_stock' : (newDestTotal <= (destComp.min_stock_threshold || 10) ? 'low_stock' : 'active');

      await client.query(
        `UPDATE components 
         SET total_quantity = $1, available_quantity = $2, status = $3, updated_at = NOW() 
         WHERE id = $4`,
        [newDestTotal, newDestAvailable, newDestStatus, destComp.id]
      );
      console.log(`📈 Destination Hub inventory updated: ${transfer.component_name} → ${newDestTotal} units`);
    }

    // Create TRANSFER_IN transaction for destination
    await client.query(
      `INSERT INTO inventory_transactions (component_id, center_id, transaction_type, quantity, performed_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [destComp.id, transfer.destination_hub_id, 'transfer', transfer.quantity, userId, `Transfer from ${transfer.source_hub_name}`]
    );

    // Add audit log for destination hub
    await client.query(
      `INSERT INTO audit_logs (action, component_id, hub_id, before_quantity, transferred_quantity, after_quantity, user_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'TRANSFER_IN',
        destComp.id,
        transfer.destination_hub_id,
        destComp.total_quantity - transfer.quantity,
        transfer.quantity,
        destComp.total_quantity,
        userId,
        JSON.stringify({
          transferId: transfer.id,
          requestId: transfer.request_id,
          sourceHubId: transfer.source_hub_id,
          sourceHubName: transfer.source_hub_name
        })
      ]
    );

    // 3. Mark transfer as completed with additional fields
    await client.query(
      `UPDATE transfer_requests 
       SET status = 'completed', 
           received_date = NOW(), 
           received_by = $1, 
           updated_at = NOW() 
       WHERE id = $2`,
      [userId, id]
    );

    await addTransferTimelineEntry(id, 'completed', userId, userName, 'Delivery confirmed and inventory updated');

    // 4. Send notifications
    const sourceManagers = await getRecipients(['center_admin', 'inventory_manager'], transfer.source_hub_id);
    const destManagers = await getRecipients(['center_admin', 'inventory_manager'], transfer.destination_hub_id);
    const systemAdmins = await getRecipients(['system_admin']);
    const mainAdmins = await getRecipients(['main_admin']);

    // Notify Source Managers
    if (sourceManagers.length > 0) {
      await sendInAppNotification(
        sourceManagers.map(m => m.id),
        'Transfer Delivered',
        `Transfer Request ${transfer.request_id} has been delivered successfully.`,
        'transfer_delivery',
        { transferId: id, requestId: transfer.request_id },
        transfer.request_id,
        'transfer'
      );
    }

    // Notify Destination Managers
    if (destManagers.length > 0) {
      await sendInAppNotification(
        destManagers.map(m => m.id),
        'Transfer Received',
        `Transfer Request ${transfer.request_id} has been received and inventory updated successfully.`,
        'transfer_delivery',
        { transferId: id, requestId: transfer.request_id },
        transfer.request_id,
        'transfer'
      );
    }

    // Notify Admins
    const adminIds = [...systemAdmins.map(a => a.id), ...mainAdmins.map(a => a.id)].filter(Boolean);
    if (adminIds.length > 0) {
      await sendInAppNotification(
        adminIds,
        'Transfer Completed',
        `Transfer Request ${transfer.request_id} completed successfully. ${transfer.component_name} (${transfer.quantity} units) transferred from ${transfer.source_hub_name} to ${transfer.destination_hub_name}.`,
        'transfer_delivery',
        { transferId: id, requestId: transfer.request_id },
        transfer.request_id,
        'transfer'
      );
    }

    await client.query('COMMIT');
    console.log('✅ Transfer inventory update completed successfully!');
    return res.json({ success: true, transfer });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Confirm receipt error:', error);
    return res.status(500).json({ error: 'Failed to confirm receipt', details: error.message });
  } finally {
    client.release();
  }
};

router.post('/transfer-requests/:id/confirm-receipt', handleConfirmReceipt);
router.post('/transfer-requests/:id/confirm-delivery', handleConfirmReceipt);

// Dashboard transfer stats
router.get('/transfer-stats', async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const profileResult = await client.query('SELECT center_id, role FROM profiles WHERE id = $1', [userId]);
    const profile = profileResult.rows[0];

    let pendingCount = 0;
    let incomingCount = 0;
    let approvedCount = 0;
    let completedCount = 0;

    let queryStr = `SELECT status, COUNT(*) FROM transfer_requests`;
    const params = [];

    if (profile) {
      const normalizedRole = profile.role?.toLowerCase() || '';
      if (!normalizedRole.includes('system_admin') && !normalizedRole.includes('main_admin')) {
        queryStr += ` WHERE source_hub_id = $1 OR destination_hub_id = $1`;
        params.push(profile.center_id);
      }
    }

    queryStr += ` GROUP BY status`;

    const result = await client.query(queryStr, params);

    const statusMap = {};
    result.rows.forEach(row => {
      statusMap[row.status] = parseInt(row.count);
    });

    pendingCount = statusMap['pending'] || 0;
    approvedCount = statusMap['approved'] || 0;
    incomingCount = statusMap['in_transit'] || 0;
    completedCount = statusMap['completed'] || 0;

    return res.json({ pendingCount, incomingCount, approvedCount, completedCount });
  } catch (error) {
    console.error('Get transfer stats error:', error);
    return res.status(500).json({ error: 'Failed to get transfer stats' });
  } finally {
    client.release();
  }
});

// Purchase Requests Routes

// Get all purchase requests, filtered for current user
router.get('/purchase-requests', async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const profileResult = await client.query('SELECT center_id, role FROM profiles WHERE id = $1', [userId]);
    const profile = profileResult.rows[0];

    let queryStr = `
      SELECT pr.*, 
        dc.name as destination_hub_name,
        p.full_name as created_by_name
      FROM purchase_requests pr
      JOIN centers dc ON pr.destination_hub_id = dc.id
      LEFT JOIN profiles p ON pr.created_by = p.id
    `;
    const params = [];

    if (profile) {
      const normalizedRole = profile.role?.toLowerCase() || '';
      if (normalizedRole.includes('system_admin') || normalizedRole.includes('main_admin')) {
        // No filter for admins
      } else {
        // Only show purchases related to user's hub
        queryStr += ` WHERE pr.destination_hub_id = $1`;
        params.push(profile.center_id);
      }
    }

    queryStr += ` ORDER BY pr.created_at DESC`;

    const result = await client.query(queryStr, params);
    return res.json(result.rows);
  } catch (error) {
    console.error('Get purchase requests error:', error);
    return res.status(500).json({ error: 'Failed to get purchase requests' });
  } finally {
    client.release();
  }
});

// Get single purchase request
router.get('/purchase-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const purchaseResult = await pool.query(
      `SELECT pr.*, 
        dc.name as destination_hub_name,
        p.full_name as created_by_name
      FROM purchase_requests pr
      JOIN centers dc ON pr.destination_hub_id = dc.id
      LEFT JOIN profiles p ON pr.created_by = p.id
      WHERE pr.id = $1
      LIMIT 1`,
      [id]
    );

    const purchase = purchaseResult.rows[0];
    if (!purchase) return res.status(404).json({ error: 'Purchase request not found' });

    return res.json(purchase);
  } catch (error) {
    console.error('Get purchase error:', error);
    return res.status(500).json({ error: 'Failed to load purchase request' });
  }
});

// Approve/Reject Purchase Request
router.patch('/purchase-requests/:id/approve', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { action, reason } = req.body;

    await client.query('BEGIN');

    const userResult = await client.query('SELECT full_name FROM profiles WHERE id = $1', [userId]);
    const userName = userResult.rows[0]?.full_name || 'User';

    const purchaseResult = await client.query(`
      SELECT pr.*, dc.name as destination_hub_name 
      FROM purchase_requests pr
      JOIN centers dc ON pr.destination_hub_id = dc.id
      WHERE pr.id = $1
    `, [id]);
    const purchase = purchaseResult.rows[0];
    if (!purchase) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Purchase request not found' });
    }

    let newStatus;
    let notificationTitle;
    let notificationMessage;

    if (action === 'reject') {
      newStatus = 'REJECTED';
      notificationTitle = 'Purchase Request Rejected';
      notificationMessage = `Purchase Request ${purchase.request_id} has been rejected by Main Admin. Component: ${purchase.component_name}, Quantity: ${purchase.required_quantity}, Destination Hub: ${purchase.destination_hub_name}. Reason: ${reason || 'No reason provided'} — no procurement action required.`;
    } else {
      newStatus = 'APPROVED_BY_ADMIN';
      notificationTitle = 'Purchase Request Approved';
      notificationMessage = `Purchase Request ${purchase.request_id} has been approved by Main Admin. Component: ${purchase.component_name}, Quantity: ${purchase.required_quantity}, Destination Hub: ${purchase.destination_hub_name}, Estimated Cost: ₹${purchase.estimated_cost || 0} — please proceed with procurement.`;
    }

    await client.query(
      `UPDATE purchase_requests SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, id]
    );

    const systemAdmins = await getRecipients(['system_admin']);
    const mainAdmins = await getRecipients(['main_admin']);
    const destManagers = await getRecipients(['center_admin', 'inventory_manager'], purchase.destination_hub_id);

    const allRecipientIds = [
      ...systemAdmins.map(a => a.id),
      ...mainAdmins.map(a => a.id),
      ...destManagers.map(a => a.id)
    ].filter(Boolean);

    await sendInAppNotification(
      allRecipientIds,
      notificationTitle,
      notificationMessage,
      'purchase_approval',
      { purchaseId: id, requestId: purchase.request_id },
      purchase.request_id,
      'purchase'
    );

    await client.query('COMMIT');
    return res.json({ success: true, status: newStatus });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Approve purchase error:', error);
    return res.status(500).json({ error: 'Failed to update purchase request' });
  } finally {
    client.release();
  }
});

// Mark as Ordered
router.patch('/purchase-requests/:id/order', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    await client.query('BEGIN');

    const purchaseResult = await client.query(
      `UPDATE purchase_requests 
       SET status = 'ORDERED', 
           updated_at = NOW()
       WHERE id = $1 
       RETURNING *`,
      [id]
    );
    const purchase = purchaseResult.rows[0];
    if (!purchase) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Purchase request not found' });
    }

    const systemAdmins = await getRecipients(['system_admin']);
    const mainAdmins = await getRecipients(['main_admin']);
    const destManagers = await getRecipients(['center_admin', 'inventory_manager'], purchase.destination_hub_id);

    const allRecipientIds = [
      ...systemAdmins.map(a => a.id),
      ...mainAdmins.map(a => a.id),
      ...destManagers.map(a => a.id)
    ].filter(Boolean);

    await sendInAppNotification(
      allRecipientIds,
      'Purchase Ordered',
      `Purchase Request ${purchase.request_id} has been ordered.`,
      'purchase_ordered',
      { purchaseId: id, requestId: purchase.request_id },
      purchase.request_id,
      'purchase'
    );

    await client.query('COMMIT');
    return res.json({ success: true, purchase });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Order purchase error:', error);
    return res.status(500).json({ error: 'Failed to mark purchase as ordered' });
  } finally {
    client.release();
  }
});

// Mark as Delivered
router.patch('/purchase-requests/:id/deliver', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    await client.query('BEGIN');

    const purchaseResult = await client.query(
      `UPDATE purchase_requests 
       SET status = 'DELIVERED', 
           updated_at = NOW()
       WHERE id = $1 
       RETURNING *`,
      [id]
    );
    const purchase = purchaseResult.rows[0];
    if (!purchase) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Purchase request not found' });
    }

    const systemAdmins = await getRecipients(['system_admin']);
    const mainAdmins = await getRecipients(['main_admin']);
    const destManagers = await getRecipients(['center_admin', 'inventory_manager'], purchase.destination_hub_id);

    const allRecipientIds = [
      ...systemAdmins.map(a => a.id),
      ...mainAdmins.map(a => a.id),
      ...destManagers.map(a => a.id)
    ].filter(Boolean);

    await sendInAppNotification(
      allRecipientIds,
      'Purchase Delivered',
      `Purchase Request ${purchase.request_id} has been delivered.`,
      'purchase_delivered',
      { purchaseId: id, requestId: purchase.request_id },
      purchase.request_id,
      'purchase'
    );

    await client.query('COMMIT');
    return res.json({ success: true, purchase });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Deliver purchase error:', error);
    return res.status(500).json({ error: 'Failed to mark purchase as delivered' });
  } finally {
    client.release();
  }
});

// Mark as Received (and update inventory)
router.post('/purchase-requests/:id/receive', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    await client.query('BEGIN');

    const userResult = await client.query('SELECT full_name, center_id FROM profiles WHERE id = $1', [userId]);
    const userProfile = userResult.rows[0];
    const userName = userProfile?.full_name || 'User';

    const purchaseResult = await client.query('SELECT * FROM purchase_requests WHERE id = $1', [id]);
    const purchase = purchaseResult.rows[0];
    if (!purchase) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Purchase request not found' });
    }

    // Find or create component at destination hub
    let compResult = await client.query(
      `SELECT * FROM components WHERE center_id = $1 AND name = $2 LIMIT 1`,
      [purchase.destination_hub_id, purchase.component_name]
    );
    let component = compResult.rows[0];

    if (!component) {
      // Create new component
      const newCompResult = await client.query(
        `INSERT INTO components (id, name, category, total_quantity, available_quantity, center_id, unit_cost, status, min_stock_threshold, max_usage_limit, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         RETURNING *`,
        [
          crypto.randomUUID(), purchase.component_name, 'General',
          purchase.required_quantity, purchase.required_quantity,
          purchase.destination_hub_id, purchase.estimated_cost || 0, 'active',
          10, 2
        ]
      );
      component = newCompResult.rows[0];
      console.log(`📦 Created new component in destination hub: ${purchase.component_name} → ${purchase.required_quantity} units`);
    } else {
      // Update existing component
      const newTotal = component.total_quantity + purchase.required_quantity;
      const newAvailable = component.available_quantity + purchase.required_quantity;
      const newStatus = newTotal <= 0 ? 'out_of_stock' : (newTotal <= (component.min_stock_threshold || 10) ? 'low_stock' : 'active');

      await client.query(
        `UPDATE components 
         SET total_quantity = $1, available_quantity = $2, status = $3, updated_at = NOW() 
         WHERE id = $4`,
        [newTotal, newAvailable, newStatus, component.id]
      );
      console.log(`📈 Destination Hub inventory updated: ${purchase.component_name} → ${newTotal} units`);
    }

    // Create purchase inventory transaction
    await client.query(
      `INSERT INTO inventory_transactions (component_id, center_id, transaction_type, quantity, performed_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [component.id, purchase.destination_hub_id, 'purchase', purchase.required_quantity, userId, `Purchase received: ${purchase.request_id}`]
    );

    // Mark purchase as completed
    await client.query(
      `UPDATE purchase_requests 
       SET status = 'COMPLETED', updated_at = NOW() 
       WHERE id = $1`,
      [id]
    );

    // Send notifications
    const systemAdmins = await getRecipients(['system_admin']);
    const mainAdmins = await getRecipients(['main_admin']);
    const destManagers = await getRecipients(['center_admin', 'inventory_manager'], purchase.destination_hub_id);

    const allRecipientIds = [
      ...systemAdmins.map(a => a.id),
      ...mainAdmins.map(a => a.id),
      ...destManagers.map(a => a.id)
    ].filter(Boolean);

    await sendInAppNotification(
      allRecipientIds,
      'Purchase Completed',
      `Purchase Request ${purchase.request_id} has been received and inventory updated successfully.`,
      'purchase_delivered',
      { purchaseId: id, requestId: purchase.request_id },
      purchase.request_id,
      'purchase'
    );

    await client.query('COMMIT');
    console.log('✅ Purchase received and inventory updated!');
    return res.json({ success: true, purchase });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Receive purchase error:', error);
    return res.status(500).json({ error: 'Failed to receive purchase', details: error.message });
  } finally {
    client.release();
  }
});

// Dashboard purchase stats
router.get('/purchase-stats', async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.id;
    const profileResult = await client.query('SELECT center_id, role FROM profiles WHERE id = $1', [userId]);
    const profile = profileResult.rows[0];

    let pendingCount = 0;
    let approvedCount = 0;
    let orderedCount = 0;
    let deliveredCount = 0;
    let completedCount = 0;
    let rejectedCount = 0;

    let queryStr = `SELECT status, COUNT(*) FROM purchase_requests`;
    const params = [];

    if (profile) {
      const normalizedRole = profile.role?.toLowerCase() || '';
      if (!normalizedRole.includes('system_admin') && !normalizedRole.includes('main_admin')) {
        queryStr += ` WHERE destination_hub_id = $1`;
        params.push(profile.center_id);
      }
    }

    queryStr += ` GROUP BY status`;

    const result = await client.query(queryStr, params);

    const statusMap = {};
    result.rows.forEach(row => {
      statusMap[row.status] = parseInt(row.count);
    });

    pendingCount = statusMap['PENDING_ADMIN_APPROVAL'] || 0;
    approvedCount = statusMap['APPROVED_BY_ADMIN'] || 0;
    orderedCount = statusMap['ORDERED'] || 0;
    deliveredCount = statusMap['DELIVERED'] || 0;
    completedCount = statusMap['COMPLETED'] || 0;
    rejectedCount = statusMap['REJECTED'] || 0;

    return res.json({ pendingCount, approvedCount, orderedCount, deliveredCount, completedCount, rejectedCount });
  } catch (error) {
    console.error('Get purchase stats error:', error);
    return res.status(500).json({ error: 'Failed to get purchase stats' });
  } finally {
    client.release();
  }
});

export default router;
