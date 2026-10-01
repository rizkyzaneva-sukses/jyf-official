/**
 * Konfigurasi provider AI yang dibaca saat request berjalan.
 *
 * Akses dengan process.env[nama] sengaja dipakai agar nilai runtime container
 * tidak terikat ke environment ketika Next.js melakukan build.
 */
export type AiProvider = {
  name: string
  baseUrl: string
  apiKey: string
  model: string
}

type AiEnvironmentName =
  | 'ANTIGRAVITY_URL_1'
  | 'ANTIGRAVITY_KEY_1'
  | 'ANTIGRAVITY_MODEL_1'
  | 'ANTIGRAVITY_URL_2'
  | 'ANTIGRAVITY_KEY_2'
  | 'ANTIGRAVITY_MODEL_2'
  | 'ANTIGRAVITY_URL_3'
  | 'ANTIGRAVITY_KEY_3'
  | 'ANTIGRAVITY_MODEL_3'

function readEnvironment(name: AiEnvironmentName): string {
  const value = process.env[name]
  if (typeof value !== 'string') return ''

  // Mengakomodasi nilai yang terpaste dari format multiline dengan `\\`
  // sebagai line continuation. Nilai biasa tidak berubah.
  return value
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\+$/g, '')
}

function normalizeBaseUrl(value: string): string {
  // Contoh input yang masih ditoleransi: https\://provider.example/v1\
  return value
    .replace(/\\(?=:)/g, '')
    .replace(/\/+$/g, '')
}

/** Mengambil slot AI aktif tanpa pernah mengekspos API key ke pemanggil. */
export function getAiProviders(maxSlots = 3): AiProvider[] {
  const providers: AiProvider[] = []

  for (let slot = 1; slot <= Math.min(Math.max(maxSlots, 0), 3); slot += 1) {
    const suffix = String(slot) as '1' | '2' | '3'
    const baseUrl = normalizeBaseUrl(readEnvironment(`ANTIGRAVITY_URL_${suffix}` as AiEnvironmentName))
    const apiKey = readEnvironment(`ANTIGRAVITY_KEY_${suffix}` as AiEnvironmentName)
    const model = readEnvironment(`ANTIGRAVITY_MODEL_${suffix}` as AiEnvironmentName)

    if (baseUrl && apiKey && model) {
      providers.push({ name: `Slot${slot}`, baseUrl, apiKey, model })
    }
  }

  return providers
}

/** Status aman untuk health check; API key tidak ikut dikembalikan. */
export function getAiProviderStatus(maxSlots = 3) {
  const configuredSlots = getAiProviders(maxSlots).map(provider => provider.name)
  return { configuredSlots, configured: configuredSlots.length > 0 }
}
