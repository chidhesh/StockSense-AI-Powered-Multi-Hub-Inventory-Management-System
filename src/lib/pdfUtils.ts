import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { Report, Invoice, Student, InventoryTransaction, Quotation, ProcurementOrder } from '../types';

export function generateQuotationPDF(quotation: Quotation, centerName: string): void {
  const doc = new jsPDF();

  doc.setFontSize(22);
  doc.setTextColor(15, 98, 254);
  doc.text('QUOTATION', 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Quotation No: ${quotation.quotation_number}`, 14, 32);
  doc.text(`Date: ${format(new Date(quotation.created_at), 'dd MMM yyyy')}`, 14, 39);
  doc.text(`Valid Until: ${format(new Date(quotation.valid_until), 'dd MMM yyyy')}`, 14, 46);
  doc.text(`Status: ${quotation.status.toUpperCase()}`, 14, 53);

  doc.setFontSize(11);
  doc.text('Vendor Details', 130, 32);
  doc.setFontSize(10);
  doc.text(quotation.vendor_name, 130, 39);
  if (quotation.vendor_contact) doc.text(quotation.vendor_contact, 130, 46);

  doc.setFontSize(11);
  doc.text('Quoted To (Hub)', 14, 65);
  doc.setFontSize(10);
  doc.text(centerName, 14, 72);

  autoTable(doc, {
    startY: 85,
    head: [['Component', 'Category', 'Qty', 'Unit Price (₹)', 'Total (₹)']],
    body: quotation.items.map(item => [
      item.component_name,
      item.category,
      String(item.quantity),
      item.unit_price.toFixed(2),
      item.total.toFixed(2),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [15, 98, 254] },
  });

  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  if (quotation.notes) {
    doc.setFontSize(10);
    doc.text('Notes:', 14, finalY);
    doc.setFontSize(9);
    doc.text(quotation.notes, 14, finalY + 7, { maxWidth: 100 });
  }

  autoTable(doc, {
    startY: finalY,
    body: [
      ['Subtotal', `₹${quotation.subtotal.toFixed(2)}`],
      [`GST (${quotation.tax_rate}%)`, `₹${quotation.tax_amount.toFixed(2)}`],
      ['Total Amount', `₹${quotation.total_amount.toFixed(2)}`],
    ],
    theme: 'plain',
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
    margin: { left: 120 },
    styles: { fontSize: 11 },
  });

  doc.save(`Quotation_${quotation.quotation_number}_${format(new Date(), 'yyyyMMdd')}.pdf`);
}

export function generatePurchaseOrderPDF(order: ProcurementOrder, centerName: string): void {
  const doc = new jsPDF();

  doc.setFontSize(22);
  doc.setTextColor(34, 197, 94); // Green for PO
  doc.text('PURCHASE ORDER', 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`PO Number: ${order.order_number}`, 14, 32);
  doc.text(`Date: ${format(new Date(order.order_date), 'dd MMM yyyy')}`, 14, 39);
  if (order.expected_delivery) doc.text(`Exp. Delivery: ${format(new Date(order.expected_delivery), 'dd MMM yyyy')}`, 14, 46);
  doc.text(`Status: ${order.status.toUpperCase()}`, 14, 53);

  doc.setFontSize(11);
  doc.text('Vendor', 130, 32);
  doc.setFontSize(10);
  doc.text(order.vendor_name, 130, 39);
  if (order.vendor_contact) doc.text(order.vendor_contact, 130, 46);

  doc.setFontSize(11);
  doc.text('Ship To (Hub)', 14, 65);
  doc.setFontSize(10);
  doc.text(centerName, 14, 72);

  autoTable(doc, {
    startY: 85,
    head: [['Component', 'Category', 'Qty', 'Unit Price (₹)', 'Total (₹)']],
    body: order.items.map(item => [
      item.component_name,
      item.category,
      String(item.quantity),
      item.unit_price.toFixed(2),
      item.total.toFixed(2),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [34, 197, 94] },
  });

  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  autoTable(doc, {
    startY: finalY,
    body: [
      ['Subtotal', `₹${order.subtotal.toFixed(2)}`],
      [`GST (${order.tax_rate}%)`, `₹${order.tax_amount.toFixed(2)}`],
      ['Total Amount', `₹${order.total_amount.toFixed(2)}`],
    ],
    theme: 'plain',
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
    margin: { left: 120 },
    styles: { fontSize: 11 },
  });

  doc.save(`PO_${order.order_number}_${format(new Date(), 'yyyyMMdd')}.pdf`);
}

export function generateReportPDF(report: Report, centerName: string): void {
  const doc = new jsPDF();
  const data = report.data;

  // Modern Header with Blue Theme
  doc.setFillColor(15, 98, 254);
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('SMART INVENTORY', 14, 25);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('ANALYTICAL OPERATIONS HUB', 14, 32);

  // Report Title Box
  doc.setFillColor(248, 250, 252);
  doc.rect(14, 45, 182, 25, 'F');
  
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(report.title.toUpperCase(), 20, 55);
  
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text(`HUB: ${centerName.toUpperCase()}  |  PERIOD: ${format(new Date(report.period_start), 'dd MMM yyyy')} - ${format(new Date(report.period_end), 'dd MMM yyyy')}`, 20, 62);

  // Key Metrics Grid
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('EXECUTIVE SUMMARY', 14, 85);

  autoTable(doc, {
    startY: 90,
    head: [['TOTAL ISSUED', 'TOTAL RETURNED', 'TOTAL LOSS/DAMAGE', 'WASTAGE RATE']],
    body: [[
      String(data.total_issued),
      String(data.total_returned),
      String(data.total_damaged),
      `${data.wastage_percentage.toFixed(1)}%`
    ]],
    theme: 'grid',
    styles: { halign: 'center', fontSize: 10, cellPadding: 5 },
    headStyles: { fillColor: [15, 98, 254], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      3: { textColor: data.wastage_percentage > 10 ? [220, 38, 38] : [15, 23, 42], fontStyle: 'bold' }
    }
  });

  const afterSummary = (doc as any).lastAutoTable.finalY + 15;

  // Asset Breakdown
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('ASSET UTILIZATION BREAKDOWN', 14, afterSummary);

  autoTable(doc, {
    startY: afterSummary + 5,
    head: [['ASSET NAME', 'ISSUED', 'RETURNED', 'DAMAGED', 'NET FLOW']],
    body: data.components.map(c => [
      c.name.toUpperCase(),
      String(c.issued),
      String(c.returned),
      String(c.damaged),
      String(c.issued - c.returned)
    ]),
    theme: 'striped',
    headStyles: { fillColor: [51, 65, 85], textColor: 255 },
    styles: { fontSize: 9 }
  });

  if (data.students && data.students.length > 0) {
    const afterComp = (doc as any).lastAutoTable.finalY + 15;
    
    // Check for page break
    if (afterComp > 250) doc.addPage();
    const studentY = afterComp > 250 ? 20 : afterComp;

    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('TOP ACTIVE BENEFICIARIES', 14, studentY);

    autoTable(doc, {
      startY: studentY + 5,
      head: [['STUDENT IDENTITY', 'ID / USN', 'ISSUED', 'RETURNED', 'LOSS']],
      body: data.students.map((s: any) => [
        s.name.toUpperCase(),
        s.roll.toUpperCase(),
        String(s.issued),
        String(s.returned),
        String(s.damaged)
      ]),
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], textColor: 255 },
      styles: { fontSize: 9 }
    });
  }

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated by Smart Inventory Analytical Engine on ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 285);
    doc.text(`Page ${i} of ${pageCount}`, 180, 285);
  }

  doc.save(`${report.title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
}

export function generateInvoicePDF(invoice: Invoice, centerName: string): void {
  const doc = new jsPDF();

  doc.setFontSize(22);
  doc.setTextColor(15, 98, 254);
  doc.text('TAX INVOICE', 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Invoice No: ${invoice.invoice_number}`, 14, 32);
  doc.text(`Date: ${format(new Date(invoice.invoice_date), 'dd MMM yyyy')}`, 14, 39);
  doc.text(`Status: ${invoice.status.toUpperCase()}`, 14, 46);

  doc.setFontSize(11);
  doc.text('Vendor Details', 130, 32);
  doc.setFontSize(10);
  doc.text(invoice.vendor_name, 130, 39);
  if (invoice.vendor_contact) doc.text(invoice.vendor_contact, 130, 46);

  doc.setFontSize(11);
  doc.text('Bill To (Hub)', 14, 60);
  doc.setFontSize(10);
  doc.text(centerName, 14, 67);

  autoTable(doc, {
    startY: 80,
    head: [['Component', 'Category', 'Qty', 'Unit Price (₹)', 'Total (₹)']],
    body: invoice.items.map(item => [
      item.component_name,
      item.category,
      String(item.quantity),
      item.unit_price.toFixed(2),
      item.total.toFixed(2),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [15, 98, 254] },
  });

  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  autoTable(doc, {
    startY: finalY,
    body: [
      ['Subtotal', `₹${invoice.subtotal.toFixed(2)}`],
      [`GST (${invoice.tax_rate}%)`, `₹${invoice.tax_amount.toFixed(2)}`],
      ['Total Amount', `₹${invoice.total_amount.toFixed(2)}`],
    ],
    theme: 'plain',
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
    margin: { left: 120 },
    styles: { fontSize: 11 },
  });

  doc.save(`Invoice_${invoice.invoice_number}_${format(new Date(), 'yyyyMMdd')}.pdf`);
}

export function generateStudentReportPDF(student: Student, history: InventoryTransaction[]): void {
  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.setTextColor(15, 98, 254);
  doc.text('Student Inventory Report', 14, 20);

  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(`Name: ${student.full_name}`, 14, 32);
  doc.text(`Roll Number: ${student.roll_number}`, 14, 39);
  doc.text(`Hub: ${student.center?.name || 'N/A'}`, 14, 46);
  doc.text(`Generated On: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, 14, 53);

  doc.setFontSize(14);
  doc.text('Borrowing Summary', 14, 65);

  const summaryData = history.reduce((acc: any, tx) => {
    acc[tx.transaction_type] = (acc[tx.transaction_type] || 0) + tx.quantity;
    return acc;
  }, {});

  autoTable(doc, {
    startY: 70,
    head: [['Status', 'Total Quantity']],
    body: Object.entries(summaryData).map(([status, qty]) => [status.toUpperCase(), String(qty)]),
    theme: 'grid',
    headStyles: { fillColor: [15, 98, 254] },
  });

  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  doc.setFontSize(14);
  doc.text('Detailed Transaction Logs', 14, finalY);

  autoTable(doc, {
    startY: finalY + 5,
    head: [['Date', 'Component', 'SKU', 'Type', 'Qty']],
    body: history.map(tx => [
      format(new Date(tx.created_at), 'dd MMM yyyy'),
      (tx as any).component_name || 'Unknown',
      (tx as any).component_sku || 'N/A',
      tx.transaction_type.toUpperCase(),
      String(tx.quantity),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [15, 98, 254] },
  });

  doc.save(`Student_Report_${student.roll_number}_${format(new Date(), 'yyyyMMdd')}.pdf`);
}
