/** GET /api/telegram/ai-models?secret=565228988 — cek model list dari semua AI provider */
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get('secret')
    if (secret !== process.env.TELEGRAM_OWNER_CHAT_ID) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const providers = [
        { name: 'Slot1', url: process.env.ANTIGRAVITY_URL_1, key: process.env.ANTIGRAVITY_KEY_1, model: process.env.ANTIGRAVITY_MODEL_1 },
        { name: 'Slot2', url: process.env.ANTIGRAVITY_URL_2, key: process.env.ANTIGRAVITY_KEY_2, model: process.env.ANTIGRAVITY_MODEL_2 },
        { name: 'Slot3', url: process.env.ANTIGRAVITY_URL_3, key: process.env.ANTIGRAVITY_KEY_3, model: process.env.ANTIGRAVITY_MODEL_3 },
    ].filter(p => p.url && p.key)

    if (providers.length === 0) {
        return NextResponse.json({ error: 'Tidak ada AI provider yang dikonfigurasi' })
    }

    const results = []
    for (const p of providers) {
        try {
            const res = await fetch(`${p.url}/models`, {
                headers: { 'Authorization': `Bearer ${p.key}` },
                signal: AbortSignal.timeout(10000),
            })
            const text = await res.text()
            try {
                const data = JSON.parse(text)
                results.push({ name: p.name, baseUrl: p.url, configuredModel: p.model, status: res.status, models: data })
            } catch {
                results.push({ name: p.name, baseUrl: p.url, configuredModel: p.model, status: res.status, error: 'Bukan JSON', raw: text.slice(0, 500) })
            }
        } catch (err: any) {
            results.push({ name: p.name, baseUrl: p.url, configuredModel: p.model, error: err.message })
        }
    }

    return NextResponse.json({ providers: results })
}
