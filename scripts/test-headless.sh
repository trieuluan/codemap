#!/usr/bin/env bash
# Integration test runner for CodeMap headless CLI
#
# Similar to obra/superpowers test methodology:
# - Run headless sessions with specific prompts
# - Parse JSON output
# - Verify: tool invocations, text content, files changed
# - Report pass/fail with token usage
#
# Usage:
#   ./scripts/test-headless.sh              # Run all tests
#   ./scripts/test-headless.sh <test-name>  # Run specific test
#
# Exit codes:
#   0 = all tests passed
#   1 = one or more tests failed

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test results
PASSED=0
FAILED=0
SKIPPED=0

# Codemap binary
CODEMAP="${CODEMAP:-pnpm run dev:cli --}"

# Timeout for each test (seconds)
TIMEOUT="${TIMEOUT:-60}"

# Helper functions
log_pass() {
  echo -e "${GREEN}  ✓ PASS${NC}: $1"
  PASSED=$((PASSED + 1))
}

log_fail() {
  echo -e "${RED}  ✗ FAIL${NC}: $1"
  [[ -n "${2:-}" ]] && echo -e "         ${RED}$2${NC}"
  FAILED=$((FAILED + 1))
}

log_skip() {
  echo -e "${YELLOW}  ⊘ SKIP${NC}: $1"
  SKIPPED=$((SKIPPED + 1))
}

log_section() {
  echo ""
  echo -e "${CYAN}━━━ $1 ━━━${NC}"
}

# JSON helpers (uses jq if available, otherwise node)
json_get() {
  local json="$1"
  local path="$2"
  if command -v jq &>/dev/null; then
    echo "$json" | jq -r "$path"
  else
    echo "$json" | node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
      const path = '$path'.replace(/^\./, '');
      const keys = path.split('.');
      let val = data;
      for (const k of keys) {
        if (val == null) break;
        val = val[k];
      }
      console.log(val === undefined ? '' : (typeof val === 'boolean' ? val : String(val)));
    "
  fi
}

# Run a headless test
run_headless() {
  local prompt="$1"
  local timeout="${2:-$TIMEOUT}"

  # Use pnpm to forward args properly
  pnpm run dev:cli -- --prompt "$prompt" --format json --timeout "$timeout" 2>/dev/null
}

# ============================================================
# Test definitions
# ============================================================

test_basic_response() {
  local name="basic-response"
  log_section "Test: $name"

  local output
  output=$(run_headless "Say exactly: test OK" 30) || true

  # Check JSON is valid
  if ! echo "$output" | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))" &>/dev/null; then
    log_fail "$name" "Invalid JSON output"
    return
  fi

  # Check text contains expected response
  local text
  text=$(json_get "$output" ".text")
  if echo "$text" | grep -qi "test OK"; then
    log_pass "$name: response contains expected text"
  else
    log_fail "$name" "Expected 'test OK' in response, got: ${text:0:100}"
  fi

  # Check duration is reasonable
  local duration
  duration=$(json_get "$output" ".duration")
  if [[ "$duration" -lt 30000 ]]; then
    log_pass "$name: completed in ${duration}ms (<30s)"
  else
    log_fail "$name" "Took ${duration}ms (>30s)"
  fi
}

test_tool_invocation() {
  local name="tool-invocation"
  log_section "Test: $name"

  local output
  output=$(run_headless "List all files in the root directory using the find_files tool" 60) || true

  # Check usedTools is true
  local usedTools
  usedTools=$(json_get "$output" ".usedTools")
  if [[ "$usedTools" == "true" ]]; then
    log_pass "$name: agent used tools"
  else
    log_fail "$name" "usedTools=false, expected true"
    return
  fi

  # Check toolCalls array exists and is non-empty
  local toolCallsCount
  toolCallsCount=$(json_get "$output" ".toolCalls | length")
  if [[ "$toolCallsCount" -gt 0 ]]; then
    log_pass "$name: $toolCallsCount tool call(s) recorded"
  else
    log_fail "$name" "toolCalls is empty"
  fi

  # Check a find_files tool was called
  local hasFindFiles
  hasFindFiles=$(json_get "$output" ".toolCalls | map(select(.name == \"find_files\")) | length")
  if [[ "$hasFindFiles" -gt 0 ]]; then
    log_pass "$name: find_files tool was invoked"
  else
    log_fail "$name" "find_files not in toolCalls"
  fi
}

