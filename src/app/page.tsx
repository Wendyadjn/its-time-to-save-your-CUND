import { getAiService } from "@/lib/ai-service";
import NotebookApp from "@/components/notebook-app";

export const dynamic = "force-dynamic";

export default function Page() {
  return <NotebookApp serviceName={getAiService()?.name ?? "配置无效"} />;
}
