import { getAiService } from "../../../lib/ai-service";
import { serviceUsage } from "../../../lib/service-usage";

export const runtime = "nodejs";
export async function GET() {
  try {
    const usage = await serviceUsage().snapshot();
    const providers = ["groq", "siliconflow"].map(id => {
      const service = getAiService(id)!;
      return { id, name: service.name, configured: Boolean(service.key) };
    });
    return Response.json({ ...usage, providers, defaultProvider: getAiService()?.id ?? "groq", ondokuConfigured: process.env.ONDOKU_TOKEN?.trim().length === 64, balance: "unknown" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "用量统计暂不可用，请检查服务器存储。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
