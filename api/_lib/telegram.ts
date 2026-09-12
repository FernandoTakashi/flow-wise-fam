// Adaptador fino do canal. Hoje só Telegram; a interface `sendMessage` é o
// ponto de extensão para o WhatsApp Cloud API mais tarde.
import { env } from './env.js';

const API = (method: string) => `https://api.telegram.org/bot${env.telegramToken()}/${method}`;

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}
export interface TgPhotoSize {
  file_id: string;
  file_size?: number;
  width: number;
  height: number;
}
export interface TgMessage {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  chat: { id: number; type: string };
  text?: string;
  photo?: TgPhotoSize[];
  caption?: string;
}
export interface TgCallbackQuery {
  id: string;
  from: { id: number; first_name?: string };
  message?: TgMessage;
  data?: string;
}

async function call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(API(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? res.status}`);
  return json.result as T;
}

export function sendMessage(
  chatId: number | string,
  text: string,
  buttons?: InlineButton[][],
): Promise<TgMessage> {
  return call<TgMessage>('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export function answerCallback(id: string, text?: string): Promise<unknown> {
  return call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) });
}

/** Remove os botões de uma mensagem já enviada (após o usuário decidir). */
export function clearButtons(chatId: number | string, messageId: number): Promise<unknown> {
  return call('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
}

export function setMyCommands(commands: { command: string; description: string }[]): Promise<unknown> {
  return call('setMyCommands', { commands });
}

export function setWebhook(url: string, secret?: string): Promise<unknown> {
  return call('setWebhook', {
    url,
    ...(secret ? { secret_token: secret } : {}),
    allowed_updates: ['message', 'callback_query'],
  });
}

export function getMe(): Promise<{ id: number; username?: string }> {
  return call('getMe', {});
}

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

/** Baixa uma foto enviada pelo usuário (maior resolução) e devolve em base64 + o media type. */
export async function downloadPhoto(fileId: string): Promise<{ base64: string; mediaType: ImageMediaType }> {
  const file = await call<{ file_path?: string }>('getFile', { file_id: fileId });
  if (!file.file_path) throw new Error('Telegram não devolveu o arquivo.');
  const url = `https://api.telegram.org/file/bot${env.telegramToken()}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar a foto (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = file.file_path.split('.').pop()?.toLowerCase();
  const mediaType: ImageMediaType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return { base64: buf.toString('base64'), mediaType };
}
