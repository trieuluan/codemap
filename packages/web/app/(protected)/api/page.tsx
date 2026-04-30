import { McpSetupView } from "@/features/mcp/mcp-setup-view";

export const metadata = {
  title: "API & MCP — CodeMap",
};

export default function ApiPage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  return <McpSetupView apiBaseUrl={apiBaseUrl} />;
}
