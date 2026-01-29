---
name: onebot-debug
description: Debug OneBot protocol interactions and message handling. Use when troubleshooting message delivery, webhook issues, or protocol parsing. Triggers on OneBot errors, message issues, protocol debugging.
---

# OneBot Debug Skill

Debug OneBot protocol interactions and message handling issues.

## Common Issues

### Webhook Not Receiving Messages

1. Check server is running:
```bash
curl http://localhost:3001/health
```

2. Verify webhook path in config:
```json5
{
  onebot: {
    webhookPath: "/onebot"
  }
}
```

3. Check OneBot client is configured to send to correct URL

### Message Not Triggering Bot

Check `@mention` detection in `message-normalizer.ts`:

```typescript
// Debug log to see what's being parsed
logger.debug('Normalized message', {
  raw: rawMessage,
  normalized: result,
  isMentionBot: result.isMentionBot
})
```

Common issues:
- Bot ID not configured correctly in config
- @mention parsing regex not matching format
- Message type not handled

### Response Not Sending

1. Check OneBot client connection:
```typescript
// Add to onebot/client.ts
logger.debug('Sending message', { targetId, content })
```

2. Verify target configuration:
```json5
{
  target: {
    type: "group",  // or "private"
    id: 123456789
  }
}
```

## Debug Commands

### Test Webhook Locally

```bash
# Simulate OneBot message
curl -X POST http://localhost:3001/onebot \
  -H "Content-Type: application/json" \
  -d '{
    "post_type": "message",
    "message_type": "group",
    "group_id": 123456789,
    "user_id": 987654321,
    "message": [
      {"type": "at", "data": {"qq": "bot_id"}},
      {"type": "text", "data": {"text": "Hello bot"}}
    ],
    "sender": {
      "user_id": 987654321,
      "nickname": "Test User"
    }
  }'
```

### Check Message Queue

```typescript
// Add to pipeline for debugging
import { messageQueue } from './pipeline/index.js'

logger.debug('Queue state', {
  size: messageQueue.size,
  messages: messageQueue.peek()
})
```

### Trace Message Flow

Add logging points:

```
1. Webhook receives      → onebot/webhook.ts
2. Message normalized    → onebot/message-normalizer.ts
3. Queue updated         → pipeline/message-queue.ts
4. @mention detected     → pipeline/message-queue.ts
5. Aggregated            → pipeline/message-aggregator.ts
6. Agent invoked         → agent/graph.ts
7. Response generated    → agent/nodes/chat-executor.ts
8. Sent via client       → onebot/client.ts
```

## OneBot Protocol Reference

### Message Types

```typescript
interface OneBotMessage {
  post_type: 'message' | 'notice' | 'request' | 'meta_event'
  message_type: 'private' | 'group'
  sub_type: 'friend' | 'normal' | 'anonymous' | 'group_self'
  message_id: number
  user_id: number
  message: OneBotSegment[]
  raw_message: string
  sender: OneBotSender
}
```

### Message Segments

```typescript
type OneBotSegment =
  | { type: 'text', data: { text: string } }
  | { type: 'at', data: { qq: string } }
  | { type: 'image', data: { file: string, url?: string } }
  | { type: 'face', data: { id: number } }
  | { type: 'reply', data: { id: number } }
```

### Sending Messages

```typescript
// Text message
await client.sendGroupMessage(groupId, [
  { type: 'text', data: { text: 'Hello!' } }
])

// With @mention
await client.sendGroupMessage(groupId, [
  { type: 'at', data: { qq: userId } },
  { type: 'text', data: { text: ' Here is your answer' } }
])
```

## Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| 100 | Missing access token | Check OneBot server config |
| 102 | Invalid access token | Verify token in config |
| 103 | Missing API call | Check endpoint exists |
| 104 | Invalid API call | Verify request format |
| 1400 | Invalid parameter | Check message format |
| 1404 | API not available | OneBot server issue |

## Configuration Debugging

### Validate Config

```typescript
import { configSchema } from './config/schema.js'

const result = configSchema.safeParse(config)
if (!result.success) {
  console.error('Config errors:', result.error.issues)
}
```

### Required Config Fields

```json5
{
  target: {
    type: "group",        // Required: "group" or "private"
    id: 123456789         // Required: target chat ID
  },
  onebot: {
    httpUrl: "http://localhost:3000",  // OneBot server URL
    webhookPath: "/onebot",            // Webhook endpoint
    accessToken: "${ONEBOT_TOKEN}"     // Optional: access token
  }
}
```

## Logging for Debug

Set log level to debug:

```bash
LOG_LEVEL=debug pnpm dev
```

Or in config:
```json5
{
  logging: {
    level: "debug"
  }
}
```

## Health Check

Add health endpoint for monitoring:

```typescript
// In server/server.ts
if (path === '/health') {
  return new Response(JSON.stringify({
    status: 'ok',
    uptime: process.uptime(),
    queueSize: messageQueue.size,
    lastMessage: lastMessageTimestamp
  }), { status: 200 })
}
```
