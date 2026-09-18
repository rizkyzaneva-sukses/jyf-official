import jsPDF from 'jspdf'
import 'jspdf-autotable'

interface POItem {
  sku: string
  productName: string
  qtyOrder: number
  unitPrice: number
}

interface POData {
  poNumber: string
  poDate: string
  expectedDate?: string | null
  vendorName: string
  items: POItem[]
  note?: string | null
}

export function generatePOPDF(po: POData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  let y = 20

  // Header
  doc.setFontSize(8)
  doc.setTextColor(128)
  doc.text('ELYASR Business Operation', margin, y)
  doc.text(new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }), pageWidth - margin, y, { align: 'right' })

  y += 12
  doc.setFontSize(18)
  doc.setTextColor(0)
  doc.setFont('helvetica', 'bold')
  doc.text('PURCHASE ORDER', pageWidth / 2, y, { align: 'center' })

  y += 12
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')

  // PO Info
  const leftX = margin
  const rightX = pageWidth / 2 + 10

  doc.setFont('helvetica', 'bold')
  doc.text('No. PO:', leftX, y)
  doc.setFont('helvetica', 'normal')
  doc.text(po.poNumber, leftX + 25, y)

  doc.setFont('helvetica', 'bold')
  doc.text('Kepada Vendor:', rightX, y)
  doc.setFont('helvetica', 'normal')
  doc.text(po.vendorName, rightX + 30, y)

  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text('Tanggal PO:', leftX, y)
  doc.setFont('helvetica', 'normal')
  doc.text(new Date(po.poDate).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }), leftX + 25, y)

  if (po.expectedDate) {
    doc.setFont('helvetica', 'bold')
    doc.text('Estimasi Tiba:', rightX, y)
    doc.setFont('helvetica', 'normal')
    doc.text(new Date(po.expectedDate).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }), rightX + 30, y)
  }

  y += 10

  // Items table
  const tableData = po.items.map((item, i) => [
    String(i + 1),
    item.sku,
    item.productName,
    String(item.qtyOrder),
  ])

  ;(doc as any).autoTable({
    startY: y,
    head: [['No', 'SKU', 'Nama Produk', 'Qty']],
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      1: { cellWidth: 30 },
      3: { halign: 'center', cellWidth: 18 },
    },
    margin: { left: margin, right: margin },
  })

  y = (doc as any).lastAutoTable?.finalY || y + 20

  // Notes
  if (po.note) {
    y += 8
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Catatan:', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    const noteLines = doc.splitTextToSize(po.note, pageWidth - margin * 2)
    doc.text(noteLines, margin, y)
  }

  // Signature blocks
  const sigY = Math.max(y + 20, 240)
  const sigWidth = (pageWidth - margin * 2) / 2

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Vendor', margin + sigWidth / 2, sigY, { align: 'center' })
  doc.text('Purchasing', margin + sigWidth + sigWidth / 2, sigY, { align: 'center' })

  const lineY = sigY + 18
  doc.setDrawColor(0)
  doc.line(margin + 5, lineY, margin + sigWidth - 5, lineY)
  doc.line(margin + sigWidth + 5, lineY, margin + sigWidth * 2 - 5, lineY)

  return doc
}

export function downloadPOPDF(po: POData) {
  const doc = generatePOPDF(po)
  doc.save(`PO-${po.poNumber}.pdf`)
}

export function getPOPDFBase64(po: POData): string {
  const doc = generatePOPDF(po)
  return doc.output('datauristring').split(',')[1]
}
