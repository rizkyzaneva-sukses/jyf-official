'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/toaster'
import { X, MessageCircle, Download, Send, FileText, Loader2 } from 'lucide-react'
import { generatePOPDF, downloadPOPDF, getPOPDFBase64 } from '@/lib/po-pdf'
import { formatDate } from '@/lib/utils'

const DEFAULT_TEMPLATE = `Bismillahirrohmaanirrohiim

Berikut PO {po_number} kita buat.
Mohon dicek data PO-nya dan konfirmasi jika sudah dibaca.

Terima kasih 🙏`

interface SendWhatsAppModalProps {
  po: any
  onClose: () => void
}

export function SendWhatsAppModal({ po, onClose }: SendWhatsAppModalProps) {
  const { toast } = useToast()
  const [message, setMessage] = useState(
    DEFAULT_TEMPLATE.replace('{po_number}', po.poNumber)
  )
  const [sending, setSending] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const vendorPhone = po.vendor?.kontak || ''
  const cleanedPhone = vendorPhone.replace(/[^0-9+]/g, '')
  const phoneWithCountryCode = cleanedPhone.startsWith('62')
    ? cleanedPhone
    : cleanedPhone.startsWith('0')
      ? '62' + cleanedPhone.slice(1)
      : cleanedPhone

  const handleDownload = () => {
    setDownloading(true)
    try {
      downloadPOPDF({
        poNumber: po.poNumber,
        poDate: po.poDate,
        expectedDate: po.expectedDate,
        vendorName: po.vendorName,
        items: po.items || [],
        note: po.note,
      })
      toast({ title: `PO-${po.poNumber}.pdf berhasil didownload`, type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal download PDF', type: 'error' })
    } finally {
      setDownloading(false)
    }
  }

  const handleSendWA = async () => {
    if (!vendorPhone) {
      toast({ title: 'Nomor WhatsApp vendor tidak ada', type: 'error' })
      return
    }

    setSending(true)
    try {
      // Generate PDF as base64
      const base64 = getPOPDFBase64({
        poNumber: po.poNumber,
        poDate: po.poDate,
        expectedDate: po.expectedDate,
        vendorName: po.vendorName,
        items: po.items || [],
        note: po.note,
      })

      // Send via WAHA
      const res = await fetch('/api/whatsapp/send-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: phoneWithCountryCode,
          caption: message,
          fileBase64: base64,
          fileName: `PO-${po.poNumber}.pdf`,
          mimeType: 'application/pdf',
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      toast({ title: `PO-${po.poNumber} berhasil dikirim ke ${po.vendorName}`, type: 'success' })
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal kirim WhatsApp', type: 'error' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <MessageCircle size={18} className="text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Kirim PO ke Vendor</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* PO Info */}
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <FileText size={20} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-white font-mono">{po.poNumber}</p>
                <p className="text-xs text-zinc-400">{po.vendorName} · {po.items?.length || 0} item</p>
              </div>
            </div>
          </div>

          {/* Vendor Phone */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Nomor WhatsApp Vendor</label>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
              vendorPhone ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-red-900/20 border-red-800 text-red-400'
            }`}>
              {vendorPhone ? (
                <>
                  <span className="text-emerald-400 font-mono">{phoneWithCountryCode}</span>
                  <span className="text-zinc-600 text-xs">({po.vendorName})</span>
                </>
              ) : (
                <span className="text-xs">Nomor WhatsApp tidak ada di data vendor. Silakan edit vendor terlebih dahulu.</span>
              )}
            </div>
          </div>

          {/* Message Template */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Pesan <span className="text-zinc-600">(bisa diedit)</span></label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
            />
            <p className="text-[10px] text-zinc-600 mt-1">Tip: Gunakan {`{po_number}`} untuk auto-replace nomor PO</p>
          </div>

          {/* Preview */}
          <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-xl p-3">
            <p className="text-[10px] text-zinc-500 mb-1.5 font-medium">Preview Pesan:</p>
            <p className="text-xs text-zinc-300 whitespace-pre-line leading-relaxed">{message}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4 border-t border-zinc-800">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center justify-center gap-2 flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl py-2.5 text-sm transition-colors disabled:opacity-50"
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download PDF
          </button>
          <button
            onClick={handleSendWA}
            disabled={sending || !vendorPhone}
            className="flex items-center justify-center gap-2 flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? 'Mengirim...' : 'Kirim via WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  )
}
