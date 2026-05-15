import crypto from 'node:crypto';

export const SIMPLE_PRODUCTS = [
  { id: 'PROD-001', name: 'Arduino Uno', category: 'Microcontrollers', unitCost: 650 },
  { id: 'PROD-002', name: 'ESP32 Development Board', category: 'IoT Modules', unitCost: 450 },
  { id: 'PROD-003', name: 'DHT22 Temperature Sensor', category: 'Sensors', unitCost: 150 },
  { id: 'PROD-004', name: 'HC-SR04 Ultrasonic Sensor', category: 'Sensors', unitCost: 80 },
  { id: 'PROD-005', name: 'Raspberry Pi Pico', category: 'Microcontrollers', unitCost: 350 }
];

export const SIMPLE_CENTERS = [
  { id: 'CENTER-A', name: 'Center-A', location: 'Building 1' },
  { id: 'CENTER-B', name: 'Center-B', location: 'Building 2' }
];

export function generateSimpleInventory() {
  const inventory = [];
  const startDate = new Date('2025-12-01');
  const endDate = new Date('2026-02-28');
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    for (const center of SIMPLE_CENTERS) {
      for (const product of SIMPLE_PRODUCTS) {
        inventory.push({
          InventoryId: crypto.randomUUID(),
          CenterId: center.id,
          CenterName: center.name,
          ProductId: product.id,
          ProductName: product.name,
          Category: product.category,
          Date: dateStr,
          StockLevel: Math.floor(Math.random() * 100) + 10,
          UnitCost: product.unitCost,
          TotalValue: product.unitCost * 50,
          ReorderLevel: 20,
          MaxCapacity: 150,
          Status: 'Active'
        });
      }
    }
  }
  return inventory;
}

export function generateSimpleTransactions() {
  const transactions = [];
  const startDate = new Date('2025-12-01');
  const endDate = new Date('2026-02-28');
  
  for (let i = 0; i < 1000; i++) {
    const randomDate = new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime()));
    const center = SIMPLE_CENTERS[Math.floor(Math.random() * SIMPLE_CENTERS.length)];
    const product = SIMPLE_PRODUCTS[Math.floor(Math.random() * SIMPLE_PRODUCTS.length)];
    const type = ['issue', 'return', 'purchase', 'damaged'][Math.floor(Math.random() * 4)];
    const quantity = Math.floor(Math.random() * 5) + 1;
    
    transactions.push({
      TransactionId: crypto.randomUUID(),
      CenterId: center.id,
      CenterName: center.name,
      ProductId: product.id,
      ProductName: product.name,
      Date: randomDate.toISOString().split('T')[0],
      Time: '10:00 AM',
      Type: type,
      Quantity: quantity,
      UnitCost: product.unitCost,
      TotalAmount: product.unitCost * quantity,
      ReferenceNo: `REF-${Math.floor(Math.random() * 1000000)}`,
      Notes: 'Automated test transaction'
    });
  }
  return transactions;
}

export function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map(obj => headers.map(header => {
    const val = obj[header];
    return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
  }).join(','));
  return [headers.join(','), ...rows].join('\n');
}