test_usage_tracking() {
  local name="usage-tracking"
  log_section "Test: $name"

  local output
  output=$(run_headless "What is 2+2?" 30) || true

  # Check usage object exists
  local promptTokens
  promptTokens=$(json_get "$output" ".usage.promptTokens")
  local completionTokens
  completionTokens=$(json_get "$output" ".usage.completionTokens")

  if [[ "$promptTokens" != "" && "$promptTokens" != "0" ]]; then
    log_pass "$name: promptTokens=$promptTokens"
  else
    log_fail "$name" "promptTokens missing or zero"
  fi

  if [[ "$completionTokens" != "" && "$completionTokens" != "0" ]]; then
    log_pass "$name: completionTokens=$completionTokens"
  else
    log_fail "$name" "completionTokens missing or zero"
  fi
}

test_messages_transcript() {
  local name="messages-transcript"
  log_section "Test: $name"

  local output
  output=$(run_headless "Say hi" 30) || true

  # Check messages array exists
  local msgCount
  msgCount=$(json_get "$output" ".messages | length")
  if [[ "$msgCount" -gt 0 ]]; then
    log_pass "$name: $msgCount message(s) in transcript"
  else
    log_fail "$name" "messages is empty or missing"
    return
  fi

  # Check there's at least one user message
  # NOTE: AgentLoopResult.messages only contains user messages (harness design)
  local userMsgs
  userMsgs=$(json_get "$output" ".messages | map(select(.role == \"user\")) | length")

  if [[ "$userMsgs" -gt 0 ]]; then
    log_pass "$name: transcript has user message ($userMsgs)"
  else
    log_fail "$name" "Expected at least one user message"
  fi
}

test_json_pipe_jq() {
  local name="json-pipe-jq"
  log_section "Test: $name"

  if ! command -v jq &>/dev/null; then
    log_skip "$name: jq not installed"
    return
  fi

  local output
  output=$(run_headless "Say hi" 30) || true

  # Pipe through jq to verify valid JSON
  if echo "$output" | jq . &>/dev/null; then
    log_pass "$name: output pipes cleanly through jq"
  else
    log_fail "$name" "jq parse error — output is not valid JSON"
  fi

  # Test jq field extraction
  local text
  text=$(echo "$output" | jq -r '.text')
  if [[ -n "$text" ]]; then
    log_pass "$name: jq .text extraction works"
  else
    log_fail "$name" "jq .text extraction returned empty"
  fi
}

# ============================================================
# Skill Activation Tests — verify agent uses right tools
# ============================================================

test_skill_file_discovery() {
  local name="skill-file-discovery"
  log_section "Test: $name"

  local output
  output=$(run_headless "Find all TypeScript config files (tsconfig) in this repo" 60) || true

  local usedTools
  usedTools=$(json_get "$output" ".usedTools")
  if [[ "$usedTools" != "true" ]]; then
    log_fail "$name" "Agent did not use tools to find files"
    return
  fi

  # Should use find_files or search_content
  local toolNames
  toolNames=$(json_get "$output" ".toolCalls | map(.name) | unique | join(\",\")")
  if echo "$toolNames" | grep -qE "find_files|search_content"; then
    log_pass "$name: used file discovery tools ($toolNames)"
  else
    log_fail "$name" "Expected find_files or search_content, got: $toolNames"
  fi
}

