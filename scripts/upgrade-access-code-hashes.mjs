#!/usr/bin/env node
/**
 * One-time child_profiles.access_code_hash migration.
 * Default is read-only dry-run. Apply requires --apply and --expect-count=N.
 * Never run from CI/deployment. Take a DB restore point before applying.
 */
import { createHash, createHmac } from "node:crypto"
import { pathToFileURL } from "node:url"

export const PREFIX = "v2:"
const LEGACY_RE = /^[a-f0-9]{64}$/
const V2_RE = /^v2:[a-f0-9]{64}$/

export class UpgradeAbort extends Error {
  constructor(message, exitCode = 2) { super(message); this.name = "UpgradeAbort"; this.exitCode = exitCode }
}
export function wrap(legacyHashHex, pepper) {
  return PREFIX + createHmac("sha256", pepper).update(legacyHashHex).digest("hex")
}
export function pepperFingerprint(pepper) {
  return createHmac("sha256", pepper).update("pepper-fingerprint-v1").digest("hex").slice(0, 16)
}
export function normalizeCode(value) {
  if (typeof value !== "string") throw new UpgradeAbort("테스트 코드는 문자열이어야 합니다.", 1)
  const trimmed = value.trim()
  if (!/^[a-f0-9-]+$/i.test(trimmed)) throw new UpgradeAbort("테스트 코드는 16진수와 하이픈만 포함할 수 있습니다.", 1)
  return trimmed.replace(/-/g, "").toUpperCase()
}
export function buildVector(code, pepper) {
  const normalized = normalizeCode(code)
  if (!/^[A-F0-9]{10}$/.test(normalized)) throw new UpgradeAbort("테스트 코드는 16진수 10자리여야 합니다.", 1)
  const legacySha256 = createHash("sha256").update(normalized).digest("hex")
  return { normalized, legacySha256, storedValue: wrap(legacySha256, pepper) }
}
export function parseArgs(argv) {
  const args = { apply: false, expectCount: undefined, expectDbHost: undefined, printVector: undefined, fingerprint: false, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i], eq = raw.indexOf("=")
    const flag = eq < 0 ? raw : raw.slice(0, eq)
    const inline = eq < 0 ? undefined : raw.slice(eq + 1)
    const readValue = () => {
      const value = inline !== undefined ? inline : argv[++i]
      if (typeof value !== "string" || !value || value.startsWith("--")) throw new UpgradeAbort(`${flag} 값이 필요합니다.`, 1)
      return value
    }
    switch (flag) {
      case "--apply": if (inline !== undefined) throw new UpgradeAbort("--apply 는 값이 없는 옵션입니다.", 1); args.apply = true; break
      case "--fingerprint": if (inline !== undefined) throw new UpgradeAbort("--fingerprint 는 값이 없는 옵션입니다.", 1); args.fingerprint = true; break
      case "--help": case "-h": args.help = true; break
      case "--expect-db-host": args.expectDbHost = readValue(); break
      case "--print-vector": args.printVector = readValue(); break
      case "--expect-count": {
        const value = readValue()
        if (!/^\\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new UpgradeAbort("--expect-count 는 안전한 0 이상의 정수여야 합니다.", 1)
        args.expectCount = Number(value); break
      }
      default: throw new UpgradeAbort(`알 수 없는 옵션: ${raw}`, 1)
    }
  }
  const utilityModes = Number(args.fingerprint) + Number(args.printVector !== undefined)
  if (utilityModes > 1 || (utilityModes > 0 && (args.apply || args.expectCount !== undefined || args.expectDbHost !== undefined))) {
    throw new UpgradeAbort("--fingerprint 와 --print-vector 는 다른 실행 옵션과 함께 사용할 수 없습니다.", 1)
  }
  if (args.apply && args.expectCount === undefined) throw new UpgradeAbort("--apply 에는 --expect-count=N 이 필요합니다.", 1)
  if (!args.apply && args.expectCount !== undefined) throw new UpgradeAbort("--expect-count 는 --apply 와 함께만 사용할 수 있습니다.", 1)
  if (args.help && argv.length > 1) throw new UpgradeAbort("--help 는 다른 옵션과 함께 사용할 수 없습니다.", 1)
  return args
}
function classify(rows) {
  const v2 = [], legacy = [], abnormal = []
  for (const row of rows) {
    const hash = row.access_code_hash
    if (typeof hash === "string" && V2_RE.test(hash)) v2.push(row.id)
    else if (typeof hash === "string" && LEGACY_RE.test(hash)) legacy.push({ id: row.id, hash })
    else abnormal.push(row.id)
  }
  return { total: rows.length, v2, legacy, abnormal }
}
const summary = (c) => ({ total: c.total, alreadyV2: c.v2.length, legacy: c.legacy.length, abnormal: c.abnormal.length })

