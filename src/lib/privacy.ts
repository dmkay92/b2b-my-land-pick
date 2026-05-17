/**
 * 개인정보(PII) 필드 암/복호화 헬퍼
 *
 * profiles 테이블의 민감 필드를 DB 저장 전 암호화,
 * DB 조회 후 복호화하는 유틸리티.
 */

import { encrypt, decrypt, isCipherEnabled } from './cipher'

/** 암호화 대상 PII 필드 목록 */
export const PII_FIELDS = [
  'email',
  'representative_name',
  'phone_landline',
  'phone_mobile',
  'bank_name',
  'bank_account',
  'bank_holder',
  'business_registration_number',
] as const

export type PiiField = (typeof PII_FIELDS)[number]

/**
 * 객체에서 PII 필드를 암호화하여 새 객체 반환
 * INSERT/UPDATE 전에 호출
 */
export async function encryptPii<T extends Record<string, unknown>>(data: T): Promise<T> {
  if (!isCipherEnabled()) return data

  const result = { ...data }
  for (const field of PII_FIELDS) {
    if (field in result && typeof result[field] === 'string' && result[field]) {
      (result as Record<string, unknown>)[field] = await encrypt(result[field] as string)
    }
  }
  return result
}

/**
 * 객체에서 PII 필드를 복호화하여 새 객체 반환
 * SELECT 후에 호출
 */
export async function decryptPii<T extends Record<string, unknown>>(data: T): Promise<T> {
  if (!isCipherEnabled()) return data

  const result = { ...data }
  for (const field of PII_FIELDS) {
    if (field in result && typeof result[field] === 'string' && result[field]) {
      (result as Record<string, unknown>)[field] = await decrypt(result[field] as string)
    }
  }
  return result
}

/**
 * 배열의 각 항목에서 PII 필드를 복호화
 */
export async function decryptPiiList<T extends Record<string, unknown>>(list: T[]): Promise<T[]> {
  if (!isCipherEnabled()) return list
  return Promise.all(list.map(item => decryptPii(item)))
}

/**
 * 단일 문자열 암호화 (이메일 등 개별 필드용)
 */
export { encrypt as encryptField, decrypt as decryptField } from './cipher'
