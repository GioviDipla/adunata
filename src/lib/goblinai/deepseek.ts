import { serverEnv } from '@/env.server'

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export class GoblinAINotConfiguredError extends Error {
  constructor() {
    super('GoblinAI is not configured')
    this.name = 'GoblinAINotConfiguredError'
  }
}

export async function generateGoblinAIText(input: {
  system: string
  prompt: string
  temperature?: number
}): Promise<{ text: string; promptTokens?: number; completionTokens?: number }> {
  if (!serverEnv.deepseekApiKey) {
    throw new GoblinAINotConfiguredError()
  }

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${serverEnv.deepseekApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: serverEnv.goblinAiModel,
      temperature: input.temperature ?? 0.2,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.prompt },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`DeepSeek request failed: ${res.status} ${body.slice(0, 500)}`)
  }

  const json = (await res.json()) as DeepSeekResponse
  return {
    text: json.choices?.[0]?.message?.content ?? '',
    promptTokens: json.usage?.prompt_tokens,
    completionTokens: json.usage?.completion_tokens,
  }
}
