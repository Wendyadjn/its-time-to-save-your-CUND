import { getAiService } from "@/lib/ai-service";
import NotebookApp from "@/components/notebook-app";

export const dynamic = "force-dynamic";

export default function DesignLab() {
  return <NotebookApp preview serviceName={getAiService()?.name ?? "配置无效"} />;
}
