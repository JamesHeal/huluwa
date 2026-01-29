import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Duplex } from 'node:stream';
import type { Logger } from '../logger/logger.js';
import type { ServerConfig } from '../config/schema.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';

export interface RequestContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  body: string;
  params: Record<string, string>;
  query: URLSearchParams;
  path: string;
  method: HttpMethod;
}

export type RouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: string
) => Promise<void>;

export type EnhancedRouteHandler = (ctx: RequestContext) => Promise<void>;

export type UpgradeHandler = (
  req: http.IncomingMessage,
  socket: Duplex,
  head: Buffer
) => void;

interface Route {
  method: HttpMethod | '*';
  pattern: RegExp;
  paramNames: string[];
  handler: EnhancedRouteHandler;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

export class HttpServer {
  private server: http.Server | null = null;
  private readonly routes: Map<string, RouteHandler> = new Map();
  private readonly enhancedRoutes: Route[] = [];
  private readonly logger: Logger;
  private readonly config: ServerConfig;
  private upgradeHandler: UpgradeHandler | null = null;
  private staticDir: string | null = null;
  private staticBasePath: string = '/';

  constructor(config: ServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child('HttpServer');
  }

  /**
   * Legacy route registration (path-only matching)
   */
  addRoute(path: string, handler: RouteHandler): void {
    this.routes.set(path, handler);
    this.logger.debug('Route registered', { path });
  }

  /**
   * Enhanced route registration with method and path parameters
   * Path can include parameters like /api/users/:id
   */
  route(method: HttpMethod | '*', pathPattern: string, handler: EnhancedRouteHandler): void {
    const { pattern, paramNames } = this.compilePath(pathPattern);
    this.enhancedRoutes.push({ method, pattern, paramNames, handler });
    this.logger.debug('Enhanced route registered', { method, path: pathPattern });
  }

  /**
   * Shorthand methods for common HTTP methods
   */
  get(path: string, handler: EnhancedRouteHandler): void {
    this.route('GET', path, handler);
  }

  post(path: string, handler: EnhancedRouteHandler): void {
    this.route('POST', path, handler);
  }

  /**
   * Configure static file serving
   */
  serveStatic(basePath: string, directory: string): void {
    this.staticBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    this.staticDir = path.resolve(directory);
    this.logger.debug('Static file serving configured', { basePath, directory: this.staticDir });
  }

  /**
   * Set WebSocket upgrade handler
   */
  onUpgrade(handler: UpgradeHandler): void {
    this.upgradeHandler = handler;
    this.logger.debug('WebSocket upgrade handler registered');
  }

  /**
   * Get the underlying HTTP server instance
   */
  getServer(): http.Server | null {
    return this.server;
  }

  private compilePath(pathPattern: string): { pattern: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];
    const patternStr = pathPattern
      .replace(/:([^/]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      })
      .replace(/\//g, '\\/');
    return {
      pattern: new RegExp(`^${patternStr}$`),
      paramNames,
    };
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        await this.handleRequest(req, res);
      });

      // Handle WebSocket upgrades
      if (this.upgradeHandler) {
        this.server.on('upgrade', (req, socket, head) => {
          this.upgradeHandler?.(req, socket, head);
        });
      }

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
    const reqPath = url.pathname;
    const method = (req.method?.toUpperCase() ?? 'GET') as HttpMethod;

    this.logger.debug('Request received', { method, path: reqPath });

    // Health check endpoint
    if (reqPath === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // Try enhanced routes first
    for (const route of this.enhancedRoutes) {
      if (route.method !== '*' && route.method !== method) {
        continue;
      }

      const match = route.pattern.exec(reqPath);
      if (match) {
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => {
          const value = match[i + 1];
          if (value !== undefined) {
            params[name] = decodeURIComponent(value);
          }
        });

        try {
          const body = await this.readBody(req);
          const ctx: RequestContext = {
            req,
            res,
            body,
            params,
            query: url.searchParams,
            path: reqPath,
            method,
          };
          await route.handler(ctx);
          return;
        } catch (error) {
          this.logger.error('Enhanced route handler error', {
            path: reqPath,
            error: error instanceof Error ? error.message : String(error),
          });
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
          return;
        }
      }
    }

    // Try static file serving
    if (this.staticDir && reqPath.startsWith(this.staticBasePath)) {
      const handled = await this.serveStaticFile(req, res, reqPath);
      if (handled) return;
    }

    // Try legacy routes
    const handler = this.routes.get(reqPath);
    if (handler) {
      try {
        const body = await this.readBody(req);
        await handler(req, res, body);
        return;
      } catch (error) {
        this.logger.error('Request handler error', {
          path: reqPath,
          error: error instanceof Error ? error.message : String(error),
        });

        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
        return;
      }
    }

    // 404 Not Found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private async serveStaticFile(
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    reqPath: string
  ): Promise<boolean> {
    if (!this.staticDir) return false;

    // Remove base path prefix
    let filePath = reqPath.slice(this.staticBasePath.length);
    if (!filePath || filePath === '/') {
      filePath = '/index.html';
    }

    const fullPath = path.join(this.staticDir, filePath);

    // Security: prevent directory traversal
    if (!fullPath.startsWith(this.staticDir)) {
      return false;
    }

    try {
      const stat = await fs.promises.stat(fullPath);
      if (stat.isDirectory()) {
        // Try index.html for directories
        const indexPath = path.join(fullPath, 'index.html');
        try {
          await fs.promises.access(indexPath);
          return this.sendFile(res, indexPath);
        } catch {
          return false;
        }
      }
      return this.sendFile(res, fullPath);
    } catch {
      // For SPA, serve index.html for non-existent paths
      if (this.staticDir) {
        const indexPath = path.join(this.staticDir, 'index.html');
        try {
          await fs.promises.access(indexPath);
          return this.sendFile(res, indexPath);
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  private async sendFile(res: http.ServerResponse, filePath: string): Promise<boolean> {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      const content = await fs.promises.readFile(filePath);

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
      return true;
    } catch {
      return false;
    }
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];

      req.on('data', (chunk: Uint8Array) => {
        chunks.push(chunk);
      });

      req.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });

      req.on('error', reject);
    });
  }
}

/**
 * Helper function to send JSON response
 */
export function json(res: http.ServerResponse, data: unknown, status: number = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
