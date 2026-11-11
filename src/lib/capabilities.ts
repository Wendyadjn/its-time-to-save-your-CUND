export type Capabilities = { groq: boolean; siliconflow: boolean; tts: boolean };
// 只传递配置是否存在；不将环境变量或密钥传入客户端。
export function publicCapabilities(env: Record<string, string | undefined> = process.env): Capabilities {
  return { groq: Boolean(env.GROQ_API_KEY?.trim()), siliconflow: Boolean(env.SILICONFLOW_API_KEY?.trim()), tts: env.ONDOKU_TOKEN?.trim().length === 64 };
}
