---
name: vitest-gen
description: Generate Vitest unit tests for TypeScript modules. Use when creating tests, improving coverage, or testing new features. Triggers on test generation requests, coverage improvement, TDD workflow.
---

# Vitest Test Generator

Generate comprehensive Vitest unit tests for TypeScript ESM modules.

## Usage

- `/test` - Generate tests for staged or recent changes
- `/test <file>` - Generate tests for specific file
- `/test --coverage` - Suggest tests to improve coverage

## Test Structure

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ModuleName } from './module-name.js'

describe('ModuleName', () => {
  let instance: ModuleName

  beforeEach(() => {
    instance = new ModuleName()
  })

  describe('methodName', () => {
    it('should handle normal case', () => {
      const result = instance.methodName(input)
      expect(result).toBe(expected)
    })

    it('should handle edge case', () => {
      expect(() => instance.methodName(null))
        .toThrow('Expected error message')
    })
  })
})
```

## Mocking Patterns

### Mock AI Models

```typescript
vi.mock('../ai/index.js', () => ({
  getModel: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({
      content: 'mocked response'
    })
  }))
}))
```

### Mock External Services

```typescript
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: 'test' })
  })
})
```

### Mock LangGraph State

```typescript
const mockState: AgentState = {
  input: {
    messages: [{ senderId: '1', text: 'test' }],
    totalCount: 1,
    timeRange: { start: 0, end: 1000 }
  },
  summary: undefined,
  intent: undefined,
  response: undefined
}
```

## Test Categories

### Unit Tests

Test individual functions/methods in isolation:

```typescript
describe('MessageQueue', () => {
  it('should push and flush messages', () => {
    const queue = new MessageQueue()
    queue.push(message1)
    queue.push(message2)

    const result = queue.flush()

    expect(result).toHaveLength(2)
    expect(queue.size).toBe(0)
  })
})
```

### Integration Tests

Test module interactions:

```typescript
describe('Agent Pipeline', () => {
  it('should process message through all nodes', async () => {
    const result = await graph.invoke({ input: testMessages })

    expect(result.summary).toBeDefined()
    expect(result.intent).toBeDefined()
    expect(result.response).toBeDefined()
  })
})
```

### Error Handling Tests

```typescript
it('should handle API timeout gracefully', async () => {
  mockFetch.mockRejectedValue(new Error('Timeout'))

  await expect(service.call())
    .rejects.toThrow('Timeout')
})
```

## File Naming Convention

```
src/
├── module-name.ts
└── module-name.test.ts    # Co-located test file
```

## Running Tests

```bash
pnpm test                  # Run all tests
pnpm test message          # Run tests matching "message"
pnpm test --watch          # Watch mode
pnpm test --coverage       # With coverage report
```

## Coverage Goals

| Module | Target |
|--------|--------|
| agent/nodes/* | 80%+ |
| pipeline/* | 90%+ |
| config/* | 70%+ |
| onebot/* | 60%+ |

## Test Generation Workflow

1. Analyze the source file
2. Identify public APIs
3. Generate test cases for:
   - Happy path
   - Edge cases
   - Error conditions
   - Async behavior
4. Add appropriate mocks
5. Verify tests pass

## Example Output

```
Generating tests for src/pipeline/message-queue.ts...

Created: src/pipeline/message-queue.test.ts
- 8 test cases
- 3 describe blocks
- Mocks: none required

Tests:
  MessageQueue
    push
      should add message to queue
      should handle empty message
    flush
      should return all messages
      should clear queue after flush
    peek
      should return messages without clearing
      should return empty array for empty queue
    size
      should return correct count
      should return 0 for empty queue

Run: pnpm test message-queue
```