export async function runUpgrade({ client, pepper, apply, expectCount, log = console.log }) {
  const started = Date.now()
  let inTransaction = false, commitStarted = false, committed = false
  const rollback = async () => {
    if (!inTransaction) return
    inTransaction = false
    try { await client.query("ROLLBACK") } catch { /* connection may be gone */ }
  }
  const abort = async (message, before) => {
    await rollback()
    log(`[중단] ${message}`)
    log("[결과] 커밋 전 중단. 트랜잭션을 롤백했으며 변경 사항은 적용되지 않았습니다.")
    return { status: "aborted", exitCode: 2, message, before: before ? summary(before) : undefined, durationMs: Date.now() - started }
  }
  try {
    await client.query(apply ? "BEGIN" : "BEGIN READ ONLY")
    inTransaction = true
    await client.query("SET LOCAL lock_timeout = '5s'")
    await client.query("SET LOCAL statement_timeout = '60s'")
    if (apply) await client.query("LOCK TABLE child_profiles IN SHARE ROW EXCLUSIVE MODE")
    const before = classify((await client.query("SELECT id, access_code_hash FROM child_profiles ORDER BY id")).rows)
    log(`[변환 전] 전체 ${before.total} | 이미 v2 ${before.v2.length} | 변환 대상(legacy) ${before.legacy.length} | 비정상 ${before.abnormal.length}`)
    if (before.abnormal.length) {
      const ids = before.abnormal.slice(0, 20).join(", ")
      const more = before.abnormal.length > 20 ? ` 외 ${before.abnormal.length - 20}건` : ""
      return await abort(`형식이 예상과 다른 해시 ${before.abnormal.length}건 (profile id: ${ids}${more}). 원인 확인 전 변환하지 않습니다.`, before)
    }
    if (!apply) {
      await rollback()
      log(`[드라이런] 변경 없음. --apply 시 ${before.legacy.length}건이 변환됩니다.`)
      if (before.legacy.length) log(`[다음 단계] --apply --expect-count=${before.legacy.length}`)
      return { status: "dry-run", exitCode: 0, before: summary(before), wouldUpgrade: before.legacy.length, durationMs: Date.now() - started }
    }
    if (before.legacy.length !== expectCount) return await abort(`--expect-count(${expectCount})와 현재 변환 대상(${before.legacy.length})이 다릅니다. 드라이런을 다시 실행하세요.`, before)
    if (!before.legacy.length) {
      await rollback(); log("[완료] 변환할 행이 없습니다(이미 모두 v2).")
      return { status: "noop", exitCode: 0, before: summary(before), upgraded: 0, durationMs: Date.now() - started }
    }
    for (const row of before.legacy) {
      const result = await client.query(
        "UPDATE child_profiles SET access_code_hash = $1 WHERE id = $2 AND access_code_hash = $3",
        [wrap(row.hash, pepper), row.id, row.hash],
      )
      if (result.rowCount !== 1) return await abort(`profile ${row.id} 변경 실패. 전체 롤백합니다.`, before)
    }
    const after = classify((await client.query("SELECT id, access_code_hash FROM child_profiles ORDER BY id")).rows)
    const problems = []
    if (after.abnormal.length) problems.push(`비정상 해시 ${after.abnormal.length}건`)
    if (after.legacy.length) problems.push(`legacy ${after.legacy.length}건 잔존`)
    if (after.total !== before.total) problems.push(`전체 행 수 변화 ${before.total} -> ${after.total}`)
    if (after.v2.length !== before.v2.length + before.legacy.length) problems.push("v2 건수 불일치")
    if (problems.length) return await abort(`커밋 전 검증 실패: ${problems.join("; ")}`, before)

    // A failed COMMIT response has an unknown outcome; never claim rollback after this point.
    commitStarted = true
    await client.query("COMMIT")
    committed = true; inTransaction = false
    log(`[변환 후] 전체 ${after.total} | v2 ${after.v2.length} | legacy ${after.legacy.length} | 비정상 ${after.abnormal.length}`)
    let final
    try {
      final = classify((await client.query("SELECT id, access_code_hash FROM child_profiles ORDER BY id")).rows)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      log(`[사후 확인 실패] 커밋 완료 후 재조회 실패: ${reason}`)
      log("[주의] 이미 커밋됐으므로 여기서 롤백할 수 없습니다. DB 상태를 별도로 확인하세요.")
      return { status: "applied-postcheck-failed", exitCode: 3, upgraded: before.legacy.length, durationMs: Date.now() - started }
    }
    log(`[커밋 후 재확인] 전체 ${final.total} | v2 ${final.v2.length} | legacy ${final.legacy.length} | 비정상 ${final.abnormal.length}`)
    if (final.total !== after.total || final.legacy.length || final.abnormal.length) {
      log("[주의] 커밋 후 상태가 예상과 다릅니다. 구버전 인스턴스의 쓰기 및 비정상 행을 확인하세요.")
      return { status: "applied-postcheck-warning", exitCode: 2, before: summary(before), after: summary(final), upgraded: before.legacy.length, durationMs: Date.now() - started }
    }
    log(`[완료] ${before.legacy.length}건 변환 및 사후 확인 완료.`)
    return { status: "applied", exitCode: 0, before: summary(before), after: summary(final), upgraded: before.legacy.length, durationMs: Date.now() - started }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    if (commitStarted && !committed) {
      await rollback()
      log(`[커밋 결과 불명] COMMIT 요청 후 오류: ${reason}`)
      log("[주의] DB 커밋 여부를 확정할 수 없습니다. 재접속해 상태를 확인하세요. 변경되지 않았다고 가정하지 마세요.")
      return { status: "commit-unknown", exitCode: 3, message: reason, durationMs: Date.now() - started }
    }
    await rollback()
    log(`[오류] ${reason}`)
    log("[결과] 커밋 전 오류이므로 트랜잭션을 롤백했습니다.")
    return { status: "aborted", exitCode: 3, message: reason, durationMs: Date.now() - started }
  }
}

