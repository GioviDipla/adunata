function optionalEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim().length > 0 ? value : undefined
}

export const serverEnv = {
  deepseekApiKey: optionalEnv('DEEPSEEK_API_KEY'),
  goblinAiModel: optionalEnv('GOBLINAI_MODEL') ?? 'deepseek-v4-flash',
}
