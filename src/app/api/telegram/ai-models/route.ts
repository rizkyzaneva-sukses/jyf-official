/** GET /api/telegram/ai-models?secret=565228988 — cek model list dari semua AI provider */
import { NextRequest, NextResponse } from 'next/server'
import { getAiProviders } from '@/lib/ai-providers'

export async function GET(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get('secret')
    if (secret !== process.env.TELEGRAM_OWNER_CHAT_ID) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const providers = getAiProviders(3)

    if (providers.length === 0) {
        return NextResponse.json({ error: 'Tidak ada AI provider yang dikonfigurasi' })
    }

    const results = []
    for (const p of providers) {
        try {
            const res = await fetch(`${p.baseUrl}/models`, {
                headers: { 'Authorization': `Bearer ${p.apiKey}` },
                signal: AbortSignal.timeout(10000),
            })
            const text = await res.text()
            try {
                const data = JSON.parse(text)
                results.push({ name: p.name, baseUrl: p.baseUrl, configuredModel: p.model, status: res.status, models: data })
            } catch {
                results.push({ name: p.name, baseUrl: p.baseUrl, configuredModel: p.model, status: res.status, error: 'Bukan JSON', raw: text.slice(0, 500) })
            }
        } catch (err: any) {
            results.push({ name: p.name, baseUrl: p.baseUrl, configuredModel: p.model, error: err.message })
        }
    }

    return NextResponse.json({ providers: results })
}
