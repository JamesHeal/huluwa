// OneBot 11 协议类型定义

export interface OneBotSender {
  user_id: number;
  nickname: string;
  card?: string;
  sex?: 'male' | 'female' | 'unknown';
  age?: number;
  role?: 'owner' | 'admin' | 'member';
}

export interface OneBotMessage {
  message_type: 'private' | 'group';
  sub_type: string;
  message_id: number;
  user_id: number;
  group_id?: number;
  message: string | OneBotMessageSegment[];
  raw_message: string;
  font: number;
  sender: OneBotSender;
  time: number;
  self_id: number;
  post_type: 'message' | 'notice' | 'request' | 'meta_event';
}

export interface OneBotMessageSegment {
  type: string;
  data: Record<string, unknown>;
}

export interface OneBotEvent {
  time: number;
  self_id: number;
  post_type: 'message' | 'notice' | 'request' | 'meta_event';
  message_type?: 'private' | 'group';
  sub_type?: string;
  message_id?: number;
  user_id?: number;
  group_id?: number;
  message?: string | OneBotMessageSegment[];
  raw_message?: string;
  sender?: OneBotSender;
}

export interface OneBotApiResponse<T = unknown> {
  status: 'ok' | 'async' | 'failed';
  retcode: number;
  data: T;
  message?: string;
  wording?: string;
}

export interface OneBotSendMessageResponse {
  message_id: number;
}

export interface OneBotLoginInfo {
  user_id: number;
  nickname: string;
}

export interface OneBotGroupInfo {
  group_id: number;
  group_name: string;
  member_count: number;
  max_member_count: number;
}

// 多媒体附件类型

export type AttachmentType = 'image' | 'file' | 'audio' | 'video';

export interface Attachment {
  type: AttachmentType;
  filename: string;
  url: string;
  mimeType: string;
  /** 下载后填充，base64 编码的文件内容 */
  base64Data?: string;
}
