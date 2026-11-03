/**
 * 宛先ごとのメール組み立て（プレビュー・テスト配信・本配信で共通）
 * - 冒頭の宛名（{{会社名}} {{担当者名}} 様）
 * - フッター（発行者情報＋配信停止リンク）はAIの本文に頼らず必ずここで差し込む（特定電子メール法）
 * - List-Unsubscribe ヘッダー（Gmail・Yahooのワンクリック停止）
 */
import * as cheerio from 'cheerio'
import { unsubscribeUrls } from './token'

export interface RenderCampaign {
  id: number
  subject: string
  preheader: string | null
  greeting: boolean
  html_snapshot: string
}

export interface RenderSettings {
  from_name: string
  from_email: string | null
  reply_to: string | null
  footer_html: string | null
}

export interface RenderRecipient {
  deliveryId: number // 0 = テスト・プレビュー（停止しても何も起きない）
  email: string
  comp_name: string | null
  tanto_name: string | null
}

export const DEFAULT_FOOTER_HTML = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;border-top:1px solid #dddddd;">
<tr><td style="padding:20px 16px;font-family:'Hiragino Sans','Meiryo',sans-serif;font-size:12px;line-height:1.8;color:#666666;text-align:center;">
本メールは容器なびでメールマガジンの受信を希望された会員様にお送りしています。<br>
発行: テンドール物流株式会社（容器なび）<br>
〒000-0000 （住所は確認中）<br>
お問い合わせ: （確認中）<br>
<a href="{{UNSUBSCRIBE_URL}}" style="color:#666666;">メールマガジンの配信停止はこちら</a>
</td></tr></table>`

/** 目印がないHTML用: 本文の上に独立した行として置く */
const GREETING_BLOCK = (inner: string) => `<table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;margin:0 auto;"><tr>
<td style="padding:16px;font-family:'Hiragino Sans','Meiryo',sans-serif;font-size:14px;line-height:1.7;color:#333333;">${inner}</td></tr></table>`

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function fromAddress(settings: RenderSettings): string {
  const email = settings.from_email || process.env.MAIL_FROM_EMAIL
  if (!email) throw new Error('差出人アドレスが未設定です（配信設定で設定してください）')
  return `${settings.from_name} <${email}>`
}

/**
 * 宛名を入れる。メルマガビルダーのHTMLには <!-- GREETING -->（あいさつ文の行）があるので、
 * その最初の段落の先頭に入れる（ロゴより上に出ないように）。目印がなければ本文の上に独立した行で置く
 */
function insertGreeting(html: string, inner: string): string {
  const mark = html.indexOf('<!-- GREETING -->')
  if (mark >= 0) {
    const p = html.slice(mark, mark + 2000).search(/<p[\s>]/i)
    if (p >= 0) {
      const end = html.indexOf('>', mark + p)
      return html.slice(0, end + 1) + inner + '<br><br>' + html.slice(end + 1)
    }
  }
  return wrapBody(html, GREETING_BLOCK(inner), '')
}

/** <body> の直後と </body> の直前に差し込む（なければ先頭・末尾） */
function wrapBody(html: string, top: string, bottom: string): string {
  let out = html
  const open = out.match(/<body[^>]*>/i)
  out = open ? out.replace(open[0], open[0] + top) : top + out
  const closeIdx = out.toLowerCase().lastIndexOf('</body>')
  return closeIdx >= 0 ? out.slice(0, closeIdx) + bottom + out.slice(closeIdx) : out + bottom
}

/** HTMLからテキスト版を作る（リンクURLは残す） */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html)
  $('style, script, head').remove()
  $('a').each((_, el) => {
    const a = $(el)
    const href = a.attr('href')
    const label = a.text().trim()
    if (href && /^https?:/.test(href)) a.replaceWith(label && label !== href ? `${label}（${href}）` : href)
  })
  $('br').replaceWith('\n')
  $('p, div, tr, h1, h2, h3, h4, li, table').each((_, el) => { $(el).append('\n') })
  return $('body').text()
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function renderForRecipient(
  campaign: RenderCampaign,
  settings: RenderSettings,
  r: RenderRecipient,
  opts: { test?: boolean } = {},
) {
  const urls = unsubscribeUrls(r.deliveryId)
  const company = r.comp_name?.trim() || ''
  const person = r.tanto_name?.trim() || 'ご担当者'

  const preheader = campaign.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(campaign.preheader)}</div>`
    : ''
  const footer = (settings.footer_html || DEFAULT_FOOTER_HTML)
  const greetingInner = [company && escapeHtml(company), `${escapeHtml(person)} 様`].filter(Boolean).join('<br>')
  let html = campaign.greeting ? insertGreeting(campaign.html_snapshot, greetingInner) : campaign.html_snapshot
  html = wrapBody(html, preheader, footer)

  html = html
    .replaceAll('{{会社名}}', escapeHtml(company))
    .replaceAll('{{担当者名}}', escapeHtml(person))
    .replaceAll('{{UNSUBSCRIBE_URL}}', urls.page)

  const subject = (opts.test ? '[テスト] ' : '') + campaign.subject
    .replaceAll('{{会社名}}', company)
    .replaceAll('{{担当者名}}', person)

  return {
    from: fromAddress(settings),
    to: [r.email],
    subject,
    html,
    text: htmlToText(html),
    ...(settings.reply_to ? { replyTo: settings.reply_to } : {}),
    headers: {
      'List-Unsubscribe': `<${urls.oneClick}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [
      { name: 'campaign_id', value: String(campaign.id) },
      { name: 'delivery_id', value: String(r.deliveryId) },
    ],
  }
}
