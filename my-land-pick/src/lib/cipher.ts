/**
 * mrt-cipher-v2 Node.js 포팅
 *
 * Java mrt-cipher-v2 라이브러리와 동일한 역할:
 * 1. CipherDecryptor: AWS KMS로 암호화된 설정값 복호화
 * 2. PrivacyCipher:   KMS SecretKey를 사용한 개인정보 AES-256-GCM 암/복호화
 *
 * 환경변수:
 *   PRIVACY_SECRET_KEY        — KMS로 암호화된 SecretKey (Base64)
 *   AWS_REGION                — KMS 리전 (default: ap-northeast-2)
 *   PRIVACY_CIPHER_ENABLED    — "true"이면 암호화 활성화 (local에서는 끌 수 있음)
 */

import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16
const ENCODING = 'base64' as const

// ---------- KMS Decryptor (CipherDecryptor 역할) ----------

let kmsClient: KMSClient | null = null

function getKmsClient(): KMSClient {
  if (!kmsClient) {
    kmsClient = new KMSClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' })
  }
  return kmsClient
}

/**
 * KMS로 암호화된 cipherText를 복호화
 * mrt-cipher-v2의 CipherDecryptor.decrypt() 역할
 */
export async function kmsDecrypt(cipherText: string): Promise<string> {
  const client = getKmsClient()
  const blob = Buffer.from(cipherText, 'base64')
  const command = new DecryptCommand({ CiphertextBlob: blob })
  const response = await client.send(command)
  if (!response.Plaintext) throw new Error('KMS decrypt returned empty plaintext')
  return Buffer.from(response.Plaintext).toString('utf-8')
}

// ---------- PrivacyCipher (개인정보 암/복호화) ----------

let cachedSecretKey: Buffer | null = null

async function getSecretKey(): Promise<Buffer> {
  if (cachedSecretKey) return cachedSecretKey

  const encryptedKey = process.env.PRIVACY_SECRET_KEY
  if (!encryptedKey) {
    throw new Error('PRIVACY_SECRET_KEY 환경변수가 설정되지 않았습니다.')
  }

  const plainKey = await kmsDecrypt(encryptedKey)
  // AES-256은 32바이트 키 필요
  cachedSecretKey = Buffer.from(plainKey, 'utf-8').subarray(0, 32)
  return cachedSecretKey
}

export function isCipherEnabled(): boolean {
  return process.env.PRIVACY_CIPHER_ENABLED === 'true'
}

/**
 * 평문을 AES-256-GCM으로 암호화
 * 반환: base64(iv + ciphertext + authTag)
 */
export async function encrypt(plainText: string): Promise<string> {
  if (!isCipherEnabled() || !plainText) return plainText

  const key = await getSecretKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  // iv(12) + encrypted + tag(16) → base64
  return Buffer.concat([iv, encrypted, tag]).toString(ENCODING)
}

/**
 * AES-256-GCM 암호문을 복호화
 * 입력: base64(iv + ciphertext + authTag)
 */
export async function decrypt(cipherText: string): Promise<string> {
  if (!isCipherEnabled() || !cipherText) return cipherText

  // 암호화되지 않은 평문인 경우 그대로 반환 (마이그레이션 호환)
  try {
    const buf = Buffer.from(cipherText, ENCODING)
    if (buf.length < IV_LENGTH + TAG_LENGTH + 1) return cipherText

    const key = await getSecretKey()
    const iv = buf.subarray(0, IV_LENGTH)
    const tag = buf.subarray(buf.length - TAG_LENGTH)
    const encrypted = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH)

    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    // 복호화 실패 → 암호화 전 평문으로 간주 (마이그레이션 기간)
    return cipherText
  }
}
