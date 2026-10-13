import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'
import { S3_PATHS } from './constants'
import type { ImageType } from '@/types'

// R2_ENDPOINT が設定されていれば Cloudflare R2、なければ従来の AWS S3 に接続する
const useR2 = !!process.env.R2_ENDPOINT

const s3Client = new S3Client(
  useR2
    ? {
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      }
    : {
        region: process.env.AWS_REGION || 'ap-northeast-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      }
)

const BUCKET_NAME = useR2
  ? process.env.R2_BUCKET_NAME || 'yokinavi-mailmag-assets'
  : process.env.S3_BUCKET_NAME || 'yokinavi-mailmag-assets'

function getS3Path(imageType: ImageType): string {
  return S3_PATHS[imageType === 'other' ? 'uploads' : imageType === 'product' ? 'products' : imageType === 'banner' ? 'banners' : 'headers']
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function uploadToS3(
  buffer: Buffer,
  filename: string,
  contentType: string,
  imageType: ImageType = 'other'
): Promise<{ s3Key: string; s3Url: string }> {
  const path = getS3Path(imageType)
  const s3Key = `${path}/${uuidv4()}_${sanitizeFilename(filename)}`

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
    })
  )

  // Use public URL (permanent, no expiration)
  const s3Url = getPublicUrl(s3Key)

  return { s3Key, s3Url }
}

/** キーを指定して保存する（見積書PDFなど、公開URLを使わず署名URLで配るファイル用） */
export async function putObject(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await s3Client.send(new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, Body: buffer, ContentType: contentType }))
}

export async function getPresignedUrl(s3Key: string, expiresIn = 604800): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
  })
  return getSignedUrl(s3Client, command, { expiresIn })
}

export async function uploadFromUrl(
  imageUrl: string,
  imageType: ImageType = 'other',
  customFilename?: string
): Promise<{ s3Key: string; s3Url: string }> {
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const contentType = response.headers.get('content-type') || 'image/jpeg'
  const urlFilename = imageUrl.split('/').pop()?.split('?')[0] || 'image.jpg'
  const filename = customFilename || urlFilename

  return uploadToS3(buffer, filename, contentType, imageType)
}

export async function deleteFromS3(s3Key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    })
  )
}

export function getPublicUrl(s3Key: string): string {
  // R2 は公開ドメイン（カスタムドメイン or *.r2.dev）経由で配信する
  if (process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${s3Key}`
  }
  return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-northeast-1'}.amazonaws.com/${s3Key}`
}
