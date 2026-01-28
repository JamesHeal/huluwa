import * as fs from 'node:fs';
import * as path from 'node:path';

export interface FileTransportOptions {
  directory: string;
  filename?: string;
}

export class FileTransport {
  private stream: fs.WriteStream | null = null;
  private readonly directory: string;
  private readonly filename: string;

  constructor(options: FileTransportOptions) {
    this.directory = path.resolve(options.directory);
    this.filename = options.filename ?? this.generateFilename();
    this.ensureDirectory();
    this.openStream();
  }

  private generateFilename(): string {
    const date = new Date().toISOString().split('T')[0];
    return `app-${date}.log`;
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.directory)) {
      fs.mkdirSync(this.directory, { recursive: true });
    }
  }

  private openStream(): void {
    const filepath = path.join(this.directory, this.filename);
    this.stream = fs.createWriteStream(filepath, { flags: 'a' });
  }

  write(message: string): void {
    if (this.stream) {
      this.stream.write(message + '\n');
    }
  }

  close(): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }
}
