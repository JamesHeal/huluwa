import { WebSocketServer, WebSocket as WS } from 'ws';
import type { Duplex } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import type { Logger } from '../../logger/logger.js';
import type { ServerEvent, ClientEvent, Channel } from './types.js';

interface Client {
  id: string;
  ws: WS;
  subscriptions: Set<Channel>;
}

export class WebUIWebSocketServer {
  private readonly wss: WebSocketServer;
  private readonly clients = new Map<string, Client>();
  private readonly logger: Logger;
  private clientIdCounter = 0;

  constructor(logger: Logger) {
    this.logger = logger.child('WebSocket');
    this.wss = new WebSocketServer({ noServer: true });
    this.setupConnectionHandler();
  }

  /**
   * Handle HTTP upgrade request for WebSocket
   */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, wsPath: string): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    if (url.pathname !== wsPath) {
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
    });
  }

  /**
   * Broadcast event to all subscribed clients
   */
  broadcast(channel: Channel, event: ServerEvent): void {
    const message = JSON.stringify(event);

    for (const client of this.clients.values()) {
      if (client.subscriptions.has(channel) && client.ws.readyState === WS.OPEN) {
        try {
          client.ws.send(message);
        } catch (error) {
          this.logger.error('Failed to send message to client', {
            clientId: client.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * Broadcast event to all connected clients (regardless of subscription)
   */
  broadcastAll(event: ServerEvent): void {
    const message = JSON.stringify(event);

    for (const client of this.clients.values()) {
      if (client.ws.readyState === WS.OPEN) {
        try {
          client.ws.send(message);
        } catch (error) {
          this.logger.error('Failed to send message to client', {
            clientId: client.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Close all connections and shutdown
   */
  close(): void {
    for (const client of this.clients.values()) {
      client.ws.close(1000, 'Server shutting down');
    }
    this.clients.clear();
    this.wss.close();
    this.logger.info('WebSocket server closed');
  }

  private setupConnectionHandler(): void {
    this.wss.on('connection', (ws, req) => {
      const clientId = `client-${++this.clientIdCounter}`;
      const client: Client = {
        id: clientId,
        ws,
        subscriptions: new Set(['logs', 'metrics']), // Default subscriptions
      };

      this.clients.set(clientId, client);

      const clientIp = req.socket.remoteAddress ?? 'unknown';
      this.logger.info('Client connected', { clientId, ip: clientIp });

      // Send connection event
      this.send(ws, {
        type: 'connection',
        data: {
          status: 'connected',
          clientId,
          timestamp: Date.now(),
        },
      });

      ws.on('message', (data) => {
        this.handleMessage(client, data);
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        this.logger.info('Client disconnected', { clientId });
      });

      ws.on('error', (error) => {
        this.logger.error('WebSocket error', {
          clientId,
          error: error.message,
        });
      });
    });
  }

  private handleMessage(client: Client, data: WS.RawData): void {
    try {
      const message = JSON.parse(data.toString()) as ClientEvent;

      switch (message.type) {
        case 'subscribe':
          for (const channel of message.channels) {
            client.subscriptions.add(channel);
          }
          this.logger.debug('Client subscribed', {
            clientId: client.id,
            channels: message.channels,
          });
          break;

        case 'unsubscribe':
          for (const channel of message.channels) {
            client.subscriptions.delete(channel);
          }
          this.logger.debug('Client unsubscribed', {
            clientId: client.id,
            channels: message.channels,
          });
          break;

        case 'ping':
          this.send(client.ws, {
            type: 'connection',
            data: {
              status: 'connected',
              clientId: client.id,
              timestamp: Date.now(),
            },
          });
          break;

        default:
          this.logger.warn('Unknown message type', { message });
      }
    } catch (error) {
      this.logger.error('Failed to parse message', {
        clientId: client.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private send(ws: WS, event: ServerEvent): void {
    if (ws.readyState === WS.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }
}
