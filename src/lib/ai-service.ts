// 仅供服务端读取；传给页面的只能是 name，不能传递整个配置。
export function getAiService() {
  const provider = process.env.AI_PROVIDER?.trim() || "groq";
  if (provider === "siliconflow") return {
    id: "siliconflow", name: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1",
    translationModel: "XingChenAGI/Xing4.0-29B", speechModel: "FunAudioLLM/SenseVoiceSmall",
    key: process.env.SILICONFLOW_API_KEY?.trim(), keyName: "SILICONFLOW_API_KEY",
  };
  if (provider === "groq") return {
    id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1",
    translationModel: "qwen/qwen3.8-27b", speechModel: "whisper-large-v3",
    key: process.env.GROQ_API_KEY?.trim(), keyName: "GROQ_API_KEY",
  };
  return null;
}
