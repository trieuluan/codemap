# Desktop AI Elements Integration

## Goal

Apply the exported desktop design to the production Electron renderer while
using Vercel AI Elements for the generic AI chat surfaces.

## Scope

- Use AI Elements for conversation scrolling, messages, markdown responses,
  reasoning, tool calls, code blocks, attachments, and prompt input.
- Keep the existing CodeMap session controller and Electron IPC runtime.
- Keep CodeMap-specific shell surfaces custom: launcher, workspace switcher,
  thread navigation, model selection, and runtime settings.
- Theme shadcn and AI Elements with the existing near-monochrome CodeMap
  palette, Geist typography, semantic status colors, and compact radii.

## Data Flow

1. `useAgentSession` continues reducing runtime events into the current
   `SessionSnapshot`.
2. `ConversationPanel` adapts snapshot messages, reasoning, and tool state into
   AI Elements components without introducing `useChat` or another backend.
3. `ComposerFooter` converts AI Elements attachments into the existing
   base64 image payload accepted by `DesktopApi.send`.
4. Recent workspaces are renderer-local metadata stored in `localStorage`.
   Opening a recent path still goes through validated Electron IPC.

## Non-goals

- Replacing the agent runtime with Vercel AI SDK transport.
- Adding a provider credential editor. The current desktop IPC only exposes
  redacted settings and has no secure save/verify contract.
- Implementing speculative Code Map, plan timeline, or observability panels.

## Verification

- Desktop tests.
- Electron Vite production build.
- Renderer inspection in the running Electron app.
- Diff review for generated registry source and integration adapters.
