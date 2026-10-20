/**
 * Chatwork API v2 クライアント（SFA専用のシステムアカウントのトークンで動かす）
 *   CHATWORK_API_TOKEN       : システムアカウントのAPIトークン
 *   CHATWORK_QUOTE_ROOM_ID   : 見積書専用ルーム
 *   CHATWORK_WEBHOOK_TOKEN   : Webhook設定画面のトークン（署名検証用）
 *   SFA_NOTIFY_TEST_MODE=1   : テスト運用中。テンドール・外部営業向けの通知もすべて見積書ルームに送る
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const BASE = 'https://api.chatwork.com/v2'

export function chatworkConfigured(): boolean {
  return !!process.env.CHATWORK_API_TOKEN
}

export const quoteRoomId = () => process.env.CHATWORK_QUOTE_ROOM_ID || ''

/** テスト運用中は所属・個別の通知ルームを使わず、見積書ルームに集約する */
export const notifyTestMode = () => process.env.SFA_NOTIFY_TEST_MODE === '1'

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.CHATWORK_API_TOKEN
  if (!token) throw new Error('CHATWORK_API_TOKEN が未設定です')
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'X-ChatWorkToken': token, ...(init.headers || {}) },
  })
  if (res.status === 204) return [] as T
  const text = await res.text()
  if (!res.ok) throw new Error(`Chatwork API ${res.status}: ${text.slice(0, 200)}`)
  return (text ? JSON.parse(text) : {}) as T
}

export async function postMessage(roomId: string, body: string): Promise<string> {
  const r = await call<{ message_id: string }>(`/rooms/${roomId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ body, self_unread: '0' }),
  })
  return r.message_id
}

export async function uploadFile(roomId: string, file: { buffer: Buffer; file_name: string; mime_type: string }, message: string): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mime_type }), file.file_name)
  form.append('message', message)
  const r = await call<{ file_id: number }>(`/rooms/${roomId}/files`, { method: 'POST', body: form })
  return String(r.file_id)
}

export interface CwFile {
  file_id: number
  account: { account_id: number; name: string }
  message_id: string
  filename: string
  filesize: number
  upload_time: number
  download_url?: string
}

export async function listFiles(roomId: string): Promise<CwFile[]> {
  return call<CwFile[]>(`/rooms/${roomId}/files`)
}

export async function getFile(roomId: string, fileId: string | number): Promise<CwFile> {
  return call<CwFile>(`/rooms/${roomId}/files/${fileId}?create_download_url=1`)
}

export async function downloadFile(roomId: string, fileId: string | number): Promise<{ meta: CwFile; buffer: Buffer }> {
  const meta = await getFile(roomId, fileId)
  if (!meta.download_url) throw new Error('ダウンロードURLを取得できませんでした')
  const res = await fetch(meta.download_url)
  if (!res.ok) throw new Error(`ファイル取得に失敗しました: ${res.status}`)
  return { meta, buffer: Buffer.from(await res.arrayBuffer()) }
}

export interface CwMessage {
  message_id: string
  account: { account_id: number; name: string }
  body: string
  send_time: number
}

export async function getMessage(roomId: string, messageId: string): Promise<CwMessage> {
  return call<CwMessage>(`/rooms/${roomId}/messages/${messageId}`)
}

export async function listRoomMembers(roomId: string): Promise<Array<{ account_id: number; name: string; role: string }>> {
  return call(`/rooms/${roomId}/members`)
}

export async function me(): Promise<{ account_id: number; name: string }> {
  return call('/me')
}

/** メッセージ本文からファイルIDを抜く（[download:12345]ファイル名[/download]） */
export function fileIdsInBody(body: string): string[] {
  return [...body.matchAll(/\[download:(\d+)\]/g)].map((m) => m[1])
}

/** Webhookの署名検証: base64(HMAC-SHA256(body, base64decode(token))) */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const token = process.env.CHATWORK_WEBHOOK_TOKEN
  if (!token || !signature) return false
  const expected = createHmac('sha256', Buffer.from(token, 'base64')).update(rawBody).digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** 宛先・返信タグ */
export const to = (accountId: string | number | null | undefined, name?: string) =>
  accountId ? `[To:${accountId}]${name ? `${name}さん` : ''}\n` : ''
export const reply = (accountId: string | number, roomId: string, messageId: string) =>
  `[rp aid=${accountId} to=${roomId}-${messageId}]`
