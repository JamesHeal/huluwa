---
name: langgraph-node
description: Create new LangGraph agent nodes with proper patterns. Use when adding agent capabilities, creating execution nodes, or extending the agent workflow. Triggers on agent feature requests, node creation.
---

# LangGraph Node Generator

Generate well-structured LangGraph agent nodes following project conventions.

## Usage

- `/node <name>` - Create a new agent node
- `/node <name> --executor` - Create an executor node
- `/node <name> --router` - Create a router node

## Node Types

### Processing Node

Standard node that transforms state:

```typescript
// src/agent/nodes/example.ts
import type { AgentState } from '../state.js'
import { getModel } from '../../ai/index.js'
import { logger } from '../../logger/index.js'

export async function exampleNode(state: AgentState): Promise<Partial<AgentState>> {
  const { input, summary } = state

  logger.debug('Example node processing', {
    messageCount: input.messages.length
  })

  const model = getModel()

  const response = await model.invoke([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: formatInput(input, summary) }
  ])

  const result = parseResponse(response.content)

  logger.debug('Example node complete', { result })

  return { exampleOutput: result }
}

const SYSTEM_PROMPT = `You are an expert at...`

function formatInput(input: AggregatedMessages, summary?: string): string {
  // Format input for the model
  return `...`
}

function parseResponse(content: string): ExampleOutput {
  // Parse model response
  return { ... }
}
```

### Router Node

Decides next node based on state:

```typescript
// src/agent/nodes/router.ts
import type { AgentState } from '../state.js'

export function routerNode(state: AgentState): string {
  const { intent } = state

  if (!intent) {
    return 'error'
  }

  switch (intent.type) {
    case 'chat':
      return 'chatExecutor'
    case 'question':
      return 'questionExecutor'
    case 'command':
      return 'commandExecutor'
    case 'ignore':
      return '__end__'
    default:
      return 'chatExecutor'
  }
}
```

### Executor Node

Generates final response:

```typescript
// src/agent/nodes/executors/example-executor.ts
import type { AgentState } from '../../state.js'
import { getModel } from '../../../ai/index.js'
import { conversationMemory } from '../../../memory/index.js'

export async function exampleExecutor(state: AgentState): Promise<Partial<AgentState>> {
  const { input, intent, plan } = state

  // Load conversation context
  const context = await conversationMemory.getContext(input.conversationId)

  const model = getModel()

  const response = await model.invoke([
    { role: 'system', content: buildSystemPrompt(context) },
    ...formatHistory(context.history),
    { role: 'user', content: formatUserMessage(input) }
  ])

  // Save to memory
  await conversationMemory.addMessage({
    role: 'assistant',
    content: response.content,
    timestamp: Date.now()
  })

  return { response: response.content }
}
```

## State Updates

### Adding New State Field

1. Update `src/agent/state.ts`:

```typescript
export const AgentStateAnnotation = Annotation.Root({
  // Existing fields...
  input: Annotation<AggregatedMessages>(),
  summary: Annotation<string | undefined>(),

  // New field
  newField: Annotation<NewFieldType | undefined>(),
})
```

2. Update type exports if needed

### State Field Naming

| Field Type | Naming Pattern | Example |
|------------|----------------|---------|
| Intermediate | descriptive noun | `summary`, `intent`, `plan` |
| Final output | `response` | `response` |
| Error | `error` | `error` |
| Metadata | `*Meta` | `processingMeta` |

## Workflow Integration

### Add Node to Graph

In `src/agent/graph.ts`:

```typescript
import { newNode } from './nodes/new-node.js'

const workflow = new StateGraph(AgentStateAnnotation)
  .addNode('summary', summaryNode)
  .addNode('intent', intentNode)
  .addNode('newNode', newNode)  // Add new node
  .addEdge(START, 'summary')
  .addEdge('summary', 'intent')
  .addEdge('intent', 'newNode')  // Connect node
  .addEdge('newNode', END)
```

### Add Conditional Edge

```typescript
.addConditionalEdges('router', routerNode, {
  chatExecutor: 'chatExecutor',
  questionExecutor: 'questionExecutor',
  newExecutor: 'newExecutor',  // Add new route
  __end__: END
})
```

## Best Practices

### Logging

```typescript
import { logger } from '../../logger/index.js'

// At start
logger.debug('Node starting', { inputSize: input.messages.length })

// At end
logger.debug('Node complete', { outputField: result.type })

// On error
logger.error('Node failed', { error, state })
```

### Error Handling

```typescript
export async function safeNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    // Node logic
    return { result }
  } catch (error) {
    logger.error('Node failed', { error })
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
```

### Model Selection

```typescript
// Use fast model for simple tasks
const fastModel = getModel('glm')

// Use default (high quality) for important decisions
const model = getModel()
```

## Testing New Node

```typescript
import { describe, it, expect, vi } from 'vitest'
import { newNode } from './new-node.js'

vi.mock('../../ai/index.js', () => ({
  getModel: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({ content: 'test' })
  }))
}))

describe('newNode', () => {
  it('should process state correctly', async () => {
    const mockState = {
      input: { messages: [], totalCount: 0, timeRange: { start: 0, end: 0 } }
    }

    const result = await newNode(mockState)

    expect(result.newField).toBeDefined()
  })
})
```

## Checklist

When creating a new node:

- [ ] Create node file in `src/agent/nodes/`
- [ ] Define function with `(state: AgentState) => Promise<Partial<AgentState>>`
- [ ] Add proper logging
- [ ] Add error handling
- [ ] Update state.ts if adding new fields
- [ ] Add node to graph.ts
- [ ] Connect edges
- [ ] Write tests
- [ ] Update CLAUDE.md if significant
