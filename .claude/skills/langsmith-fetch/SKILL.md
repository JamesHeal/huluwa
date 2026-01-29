---
name: langsmith-fetch
description: Debug LangChain/LangGraph agents by fetching execution traces from LangSmith. Use when debugging agent issues, analyzing performance, or investigating tool calls. Triggers on agent debugging, trace analysis, performance investigation.
---

# LangSmith Fetch Skill

Debug LangGraph agents by fetching and analyzing execution traces from LangSmith Studio.

## Setup

### Prerequisites

1. Install the CLI tool:
```bash
pip install langsmith-fetch
```

2. Configure credentials in `.env`:
```bash
LANGSMITH_API_KEY=your-api-key
LANGSMITH_PROJECT=your-project-name
```

Get API key from: https://smith.langchain.com/

## Usage

Ask Claude naturally about agent issues:

```
"Why is my agent slow?"
"Debug the last agent run"
"What tools were called in the last execution?"
"Analyze memory operations"
"Show me token consumption"
```

## Commands

### Fetch Recent Traces

```bash
langsmith-fetch recent --limit 5
```

### Analyze Specific Run

```bash
langsmith-fetch run <run-id>
```

### Export Session

```bash
langsmith-fetch export --format json > debug-session.json
```

## Capabilities

### Error Detection
- Identifies failures and root causes
- Shows stack traces and error context
- Suggests fixes based on common patterns

### Performance Tracking
- Execution duration per node
- Token consumption breakdown
- Latency analysis

### Tool Analysis
- Which tools were called
- Tool input/output inspection
- Tool failure patterns

### Memory Operations
- Long-term memory interactions
- State changes across nodes
- Context window usage

### Multi-Agent Support
- Orchestration flow analysis
- Sub-agent coordination
- Message passing inspection

## Integration with Project

This skill is especially useful for debugging:

- Agent workflow in `src/agent/`
- Individual nodes in `src/agent/nodes/`
- Memory operations in `src/memory/`

## Example Debug Session

```
User: "My intent recognition is failing for some messages"

Claude: Let me fetch the recent traces...

[Analyzes traces from LangSmith]

Found 3 failures in intent node:
1. Messages with @mentions at end parsing incorrectly
2. Empty message array causing undefined access
3. Timeout on messages > 500 chars

Recommendations:
- Add null check in intent.ts:42
- Increase timeout for long messages
- Fix @mention regex pattern
```

## Reference

- LangSmith Docs: https://docs.smith.langchain.com/
- Original Skill: https://github.com/OthmanAdi/langsmith-fetch-skill
