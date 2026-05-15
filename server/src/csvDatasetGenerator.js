export function getInventoryData() {
  return [
    { component_id: 'P1', name: 'Arduino Uno', category: 'Microcontrollers', sku: 'ARD-001', unit_cost: 650, total_quantity: 150, available_quantity: 120 },
    { component_id: 'P2', name: 'Raspberry Pi 4', category: 'Microcontrollers', sku: 'RPI-004', unit_cost: 4500, total_quantity: 45, available_quantity: 30 },
    { component_id: 'P3', name: 'ESP32 DevKit', category: 'IoT Modules', sku: 'ESP-032', unit_cost: 450, total_quantity: 200, available_quantity: 180 },
    { component_id: 'P4', name: 'DHT22 Sensor', category: 'Sensors', sku: 'SEN-D22', unit_cost: 150, total_quantity: 300, available_quantity: 250 },
    { component_id: 'P5', name: 'Ultrasonic Sensor', category: 'Sensors', sku: 'SEN-US04', unit_cost: 80, total_quantity: 500, available_quantity: 420 },
    { component_id: 'P6', name: 'Servo Motor SG90', category: 'Actuators', sku: 'ACT-SG90', unit_cost: 120, total_quantity: 100, available_quantity: 85 },
    { component_id: 'P7', name: 'LCD 16x2 I2C', category: 'Displays', sku: 'DSP-1602', unit_cost: 250, total_quantity: 80, available_quantity: 60 },
    { component_id: 'P8', name: 'Jumper Wires (M-M)', category: 'Accessories', sku: 'ACC-JMM', unit_cost: 5, total_quantity: 5000, available_quantity: 4500 },
    { component_id: 'P9', name: 'Breadboard 830', category: 'Accessories', sku: 'ACC-BB830', unit_cost: 110, total_quantity: 150, available_quantity: 130 },
    { component_id: 'P10', name: 'LED Pack (R/G/B)', category: 'Components', sku: 'CMP-LED', unit_cost: 2, total_quantity: 10000, available_quantity: 9500 }
  ];
}

export function getTransactionData() {
  const transactions = [];
  const types = ['issue', 'return', 'purchase', 'damaged'];
  const now = new Date();
  
  // Generate 100 transactions over the last 14 days
  for (let i = 0; i < 100; i++) {
    const daysAgo = Math.floor(Math.random() * 14);
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    
    transactions.push({
      transaction_id: `TX-${1000 + i}`,
      component_id: `P${Math.floor(Math.random() * 10) + 1}`,
      transaction_type: types[Math.floor(Math.random() * types.length)],
      quantity: Math.floor(Math.random() * 5) + 1,
      transaction_date: date.toISOString(),
      notes: 'Initial dummy data'
    });
  }
  return transactions;
}

export function convertToCSV(data, headers) {
  if (!data || data.length === 0) return '';
  const rows = data.map(obj => headers.map(header => {
    const val = obj[header];
    return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
  }).join(','));
  return [headers.join(','), ...rows].join('\n');
}
