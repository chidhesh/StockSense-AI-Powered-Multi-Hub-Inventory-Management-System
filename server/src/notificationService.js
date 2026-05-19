import twilio from 'twilio';
import nodemailer from 'nodemailer';

// Lazy-initialize transporter only when needed
let emailTransporter = null;

function getEmailTransporter() {
  if (emailTransporter) return emailTransporter;

  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const smtpHost = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT, 10) || 587;
  const smtpFrom = process.env.SMTP_FROM?.trim() || smtpUser;

  console.log('[Notification] SMTP_HOST:', smtpHost);
  console.log('[Notification] SMTP_PORT:', smtpPort);
  console.log('[Notification] SMTP_USER:', smtpUser);
  console.log('[Notification] SMTP_PASS:', smtpPass ? '***set***' : 'NOT SET');
  console.log('[Notification] SMTP_FROM:', smtpFrom);

  if (!smtpUser || !smtpPass) {
    console.log('[Notification] Email NOT configured - missing SMTP_USER or SMTP_PASS');
    return null;
  }

  const transportConfig = {
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  };

  if (smtpHost.includes('gmail.com')) {
    transportConfig.service = 'gmail';
  } else {
    transportConfig.host = smtpHost;
    transportConfig.port = smtpPort;
    transportConfig.secure = smtpPort === 465;
    transportConfig.requireTLS = smtpPort !== 465;
    transportConfig.tls = {
      rejectUnauthorized: false,
    };
  }

  emailTransporter = nodemailer.createTransport(transportConfig);

  emailTransporter.verify()
    .then(() => console.log('[Notification] Email transporter verified successfully!'))
    .catch((err) => {
      console.error('[Notification] Email transporter verification FAILED:', err.message);
      console.error('[Notification] Check your SMTP_USER and SMTP_PASS (App Password)');
    });

  console.log('[Notification] Email transporter configured successfully!');
  return emailTransporter;
}

// Initialize Twilio client
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

/**
 * Send SMS notification via Twilio
 * @param {string} to - Recipient phone number
 * @param {string} message - Message content
 */
