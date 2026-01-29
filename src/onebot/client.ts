import type { Logger } from '../logger/logger.js';
import { OneBotConnectionError, OneBotApiError } from './errors.js';
import type {
  OneBotApiResponse,
  OneBotSendMessageResponse,
  OneBotLoginInfo,
  OneBotGroupInfo,
  Attachment,
} from './types.js';

export interface OneBotClientConfig {
  httpUrl: string;
  accessToken?: string | undefined;
}

export class OneBotClient {
  private readonly httpUrl: string;
  private readonly accessToken: string | undefined;
  private readonly logger: Logger;

  constructor(config: OneBotClientConfig, logger: Logger) {
    this.httpUrl = config.httpUrl.replace(/\/$/, '');
    this.accessToken = config.accessToken;
    this.logger = logger.child('OneBotClient');
  }

  private async request<T>(
    action: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const url = `${this.httpUrl}/${action}`;

    this.logger.debug(`POST ${action}`, params);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });

      const json = (await response.json()) as OneBotApiResponse<T>;

      if (json.status === 'failed') {
        throw new OneBotApiError(
          json.message ?? json.wording ?? `API failed with retcode ${json.retcode}`,
          json.retcode
        );
      }

      return json.data;
    } catch (error) {
      if (error instanceof OneBotApiError) {
        throw error;
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new OneBotConnectionError(
          `Failed to connect to OneBot at ${this.httpUrl}`,
          error
        );
      }

      throw new OneBotConnectionError(
        `Request to OneBot failed: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  async getLoginInfo(): Promise<OneBotLoginInfo> {
    this.logger.debug('Getting login info');
    const result = await this.request<OneBotLoginInfo>('get_login_info');
    this.logger.info('OneBot connected', { userId: result.user_id, nickname: result.nickname });
    return result;
  }

  async sendPrivateMsg(userId: number, message: string): Promise<number> {
    this.logger.debug('Sending private message', { userId, messageLength: message.length });

    const result = await this.request<OneBotSendMessageResponse>('send_private_msg', {
      user_id: userId,
      message,
    });

    this.logger.info('Private message sent', { messageId: result.message_id });
    return result.message_id;
  }

  async sendGroupMsg(groupId: number, message: string): Promise<number> {
    this.logger.debug('Sending group message', { groupId, messageLength: message.length });

    const result = await this.request<OneBotSendMessageResponse>('send_group_msg', {
      group_id: groupId,
      message,
    });

    this.logger.info('Group message sent', { messageId: result.message_id });
    return result.message_id;
  }

  async sendMsg(
    messageType: 'private' | 'group',
    targetId: number,
    message: string
  ): Promise<number> {
    if (messageType === 'private') {
      return this.sendPrivateMsg(targetId, message);
    } else {
      return this.sendGroupMsg(targetId, message);
    }
  }

  async getGroupInfo(groupId: number): Promise<OneBotGroupInfo> {
    this.logger.debug('Getting group info', { groupId });
    const result = await this.request<OneBotGroupInfo>('get_group_info', {
      group_id: groupId,
    });
    return result;
  }

  /**
   * 通过 HTTP 下载文件并返回 base64 编码数据
   */
  async downloadFile(url: string): Promise<string> {
    this.logger.debug('Downloading file', { url: url.substring(0, 100) });

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      this.logger.debug('File downloaded', { url: url.substring(0, 100), size: buffer.byteLength });
      return base64;
    } catch (error) {
      throw new OneBotConnectionError(
        `Failed to download file from ${url.substring(0, 100)}: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * 并发下载多个附件，失败不阻塞其他下载
   *
   * 就地修改附件对象的 base64Data 字段
   */
  async downloadAttachments(attachments: Attachment[]): Promise<void> {
    if (attachments.length === 0) {
      return;
    }

    this.logger.info('Downloading attachments', { count: attachments.length });

    const results = await Promise.allSettled(
      attachments.map(async (attachment) => {
        try {
          attachment.base64Data = await this.downloadFile(attachment.url);
        } catch (error) {
          this.logger.warn('Failed to download attachment', {
            filename: attachment.filename,
            type: attachment.type,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    this.logger.info('Attachments download complete', {
      total: attachments.length,
      succeeded,
      failed: attachments.length - succeeded,
    });
  }
}
