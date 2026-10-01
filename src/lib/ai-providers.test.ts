import { afterEach, describe, expect, it } from 'vitest'
import { getAiProviders } from '@/lib/ai-providers'

const environmentNames = [
  'ANTIGRAVITY_URL_1', 'ANTIGRAVITY_KEY_1', 'ANTIGRAVITY_MODEL_1',
  'ANTIGRAVITY_URL_2', 'ANTIGRAVITY_KEY_2', 'ANTIGRAVITY_MODEL_2',
  'ANTIGRAVITY_URL_3', 'ANTIGRAVITY_KEY_3', 'ANTIGRAVITY_MODEL_3',
] as const

const originalEnvironment = Object.fromEntries(
  environmentNames.map(name => [name, process.env[name]]),
)

afterEach(() => {
  for (const name of environmentNames) {
    const original = originalEnvironment[name]
    if (original === undefined) delete process.env[name]
    else process.env[name] = original
  }
})

describe('getAiProviders', () => {
  it('membaca environment saat dipanggil dan menormalkan format escaped', () => {
    process.env.ANTIGRAVITY_URL_1 = ' https\\://ai.example.test/v1\\ '
    process.env.ANTIGRAVITY_KEY_1 = ' key-rahasia\\ '
    process.env.ANTIGRAVITY_MODEL_1 = ' model-test\\ '

    expect(getAiProviders(2)).toEqual([
      {
        name: 'Slot1',
        baseUrl: 'https://ai.example.test/v1',
        apiKey: 'key-rahasia',
        model: 'model-test',
      },
    ])
  })

  it('mengabaikan slot yang belum lengkap', () => {
    process.env.ANTIGRAVITY_URL_1 = 'https://ai.example.test/v1'
    process.env.ANTIGRAVITY_KEY_1 = 'key-rahasia'
    delete process.env.ANTIGRAVITY_MODEL_1

    expect(getAiProviders(1)).toEqual([])
  })
})
