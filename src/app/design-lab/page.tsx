import { publicCloudConfig } from "@/lib/cloud-config";
import { CloudHistoryProvider } from "@/components/cloud-history";
import { getAiService } from "@/lib/ai-service";
import NotebookApp from "@/components/notebook-app";

export const dynamic = "force-dynamic";

export default function DesignLab() {
  return <CloudHistoryProvider config={publicCloudConfig()}><NotebookApp preview serviceName={getAiService()?.name ?? "配置无效"} /></CloudHistoryProvider>;
}