export async function sendSMS(to, message) {
  if (!twilioClient) {
    console.warn('[Notification] Twilio not configured, skipping SMS');
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    console.log(`[Notification] SMS sent: ${result.sid}`);
    return { success: true, sid: result.sid };
  } catch (error) {
    console.error('[Notification] SMS error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send email notification
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - Email HTML content
 */
export async function sendEmail(to, subject, html) {
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn('[Notification] Email not configured, skipping email');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    });
    console.log(`[Notification] Email sent: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('[Notification] Email error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send stock alert notification
 * @param {Object} options - Notification options
 * @param {string} options.email - Recipient email
 * @param {string} options.phone - Recipient phone
 * @param {string} options.componentName - Component name
 * @param {string} options.alertType - 'low_stock' or 'high_stock'
 * @param {number} options.currentQty - Current quantity
 * @param {number} options.threshold - Threshold value
 * @param {string} options.centerName - Center name
 */
export async function sendStockAlert({ email, phone, componentName, alertType, currentQty, threshold, centerName }) {
  const results = [];
  const isLowStock = alertType === 'low_stock';
  const alertTitle = isLowStock ? '⚠️ LOW STOCK ALERT' : '📈 HIGH STOCK NOTIFICATION';
  const urgency = isLowStock ? 'URGENT' : 'Notice';

  // Email content
  const emailSubject = `${alertTitle} - ${componentName}`;
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${isLowStock ? '#dc2626' : '#16a34a'}; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">${alertTitle}</h1>
        <p style="margin: 5px 0 0;">${urgency}</p>
      </div>
      <div style="padding: 20px; background: #f9fafb;">
        <p>Dear Admin,</p>
        <p>This is an automated notification regarding inventory status:</p>
        
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Component:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${componentName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Center:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${centerName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Alert Type:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: ${isLowStock ? '#dc2626' : '#16a34a'}; font-weight: bold;">
                ${isLowStock ? 'LOW STOCK' : 'HIGH STOCK'}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Current Quantity:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 18px; font-weight: bold; color: ${isLowStock ? '#dc2626' : '#16a34a'};">
                ${currentQty}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px;"><strong>Threshold:</strong></td>
              <td style="padding: 8px;">${threshold}</td>
            </tr>
          </table>
        </div>
        
        ${isLowStock ? `
        <p style="color: #dc2626;"><strong>Action Required:</strong> Please review procurement queue and place an order to replenish stock.</p>
        ` : `
        <p style="color: #16a34a;"><strong>Note:</strong> Stock levels are higher than expected. Consider reviewing inventory levels or redistribution.</p>
        `}
        
        <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
          This is an automated message from Smart Inventory Forecasting System.
        </p>
      </div>
    </div>
  `;

  // SMS content
  const smsMessage = `${alertTitle}\n${componentName} at ${centerName}\nCurrent: ${currentQty} | Threshold: ${threshold}\n${isLowStock ? 'Action: Reorder needed!' : 'Info: Review stock levels'}`;

  // Send email if provided
  if (email) {
    const emailResult = await sendEmail(email, emailSubject, emailHtml);
    results.push({ type: 'email', ...emailResult });
  }

  // Send SMS if provided
  if (phone) {
    const smsResult = await sendSMS(phone, smsMessage);
    results.push({ type: 'sms', ...smsResult });
  }

  return results;
}

/**
 * Send bulk stock alert for multiple components
 * @param {Object} options - Notification options
 */
export async function sendBulkStockAlert({ email, phone, components, centerName, senderName }) {
  const lowStockItems = components.filter(c => c.alertType === 'low_stock');
  const highStockItems = components.filter(c => c.alertType === 'high_stock');

  const emailSubject = `📊 Stock Alert Summary - ${centerName}`;
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #4f46e5; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">📊 Inventory Alert Summary</h1>
        <p style="margin: 5px 0 0;">${centerName}</p>
      </div>
      <div style="padding: 20px; background: #f9fafb;">
        <p>Hello,</p>
        <p>This is a formal stock alert notification from <strong>${senderName || 'Inventory Manager'}</strong> regarding the current inventory status at <strong>${centerName}</strong>.</p>
        
        <p>The following items require your attention:</p>
        
        ${lowStockItems.length > 0 ? `
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #dc2626;">
          <h3 style="color: #dc2626; margin: 0 0 10px;">⚠️ Low Stock Items (${lowStockItems.length})</h3>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 10px;">These items are below the safety threshold and need to be restocked.</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: #fef2f2;">
              <th style="padding: 8px; text-align: left;">Component</th>
              <th style="padding: 8px; text-align: right;">Current</th>
              <th style="padding: 8px; text-align: right;">Threshold</th>
            </tr>
            ${lowStockItems.map(c => `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${c.componentName}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #dc2626; font-weight: bold;">${c.currentQty}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${c.threshold}</td>
            </tr>
            `).join('')}
          </table>
        </div>
        ` : ''}
        
        ${highStockItems.length > 0 ? `
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #16a34a;">
          <h3 style="color: #16a34a; margin: 0 0 10px;">📈 Excess Stock Items (${highStockItems.length})</h3>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 10px;">These items have high availability. Please review if redistribution is needed.</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: #f0fdf4;">
              <th style="padding: 8px; text-align: left;">Component</th>
              <th style="padding: 8px; text-align: right;">Current</th>
              <th style="padding: 8px; text-align: right;">Threshold</th>
            </tr>
            ${highStockItems.map(c => `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${c.componentName}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #16a34a; font-weight: bold;">${c.currentQty}</td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${c.threshold}</td>
            </tr>
            `).join('')}
          </table>
        </div>
        ` : ''}
        
        <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #4b5563;">
          <p><strong>From:</strong> ${senderName || 'Hub Manager'}</p>
          <p><strong>Hub:</strong> ${centerName}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}</p>
        </div>

        <p style="color: #6b7280; font-size: 11px; margin-top: 30px; text-align: center;">
          This is an official communication from the Smart Inventory Forecasting System.
        </p>
      </div>
    </div>
  `;

  const smsMessage = `📊 Stock Alert (${centerName}): ${lowStockItems.length} low stock, ${highStockItems.length} excess stock items reported by ${senderName || 'Manager'}.`;

  const results = [];
  
  if (email) {
    const emailResult = await sendEmail(email, emailSubject, emailHtml);
    results.push({ type: 'email', ...emailResult });
  }

  if (phone) {
    const smsResult = await sendSMS(phone, smsMessage);
    results.push({ type: 'sms', ...smsResult });
  }

  return results;
}

function renderAlertTable(rows, columns) {
  if (!rows.length) return '<p style="color:#6b7280;">None</p>';
  const header = columns.map((col) => `<th style="padding:8px;text-align:left;">${col.label}</th>`).join('');
  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map(
            (col) =>
              `<td style="padding:8px;border-bottom:1px solid #e5e7eb;">${col.render(row)}</td>`
          )
          .join('')}</tr>`
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;"><tr style="background:#f3f4f6;">${header}</tr>${body}</table>`;
}

/**
 * Send combined inventory alert bundle (low stock, shortages, purchase recommendations).
 */
export async function sendInventoryAlertBundle({
  email,
  phone,
  low_stock_alerts = [],
  shortage_alerts = [],
  purchase_recommendations = [],
  purchase_reason = '',
}) {
  const results = [];
  const hasAlerts =
    low_stock_alerts.length > 0 ||
    shortage_alerts.length > 0 ||
    purchase_recommendations.length > 0;

  if (!hasAlerts) {
    return results;
  }

  const emailSubject = '📦 Smart Inventory Alert Bundle';
  const emailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
      <div style="background:#4f46e5;color:white;padding:20px;text-align:center;">
        <h1 style="margin:0;">Inventory Alert Bundle</h1>
        <p style="margin:5px 0 0;">Automated stock & procurement summary</p>
      </div>
      <div style="padding:20px;background:#f9fafb;">
        ${purchase_reason ? `<p><strong>Summary:</strong> ${purchase_reason}</p>` : ''}

        <div style="background:white;padding:15px;border-radius:8px;margin:15px 0;border-left:4px solid #dc2626;">
          <h3 style="color:#dc2626;margin:0 0 10px;">Low stock (${low_stock_alerts.length})</h3>
          ${renderAlertTable(low_stock_alerts, [
            { label: 'Component', render: (r) => r.componentName },
            { label: 'Current', render: (r) => r.currentStock },
            { label: 'Minimum', render: (r) => r.minimumRequired },
            { label: 'Weekly demand', render: (r) => r.predictedWeeklyDemand },
          ])}
        </div>

        <div style="background:white;padding:15px;border-radius:8px;margin:15px 0;border-left:4px solid #b91c1c;">
          <h3 style="color:#b91c1c;margin:0 0 10px;">Shortages (${shortage_alerts.length})</h3>
          ${renderAlertTable(shortage_alerts, [
            { label: 'Component', render: (r) => r.componentName },
            { label: 'Stock', render: (r) => r.currentStock },
            { label: 'Urgency', render: (r) => r.urgency || 'high' },
            { label: 'Vendor', render: (r) => r.suggestedVendor || '—' },
          ])}
        </div>

        <div style="background:white;padding:15px;border-radius:8px;margin:15px 0;border-left:4px solid #2563eb;">
          <h3 style="color:#2563eb;margin:0 0 10px;">Purchase recommendations (${purchase_recommendations.length})</h3>
          ${renderAlertTable(purchase_recommendations, [
            { label: 'Component', render: (r) => r.componentName },
            { label: 'Order qty', render: (r) => r.quantityToOrder },
            { label: 'Est. cost', render: (r) => `₹${r.estimatedCost ?? 0}` },
            { label: 'Vendor', render: (r) => r.suggestedVendor || '—' },
          ])}
        </div>

        <p style="color:#6b7280;font-size:12px;margin-top:20px;">
          Smart Inventory Forecasting System — ${new Date().toLocaleString('en-IN')}
        </p>
      </div>
    </div>
  `;

  const smsMessage = `Inventory alerts: ${low_stock_alerts.length} low stock, ${shortage_alerts.length} shortages, ${purchase_recommendations.length} purchase items.`;

  if (email) {
    const emailResult = await sendEmail(email, emailSubject, emailHtml);
    results.push({ type: 'email', ...emailResult });
  }
  if (phone) {
    const smsResult = await sendSMS(phone, smsMessage);
    results.push({ type: 'sms', ...smsResult });
  }

  return results;
}

/**
 * Send shortage-specific alert email/SMS.
 */
export async function sendShortageAlertEmail({
  email,
  phone,
  componentName,
  currentStock = 0,
  suggestedVendor,
  courseName,
  centerName,
}) {
  const results = [];
  const subject = `🚨 Shortage Alert — ${componentName}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#b91c1c;color:white;padding:20px;text-align:center;">
        <h1 style="margin:0;">Critical Shortage</h1>
      </div>
      <div style="padding:20px;background:#f9fafb;">
        <p><strong>Component:</strong> ${componentName}</p>
        <p><strong>Center:</strong> ${centerName || 'N/A'}</p>
        <p><strong>Current stock:</strong> ${currentStock}</p>
        ${courseName ? `<p><strong>Course:</strong> ${courseName}</p>` : ''}
        ${suggestedVendor ? `<p><strong>Suggested vendor:</strong> ${suggestedVendor}</p>` : ''}
        <p style="color:#b91c1c;"><strong>Action:</strong> Place an emergency purchase order immediately.</p>
      </div>
    </div>
  `;

  const sms = `SHORTAGE: ${componentName} at ${centerName || 'hub'} — stock ${currentStock}. Reorder now.`;

  if (email) results.push({ type: 'email', ...(await sendEmail(email, subject, html)) });
  if (phone) results.push({ type: 'sms', ...(await sendSMS(phone, sms)) });
  return results;
}

/**
 * Send purchase recommendation email/SMS.
 */
export async function sendPurchaseRecommendationEmail({
  email,
  phone,
  componentName,
  quantityToOrder,
  estimatedCost,
  suggestedVendor,
  reason,
  centerName,
}) {
  const results = [];
  const subject = `🛒 Purchase Recommendation — ${componentName}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#2563eb;color:white;padding:20px;text-align:center;">
        <h1 style="margin:0;">Purchase Recommendation</h1>
      </div>
      <div style="padding:20px;background:#f9fafb;">
        <p><strong>Component:</strong> ${componentName}</p>
        <p><strong>Center:</strong> ${centerName || 'N/A'}</p>
        <p><strong>Recommended quantity:</strong> ${quantityToOrder}</p>
        <p><strong>Estimated cost:</strong> ₹${estimatedCost ?? 0}</p>
        <p><strong>Vendor:</strong> ${suggestedVendor || 'TBD'}</p>
        <p><strong>Reason:</strong> ${reason || 'Forecast-based restock'}</p>
      </div>
    </div>
  `;

  const sms = `Purchase: order ${quantityToOrder} x ${componentName} (~₹${estimatedCost ?? 0}) from ${suggestedVendor || 'vendor'}.`;

  if (email) results.push({ type: 'email', ...(await sendEmail(email, subject, html)) });
  if (phone) results.push({ type: 'sms', ...(await sendSMS(phone, sms)) });
  return results;
}