import * as http from 'node:http';
import type { Logger } from '../logger/logger.js';
import type { ServerConfig } from '../config/schema.js';

export type RouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: string
) => Promise<void>;

export class HttpServer {
  private server: http.Server | null = null;
  private readonly routes: Map<string, RouteHandler> = new Map();
  private readonly logger: Logger;
  private readonly config: ServerConfig;

  constructor(config: ServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child('HttpServer');
  }

  addRoute(path: string, handler: RouteHandler): void {
    this.routes.set(path, handler);
    this.logger.debug('Route registered', { path });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        await this.handleRequest(req, res);
      });

      this.server.on('error', (error) => {
        this.logger.error('Server error', { error: error.message });
        reject(error);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        this.logger.info('Server listening', {
          host: this.config.host,
          port: this.config.port,
        });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close(() => {
        this.logger.info('Server stopped');
        this.server = null;
        resolve();
      });
    });
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const path = url.pathname;

    this.logger.debug('Request received', { method: req.method, path });

    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    const handler = this.routes.get(path);
    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    try {
      const body = await this.readBody(req);
      await handler(req, res, body);
    } catch (error) {
      this.logger.error('Request handler error', {
        path,
        error: error instanceof Error ? error.message : String(error),
      });

      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      req.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });

      req.on('error', reject);
    });
  }
}
