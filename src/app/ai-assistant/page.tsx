'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Loader2, Trash2, Sparkles, HelpCircle } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'Cara import pesanan dari Shopee?',
  'Apa itu SOH dan cara hitungnya?',
  'Bagaimana cara membuat PO ke vendor?',
  'Cara catat spending iklan TikTok?',
  'Apa bedanya Tanggal Order vs Tanggal Cair?',
  'Cara scan retur dari customer?',
  'Bagaimana cara upload payout Shopee?',
  'Apa itu Produk Gabungan dan kapan dipakai?',
]

function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <br key={i} />

    if (line.startsWith('### ')) {
      return <h4 key={i} className="text-sm font-bold text-white mt-3 mb-1">{line.replace('### ', '')}</h4>
    }
    if (line.startsWith('## ')) {
      return <h3 key={i} className="text-base font-semibold text-white mt-4 mb-1">{line.replace('## ', '')}</h3>
    }

    if (line.startsWith('- ') || line.startsWith('• ')) {
      return (
        <div key={i} className="flex items-start gap-2 pl-2 py-0.5">
          <span className="text-emerald-500 mt-0.5 shrink-0">›</span>
          <span dangerouslySetInnerHTML={{ __html: formatInline(line.replace(/^[-•]\s/, '')) }} />
        </div>
      )
    }

    if (/^\d+\./.test(line.trim())) {
      return (
        <div key={i} className="flex items-start gap-2 pl-2 py-0.5">
          <span className="text-emerald-500 mt-0.5 shrink-0 font-mono text-xs">{line.trim().match(/^\d+/)?.[0]}.</span>
          <span dangerouslySetInnerHTML={{ __html: formatInline(line.trim().replace(/^\d+\.\s*/, '')) }} />
        </div>
      )
    }

    if (line.startsWith('═══') || line.startsWith('───')) {
      return <hr key={i} className="border-zinc-800 my-2" />
    }

    return (
      <p key={i} dangerouslySetInnerHTML={{ __html: formatInline(line) }} className="py-0.5" />
    )
  })
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-medium">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="text-emerald-400 bg-emerald-900/20 px-1 py-0.5 rounded text-xs">$1</code>')
}

export default function AiAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const send = async (text?: string) => {
    const msg = (text || input).trim()
    if (!msg || loading) return

    const userMsg: Message = { role: 'user', content: msg }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages.map(m => ({ role: m.role, content: m.content })) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal')

      setMessages([...newMessages, { role: 'assistant', content: json.reply }])
    } catch (err: any) {
      setMessages([...newMessages, { role: 'assistant', content: `Maaf, terjadi kesalahan: ${err.message}` }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const clearChat = () => {
    setMessages([])
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-1 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-900/30">
              <Bot size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white flex items-center gap-2">
                AI Assistant
                <span className="text-[10px] bg-emerald-900/30 text-emerald-400 border border-emerald-800/40 px-1.5 py-0.5 rounded-full">Beta</span>
              </h1>
              <p className="text-[11px] text-zinc-500">Tanya apa saja tentang Elyasr Ops</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
              title="Hapus percakapan"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-800/30 flex items-center justify-center">
                <Sparkles size={28} className="text-emerald-400 opacity-60" />
              </div>
              <div>
                <p className="text-zinc-300 font-medium">Ada yang bisa saya bantu?</p>
                <p className="text-zinc-600 text-xs mt-1">Tanya cara pakai fitur, definisi istilah, atau troubleshooting</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    className="text-left text-xs px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800/80 transition-colors flex items-center gap-2"
                  >
                    <HelpCircle size={12} className="text-zinc-600 shrink-0" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-emerald-600 text-white text-sm'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm'
              }`}>
                {msg.role === 'assistant' ? (
                  <div className="space-y-0.5">{renderMarkdown(msg.content)}</div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-emerald-400" />
                <span className="text-xs text-zinc-500">Memikirkan...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-zinc-800 pt-3 pb-1">
          <div className="flex items-end gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 focus-within:border-zinc-700 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ketik pertanyaan Anda..."
              rows={1}
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 resize-none outline-none max-h-24"
              style={{ minHeight: '24px' }}
              onInput={e => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = 'auto'
                target.style.height = Math.min(target.scrollHeight, 96) + 'px'
              }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="shrink-0 p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600 text-white transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
          <p className="text-[10px] text-zinc-700 text-center mt-1.5">
            Enter kirim · Shift+Enter baris baru
          </p>
        </div>
      </div>
    </AppLayout>
  )
}
