import type { OneBotEvent, OneBotMessageSegment, Attachment, AttachmentType } from './types.js';

export interface NormalizedMessage {
  messageId: number;
  messageType: 'private' | 'group';
  text: string;
  userId: number;
  groupId: number | undefined;
  nickname: string;
  timestamp: Date;
  isGroup: boolean;
  attachments: Attachment[];
}

/** OneBot 段类型到附件类型的映射 */
const SEGMENT_TYPE_MAP: Record<string, AttachmentType> = {
  image: 'image',
  record: 'audio',
  video: 'video',
  file: 'file',
};

/** 扩展名到 MIME 类型的映射 */
const MIME_MAP: Record<string, string> = {
  // 图片
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  // 文档
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  xml: 'text/xml',
  html: 'text/html',
  js: 'text/javascript',
  ts: 'text/typescript',
  py: 'text/x-python',
  java: 'text/x-java',
  c: 'text/x-c',
  cpp: 'text/x-c++',
  h: 'text/x-c',
  go: 'text/x-go',
  rs: 'text/x-rust',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  toml: 'text/toml',
  ini: 'text/plain',
  cfg: 'text/plain',
  log: 'text/plain',
  sh: 'text/x-shellscript',
  // 音频
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  amr: 'audio/amr',
  silk: 'audio/silk',
  // 视频
  mp4: 'video/mp4',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
};

/** 根据文件名推断 MIME 类型 */
export function guessMimeType(filename: string, attachmentType: AttachmentType): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (MIME_MAP[ext]) {
    return MIME_MAP[ext]!;
  }

  // 按附件类型给默认值
  switch (attachmentType) {
    case 'image':
      return 'image/jpeg';
    case 'audio':
      return 'audio/mpeg';
    case 'video':
      return 'video/mp4';
    case 'file':
      return 'application/octet-stream';
  }
}

interface ExtractedContent {
  text: string;
  attachments: Attachment[];
}

function extractContent(message: string | OneBotMessageSegment[]): ExtractedContent {
  if (typeof message === 'string') {
    return { text: message, attachments: [] };
  }

  const textParts: string[] = [];
  const attachments: Attachment[] = [];

  for (const seg of message) {
    if (seg.type === 'text') {
      textParts.push(String(seg.data['text'] ?? ''));
      continue;
    }

    const attachmentType = SEGMENT_TYPE_MAP[seg.type];
    if (!attachmentType) {
      continue;
    }

    const url = String(seg.data['url'] ?? seg.data['file'] ?? '');
    if (!url) {
      continue;
    }

    const filename = String(
      seg.data['file_name'] ?? seg.data['filename'] ?? seg.data['file'] ?? `${seg.type}.bin`
    );
    const mimeType = guessMimeType(filename, attachmentType);

    attachments.push({
      type: attachmentType,
      filename,
      url,
      mimeType,
    });
  }

  return {
    text: textParts.join(''),
    attachments,
  };
}

export function normalizeMessage(event: OneBotEvent): NormalizedMessage | null {
  if (event.post_type !== 'message') {
    return null;
  }

  if (!event.message_type || !event.message_id || !event.user_id) {
    return null;
  }

  const { text, attachments } = extractContent(event.message ?? '');

  return {
    messageId: event.message_id,
    messageType: event.message_type,
    text,
    userId: event.user_id,
    groupId: event.group_id,
    nickname: event.sender?.nickname ?? '',
    timestamp: new Date(event.time * 1000),
    isGroup: event.message_type === 'group',
    attachments,
  };
}
