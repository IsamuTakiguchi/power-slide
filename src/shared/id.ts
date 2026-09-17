/**
 * ID 生成。main（Node）でも renderer（Chromium）でも動く crypto.randomUUID を使い、
 * 外部依存を増やさない。
 */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
}
