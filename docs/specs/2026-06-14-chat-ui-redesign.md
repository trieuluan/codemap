# Chat UI Redesign

## Goal

Redesign the desktop chat UI to feel modern, polished, and visually distinct — matching the quality of leading AI chat interfaces (Claude, ChatGPT, Vercel AI Chat) while staying true to CodeMap's dark-theme, neutrals-only design system.

## Current State

The existing `ai-elements/` components (`conversation.tsx`, `message.tsx`, `reasoning.tsx`, `prompt-input.tsx`, `tool.tsx`) and `ConversationPanel.tsx` have these issues:

| Problem | Impact |
|---------|--------|
| Plain text avatars ("You"/"AI") in 40×40 boxes | No visual identity, looks generic |
| User/assistant messages nearly identical (dark gradients) | Hard to distinguish who said what |
| Tool execution section separate from messages | Visual disconnect, feels bolted on |
| No streaming animation | No feedback during AI thinking |
| Raw `<pre>` JSON in approval cards | Thrown-together feel |
| Dense layout (`gap: 18px`, tight padding) | Feels cramped |
| Basic empty state | No personality, no guidance |

## Design Principles

1. **Clarity first** — user vs assistant distinction must be instant
2. **Minimal chrome** — let content breathe, reduce visual noise
3. **Consistent with CodeMap** — dark theme, neutrals only, Geist type, Lucide icons
4. **Follow established patterns** — don't reinvent what Claude/ChatGPT already solved

---

## Chosen Approach: "Clean Full-Width"

Inspired by Claude's chat UI and Vercel AI Chat components. Assistant messages are full-width (no bubble), user messages have subtle background. Small icons replace text avatars. Tool executions are inline with messages.

### Why this approach

- **Best readability** — full-width assistant messages give maximum line length for code and prose
- **Clear hierarchy** — user messages visually distinct via background, assistant messages clean
- **Familiar pattern** — users of Claude/ChatGPT/Linear already know this layout
- **Low implementation risk** — CSS-focused changes, minimal component API changes

### Trade-offs vs alternatives

| | Clean Full-Width (chosen) | Bubble Chat | Card-based |
|---|---|---|---|
| Readability | ★★★ | ★★ (constrained width) | ★★ |
| Visual clarity | ★★★ | ★★ | ★★★ |
| Implementation | Medium | Low | High |
| Feels modern | ★★★ | ★★ | ★★★ |

---

## Component-by-Component Design

### 1. Message Layout

**Before:**
```
┌──────────────────────────────────────┐
│ ┌──────┐  ┌────────────────────────┐ │
│ │  AI  │  │ YOU                    │ │
│ │      │  │ message content here   │ │
│ └──────┘  └────────────────────────┘ │
└──────────────────────────────────────┘
```

**After:**
```
┌──────────────────────────────────────┐
│ ⬡ CodeMap                           │
│ Message content here, full-width,    │
│ with proper line-height and spacing. │
│                                      │
│                    ┌────────────────┐ │
│                    │ Your message   │ │
│                    └────────────────┘ │
└──────────────────────────────────────┘
```

**Key changes:**
- Assistant: full-width, no background, small CodeMap icon (16px) + name at top
- User: right-aligned, subtle background (`var(--card)`), max-width 80%
- Remove avatar boxes entirely — use inline icons
- Increase spacing between messages (`gap: 24px`)

### 2. Assistant Message

```tsx
<div className="assistant-message">
  <div className="assistant-header">
    <CodeMapIcon size={16} />
    <span>CodeMap</span>
  </div>
  <div className="assistant-content">
    {message content}
  </div>
</div>
```

**CSS:**
```css
.assistant-message {
  padding: 0 0 24px;
}

.assistant-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
}

.assistant-content {
  font-size: 14px;
  line-height: 1.7;
  color: var(--foreground);
}
```

### 3. User Message

```tsx
<div className="user-message-wrapper">
  <div className="user-message">
    {message content}
  </div>
</div>
```

**CSS:**
```css
.user-message-wrapper {
  display: flex;
  justify-content: flex-end;
  padding: 0 0 24px;
}

.user-message {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 16px 16px 4px 16px;
  background: var(--card);
  font-size: 14px;
  line-height: 1.7;
  color: var(--foreground);
}
```

### 4. Empty State

**Before:** Generic FileCode2 icon + text
**After:** Centered CodeMap logo + welcoming copy + quick action chips

```tsx
<ConversationEmptyState
  icon={<CodeMapLogo size={48} />}
  title="What are we building?"
  description="Ask CodeMap to inspect, modify, or explain this workspace."
>
  <div className="quick-actions">
    <QuickActionChip label="Explain this codebase" />
    <QuickActionChip label="Find and fix bugs" />
    <QuickActionChip label="Add a new feature" />
  </div>
</ConversationEmptyState>
```

