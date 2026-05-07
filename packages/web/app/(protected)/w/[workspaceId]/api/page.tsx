import { McpSetupView } from "@/features/mcp/mcp-setup-view";
import { config } from "@/lib/config";

export const metadata = { title: "API & MCP — CodeMap" };

export default function ApiPage() {
  return <McpSetupView apiBaseUrl={config.apiUrl} />;
}
