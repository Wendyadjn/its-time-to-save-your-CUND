import ServiceCapabilities from "@/components/service-capabilities";
import { publicCapabilities } from "@/lib/capabilities";
import { publicCloudConfig } from "@/lib/cloud-config";
import { CloudHistoryProvider } from "@/components/cloud-history";
import { getAiService } from "@/lib/ai-service";
import NotebookApp from "@/components/notebook-app";

export const dynamic = "force-dynamic";

export default function Page() {
  return <ServiceCapabilities value={publicCapabilities()}><CloudHistoryProvider config={publicCloudConfig()}><NotebookApp serviceName={getAiService()?.name ?? "配置无效"} /></CloudHistoryProvider></ServiceCapabilities>;
}
