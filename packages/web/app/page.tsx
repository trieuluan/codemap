import { Nav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import {
  Problem, Pipeline, McpTools, Workflow, GraphViz,
  Editors, Features, Pricing, FinalCta,
} from "@/components/landing/sections";
import { Footer } from "@/components/landing/footer";

export const metadata = {
  title: "CodeMap — Code intelligence for AI-native development",
  description:
    "The semantic layer between your repository and AI coding agents. Symbol-level indexing, dependency graphs, and MCP tools that give Claude, Cursor, Codex and Gemini real architectural memory.",
};

export default function LandingPage() {
  return (
    <div className="landing-root min-h-screen">
      <Nav />
      <main>
        <Hero />
        <Problem />
        <Pipeline />
        <McpTools />
        <Workflow />
        <GraphViz />
        <Editors />
        <Features />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
