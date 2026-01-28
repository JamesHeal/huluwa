export class OneBotError extends Error {
  public readonly retcode: number | undefined;

  constructor(
    message: string,
    retcode?: number,
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = 'OneBotError';
    this.retcode = retcode;
  }
}

export class OneBotConnectionError extends OneBotError {
  constructor(message: string, cause?: unknown) {
    super(message, undefined, cause);
    this.name = 'OneBotConnectionError';
  }
}

export class OneBotApiError extends OneBotError {
  constructor(message: string, retcode: number, cause?: unknown) {
    super(message, retcode, cause);
    this.name = 'OneBotApiError';
  }
}