function usage() {
  return [
    "사용법:",
    "  --fingerprint                       pepper 지문 출력(DB 불필요)",
    "  --print-vector=ABCDE-12345          테스트 코드 해시 벡터 출력(DB 불필요)",
    "  (옵션 없음)                         읽기 전용 드라이런",
    "  --apply --expect-count=N            실제 변환(드라이런에서 확인한 legacy 건수)",
    "  --expect-db-host=HOST               대상 DB 호스트 확인(선택, 권장)",
  ].join("\\n")
}
async function main() {
  let args
  try { args = parseArgs(process.argv.slice(2)) }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error)); console.error(usage())
    return error.exitCode ?? 1
  }
  if (args.help) { console.log(usage()); return 0 }
  // Do not trim: the application uses the environment value byte-for-byte.
  const pepper = process.env.CHILD_ACCESS_CODE_PEPPER
  if (!pepper || pepper.length < 32) { console.error("CHILD_ACCESS_CODE_PEPPER (32자 이상)가 필요합니다."); return 1 }
  if (args.fingerprint) { console.log(`pepper 지문: ${pepperFingerprint(pepper)}`); return 0 }
  if (args.printVector !== undefined) {
    try { console.log(JSON.stringify(buildVector(args.printVector, pepper), null, 2)); return 0 }
    catch (error) { console.error(error instanceof Error ? error.message : String(error)); return error.exitCode ?? 1 }
  }
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) { console.error("DATABASE_URL 이 필요합니다."); return 1 }
  let target
  try {
    const u = new URL(databaseUrl)
    target = { host: u.hostname, database: u.pathname.replace(/^\\//, "") }
  } catch { console.error("DATABASE_URL 형식이 올바르지 않습니다."); return 1 }
  console.log(`[대상] DB 호스트: ${target.host} / DB: ${target.database}`)
  console.log(`[모드] ${args.apply ? "적용(--apply)" : "드라이런(변경 없음)"} | pepper 지문: ${pepperFingerprint(pepper)}`)
  if (args.expectDbHost && args.expectDbHost.toLowerCase() !== target.host.toLowerCase()) {
    console.error(`--expect-db-host(${args.expectDbHost})와 접속 대상(${target.host})이 다릅니다. 중단합니다.`); return 1
  }
  const { default: pg } = await import("pg")
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    const report = await runUpgrade({ client, pepper, apply: args.apply, expectCount: args.expectCount })
    console.log(`[소요] ${report.durationMs}ms | 상태: ${report.status}`)
    return report.exitCode
  } finally { await client.end() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code }, (error) => {
    console.error(error instanceof Error ? error.message : error); process.exitCode = 3
  })
}