test_skill_codebase_search() {
  local name="skill-codebase-search"
  log_section "Test: $name"

  local output
  output=$(run_headless "Find where the CLI entry point is defined — look for the main() function or shebang line" 60) || true

  local usedTools
  usedTools=$(json_get "$output" ".usedTools")
  if [[ "$usedTools" != "true" ]]; then
    log_fail "$name" "Agent did not use tools"
    return
  fi

  local toolNames
  toolNames=$(json_get "$output" ".toolCalls | map(.name) | unique | join(\",\")")
  if echo "$toolNames" | grep -qE "search_content|find_files|view"; then
    log_pass "$name: used search tools to find entry point ($toolNames)"
  else
    log_fail "$name" "Expected search tools, got: $toolNames"
  fi

  # Response should mention a file path
  local text
  text=$(json_get "$output" ".text")
  if echo "$text" | grep -qE "\.ts|\.js|index\.|cli"; then
    log_pass "$name: response references a source file"
  else
    log_fail "$name" "Response does not mention a file path"
  fi
}

# ============================================================
# Code Quality Tests — verify agent produces structured output
# ============================================================

test_code_quality_generation() {
  local name="code-quality-generation"
  log_section "Test: $name"

  local output
  output=$(run_headless "Write a TypeScript function called clamp that takes a value, min, and max, and clamps the value between min and max. Just the function, no explanation." 60) || true

  local text
  text=$(json_get "$output" ".text")

  # Should contain function signature
  if echo "$text" | grep -qiE "function clamp|clamp\s*\(|const clamp|export.*clamp"; then
    log_pass "$name: response contains clamp function"
  else
    log_fail "$name" "Response missing clamp function signature"
    return
  fi

  # Should contain return logic
  if echo "$text" | grep -qiE "return|Math\.min|Math\.max|if\s*\("; then
    log_pass "$name: response contains implementation logic"
  else
    log_fail "$name" "Response missing implementation logic"
  fi

  # No tools needed for pure generation
  local usedTools
  usedTools=$(json_get "$output" ".usedTools")
  log_pass "$name: generation completed (usedTools=$usedTools)"
}