**CSS:**
```css
.empty-chat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 16px;
  text-align: center;
}

.empty-chat-icon {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  margin-bottom: 8px;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 16px;
}

.quick-action-chip {
  padding: 8px 16px;
  border-radius: 9999px;
  background: var(--card);
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.quick-action-chip:hover {
  background: var(--hover);
  border-color: var(--border-strong);
}
```

### 5. Tool Execution (Inline)

**Before:** Separate `tool-stack` section below messages
**After:** Inline within assistant message, collapsible

```tsx
<div className="tool-inline">
  <Collapsible>
    <CollapsibleTrigger className="tool-trigger">
      <WrenchIcon size={14} />
      <span>Executed search_codebase</span>
      <StatusBadge state="completed" />
      <ChevronDownIcon size={14} />
    </CollapsibleTrigger>
    <CollapsibleContent>
      <ToolInput input={tool.input} />
      <ToolOutput output={tool.output} />
    </CollapsibleContent>
  </Collapsible>
</div>
```

**CSS:**
```css
.tool-inline {
  margin: 12px 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.tool-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  background: var(--card);
  font-size: 13px;
  color: var(--text-dim);
  cursor: pointer;
}
```

### 6. Reasoning Block

**Before:** Hidden trigger (`sr-only`), auto-open/close
**After:** Visible trigger with duration, clean collapsible

```tsx
<div className="reasoning-block">
  <Reasoning isStreaming={isStreaming}>
    <ReasoningTrigger>
      <BrainIcon size={14} />
      <span>Thought for {duration}s</span>
    </ReasoningTrigger>
    <ReasoningContent>{thinkingText}</ReasoningContent>
  </Reasoning>
</div>
```

**CSS:**
```css
.reasoning-block {
  margin: 8px 0 16px;
  padding: 12px;
  border-left: 2px solid var(--border);
  border-radius: 0 8px 8px 0;
  background: var(--card);
}

.reasoning-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
}
```

### 7. Approval Card

**Before:** Raw `<pre>{JSON.stringify(...)}</pre>`
**After:** Clean card with structured layout

```tsx
<section className="approval-card">
  <div className="approval-header">
    <ShieldCheck size={16} className="text-amber" />
    <span>Permission Required</span>
  </div>
  <div className="approval-tool">
    <span className="approval-tool-name">{toolName}</span>
    <code className="approval-args">{formatArgs(args)}</code>
  </div>
  <div className="approval-actions">
    <Button variant="outline" onClick={onDecline}>Decline</Button>
    <Button onClick={onApprove}>Approve</Button>
  </div>
</section>
```

**CSS:**
```css
.approval-card {
  margin: 16px 0;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card);
}

.approval-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-weight: 500;
  font-size: 14px;
}

.approval-tool-name {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
}

.approval-args {
  display: block;
  margin-top: 8px;
  padding: 12px;
  border-radius: 8px;
  background: var(--background);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted);
  overflow-x: auto;
}

.approval-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  justify-content: flex-end;
}
```

### 8. Streaming Indicator

Add a subtle typing indicator when AI is streaming:

```tsx
{isStreaming && (
  <div className="streaming-indicator">
    <span className="dot" />
    <span className="dot" />
    <span className="dot" />
  </div>
)}
```

**CSS:**
```css
.streaming-indicator {
  display: flex;
  gap: 4px;
  padding: 8px 0;
}

.streaming-indicator .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--muted);
  animation: bounce 1.4s infinite ease-in-out;
}

.streaming-indicator .dot:nth-child(1) { animation-delay: -0.32s; }
.streaming-indicator .dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `packages/desktop/src/renderer/components/ConversationPanel.tsx` | Restructure message rendering, inline tools, new empty state |
| `packages/desktop/src/components/ai-elements/message.tsx` | New Message/MessageContent styles, remove avatar grid |
| `packages/desktop/src/components/ai-elements/conversation.tsx` | New empty state with quick actions |
| `packages/desktop/src/components/ai-elements/reasoning.tsx` | Visible trigger, cleaner styling |
| `packages/desktop/src/components/ai-elements/tool.tsx` | Inline collapsible style |
| `packages/desktop/src/renderer/styles.css` | New CSS classes, remove old message styles |

## New Files

| File | Purpose |
|------|---------|
| `packages/desktop/src/components/ai-elements/streaming-indicator.tsx` | Animated typing dots |
| `packages/desktop/src/components/ai-elements/quick-action-chip.tsx` | Empty state action chips |

---

## Open Questions

1. **CodeMap icon for assistant avatar** — should we use the app logo or a generic bot icon?
2. **Quick action chips** — should clicking them insert text into the prompt input, or auto-send?
3. **Tool execution** — keep as collapsible, or show a summary line only (expand on click)?
4. **Message timestamps** — add them or keep minimal?