test_code_quality_explanation() {
  local name="code-quality-explanation"
  log_section "Test: $name"

  local output
  output=$(run_headless "Read the file packages/cli/src/index.ts and explain what it does in 2-3 sentences" 60) || true

  local usedTools
  usedTools=$(json_get "$output" ".usedTools")
  if [[ "$usedTools" != "true" ]]; then
    log_fail "$name" "Agent did not read the file"
    return
  fi

  # Should have used a file reading tool
  local readFileTool
  readFileTool=$(json_get "$output" ".toolCalls | map(select(.name == \"view\" or .name == \"search_content\" or .name == \"find_files\")) | length")
  if [[ "$readFileTool" -gt 0 ]]; then
    log_pass "$name: agent read the file"
  else
    log_fail "$name" "Agent did not use a file reading tool"
    return
  fi

  # Response should be non-trivial (>50 chars)
  local text
  text=$(json_get "$output" ".text")
  local textLen=${#text}
  if [[ "$textLen" -gt 50 ]]; then
    log_pass "$name: explanation is substantive (${textLen} chars)"
  else
    log_fail "$name" "Explanation too short (${textLen} chars)"
  fi
}

# ============================================================
# Reasoning Tests — verify agent reasoning capability
# ============================================================

test_reasoning_logic() {
  local name="reasoning-logic"
  log_section "Test: $name"

  local output
  output=$(run_headless 'A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Answer with just the number.' 30) || true

  local text
  text=$(json_get "$output" ".text")

  # Correct answer is $0.05 (5 cents)
  if echo "$text" | grep -qE '0\.05|5 cents|\$0\.05'; then
    log_pass "$name: correct answer (5 cents)"
  else
    log_fail "$name" "Expected 0.05, got: ${text:0:100}"
  fi
}

test_reasoning_code_analysis() {
  local name="reasoning-code-analysis"
  log_section "Test: $name"

  local output
  output=$(run_headless "What are the potential security issues with this code: const query = \"SELECT * FROM users WHERE id = \" + userId; ? Just list the issues, no fix needed." 30) || true

  local text
  text=$(json_get "$output" ".text")

  # Should mention SQL injection
  if echo "$text" | grep -qiE "sql injection|injection|sanitiz|parameteriz|escap"; then
    log_pass "$name: identified SQL injection risk"
  else
    log_fail "$name" "Did not identify SQL injection"
    return
  fi

  # Should mention concatenation as the issue
  if echo "$text" | grep -qiE 'concatenat|\+|string interpolat|\$\{'; then
    log_pass "$name: identified string concatenation as root cause"
  else
    log_fail "$name" "Did not identify concatenation issue"
  fi
}

test_reasoning_multi_step() {
  local name="reasoning-multi-step"
  log_section "Test: $name"

  local output
  output=$(run_headless "If I have a monorepo with 5 packages and each has its own tsconfig.json, what happens when I run tsc --noEmit from root? Answer in 2 sentences." 90) || true

  local text
  text=$(json_get "$output" ".text")

  # Response should be meaningful (>80 chars for multi-step reasoning)
  local textLen=${#text}
  if [[ "$textLen" -gt 80 ]]; then
    log_pass "$name: multi-step reasoning produced substantive output (${textLen} chars)"
  else
    log_fail "$name" "Response too short for multi-step reasoning (${textLen} chars)"
  fi

  # Should mention tsconfig or project references or build
  if echo "$text" | grep -qiE "tsconfig|project ref|build|root|package|compil"; then
    log_pass "$name: response references relevant concepts"
  else
    log_fail "$name" "Response does not mention relevant concepts"
  fi
}

# ============================================================
# Main
# ============================================================

echo -e "${CYAN}CodeMap Integration Tests (headless mode)${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Parse args
TARGET_TEST="${1:-all}"

# Run tests
if [[ "$TARGET_TEST" == "all" || "$TARGET_TEST" == "basic-response" ]]; then
  test_basic_response
fi

if [[ "$TARGET_TEST" == "all" || "$TARGET_TEST" == "tool-invocation" ]]; then
  test_tool_invocation
fi

if [[ "$TARGET_TEST" == "all" || "$TARGET_TEST" == "usage-tracking" ]]; then
  test_usage_tracking
fi

if [[ "$TARGET_TEST" == "all" || "$TARGET_TEST" == "messages-transcript" ]]; then
  test_messages_transcript
fi

if [[ "$TARGET_TEST" == "all" || "$TARGET_TEST" == "json-pipe-jq" ]]; then
  test_json_pipe_jq
fi

# Skill activation tests
if [[ "$TARGET_TEST" == "all" || "$TARGET_TEST" == "skill-file-discovery" ]]; then
  test_skill_file_discovery
fi

if [[ "$TARGET_TEST" == "all" || "$TARGET_TEST" == "skill-codebase-search" ]]; then
  test_skill_codebase_search
fi

# Code quality tests
if [[ "$TARGET_TEST" == "all" || "$TARGET_TEST" == "code-quality-generation" ]]; then
  test_code_quality_generation
fi

if [[ "$TARGET_TEST" == "all" || "$TARGET_TEST" == "code-quality-explanation" ]]; then
  test_code_quality_explanation
fi

# Reasoning tests
if [[ "$TARGET_TEST" == "all" || "$TARGET_TEST" == "reasoning-logic" ]]; then
  test_reasoning_logic
fi

if [[ "$TARGET_TEST" == "all" || "$TARGET_TEST" == "reasoning-code-analysis" ]]; then
  test_reasoning_code_analysis
fi

if [[ "$TARGET_TEST" == "all" || "$TARGET_TEST" == "reasoning-multi-step" ]]; then
  test_reasoning_multi_step
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}, ${YELLOW}$SKIPPED skipped${NC}"

if [[ $FAILED -gt 0 ]]; then
  echo -e "${RED}Some tests failed!${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
fi
