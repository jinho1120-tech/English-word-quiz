import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { PREFIX, UpgradeAbort, buildVector, normalizeCode, parseArgs, pepperFingerprint, runUpgrade, wrap } from "./upgrade-access-code-hashes.mjs"

const PEPPER = "test-only-pepper-value-0123456789-abcdef"
const sha = (value) => createHash("sha256").update(value).digest("hex")
const legacy = (n) => sha(`CODE${n}`)
const v2 = (n) => wrap(legacy(n), PEPPER)
const rowsOf = (...pairs) => pairs.map(([id, hash]) => ({ id, access_code_hash: hash }))

class FakeClient {
  constructor(rows, opts = {}) {
    this.rows = rows.map((row) => ({ ...row }))
    this.opts = opts
    this.log = []
    this.snapshot = null
    this.readOnly = false
    this.updates = 0
    this.commits = 0
    this.rollbacks = 0
    this.postCommitReads = 0
  }
  async query(sql, params = []) {
    const statement = sql.trim()
    this.log.push(statement)
    if (statement.startsWith("BEGIN")) {
      this.snapshot = this.rows.map((row) => ({ ...row }))
      this.readOnly = statement.includes("READ ONLY")
      return { rows: [] }
    }
    if (statement.startsWith("SET LOCAL")) return { rows: [] }
    if (statement.startsWith("LOCK TABLE")) {
      if (this.opts.failLock) throw new Error("canceling statement due to lock timeout")
      return { rows: [] }
    }
    if (statement.startsWith("SELECT id, access_code_hash FROM child_profiles")) {
      if (this.commits > 0) {
        this.postCommitReads += 1
        if (this.opts.failPostCommitRead) throw new Error("post-commit read failed")
      }
      return { rows: this.rows.map((row) => ({ ...row })) }
    }
    if (statement.startsWith("UPDATE child_profiles SET access_code_hash")) {
      if (this.readOnly) throw new Error("read-only transaction")
      const [newHash, id, oldHash] = params
      this.updates += 1
      if (this.opts.noRowForUpdate === this.updates) return { rowCount: 0, rows: [] }
      const row = this.rows.find((item) => item.id === id && item.access_code_hash === oldHash)
      if (!row) return { rowCount: 0, rows: [] }
      row.access_code_hash = newHash
      if (this.opts.injectLegacyAfterUpdate === this.updates) {
        this.rows.push({ id: "late-write", access_code_hash: legacy(999) })
      }
      return { rowCount: 1, rows: [] }
    }
    if (statement === "COMMIT") {
      if (this.opts.failCommit) throw new Error("connection lost during COMMIT")
      this.commits += 1
      this.snapshot = null
      return { rows: [] }
    }
    if (statement === "ROLLBACK") {
      this.rollbacks += 1
      if (this.snapshot) this.rows = this.snapshot
      this.snapshot = null
      return { rows: [] }
    }
    throw new Error(`unexpected SQL: ${statement}`)
  }
}
const run = async (client, options = {}) => {
  const lines = []
  const report = await runUpgrade({ client, pepper: PEPPER, log: (line) => lines.push(line), apply: false, ...options })
  return { report, lines, text: lines.join("\n") }
}

test("dry run is read-only, changes nothing, and reports exact next command", async () => {
  const client = new FakeClient(rowsOf(["a", legacy(1)], ["b", legacy(2)], ["c", v2(3)]))
  const { report, text } = await run(client)
  assert.equal(report.status, "dry-run")
  assert.equal(report.wouldUpgrade, 2)
  assert.equal(client.updates, 0)
  assert.equal(client.commits, 0)
  assert.ok(client.log.includes("BEGIN READ ONLY"))
  assert.ok(client.log.includes("SET LOCAL lock_timeout = '5s'"))
  assert.deepEqual(client.rows.map((row) => row.access_code_hash), [legacy(1), legacy(2), v2(3)])
  assert.match(text, /--apply --expect-count=2/)
})

test("apply converts every legacy row atomically and leaves v2 untouched", async () => {
  const client = new FakeClient(rowsOf(["a", legacy(1)], ["b", legacy(2)], ["c", v2(3)]))
  const { report } = await run(client, { apply: true, expectCount: 2 })
  assert.equal(report.status, "applied")
  assert.equal(report.upgraded, 2)
  assert.deepEqual(client.rows.map((row) => row.access_code_hash), [v2(1), v2(2), v2(3)])
  assert.equal(client.commits, 1)
  assert.equal(report.after.legacy, 0)
})

test("abnormal rows, including malformed v2, abort before any update", async () => {
  for (const bad of ["not-a-hash", "v2:short", null, legacy(1).toUpperCase(), "v2:" + "g".repeat(64)]) {
    const client = new FakeClient(rowsOf(["good", legacy(1)], ["bad", bad]))
    const { report, text } = await run(client, { apply: true, expectCount: 1 })
    assert.equal(report.exitCode, 2, String(bad))
    assert.equal(client.updates, 0)
    assert.equal(client.commits, 0)
    assert.equal(client.rollbacks, 1)
    assert.match(text, /bad/)
  }
})

test("expect-count mismatch aborts before updates", async () => {
  const client = new FakeClient(rowsOf(["a", legacy(1)]))
  const { report } = await run(client, { apply: true, expectCount: 7 })
  assert.equal(report.exitCode, 2)
  assert.equal(client.updates, 0)
  assert.equal(client.commits, 0)
})

test("a failed update midway rolls all previous updates back", async () => {
  const client = new FakeClient(rowsOf(["a", legacy(1)], ["b", legacy(2)]), { noRowForUpdate: 2 })
  const { report } = await run(client, { apply: true, expectCount: 2 })
  assert.equal(report.exitCode, 2)
  assert.equal(client.commits, 0)
  assert.equal(client.rollbacks, 1)
  assert.deepEqual(client.rows.map((row) => row.access_code_hash), [legacy(1), legacy(2)])
})

test("post-condition failure rolls back the entire transaction", async () => {
  const client = new FakeClient(rowsOf(["a", legacy(1)]), { injectLegacyAfterUpdate: 1 })
  const { report, text } = await run(client, { apply: true, expectCount: 1 })
  assert.equal(report.exitCode, 2)
  assert.equal(client.commits, 0)
  assert.match(text, /커밋 전 검증 실패/)
  assert.equal(client.rows.length, 1)
  assert.equal(client.rows[0].access_code_hash, legacy(1))
})

test("lock timeout aborts without changes", async () => {
  const client = new FakeClient(rowsOf(["a", legacy(1)]), { failLock: true })
  const { report, text } = await run(client, { apply: true, expectCount: 1 })
  assert.equal(report.exitCode, 3)
  assert.equal(client.updates, 0)
  assert.equal(client.commits, 0)
  assert.match(text, /lock timeout/)
})

test("post-commit verification failure never claims rollback", async () => {
  const client = new FakeClient(rowsOf(["a", legacy(1)]), { failPostCommitRead: true })
  const { report, text } = await run(client, { apply: true, expectCount: 1 })
  assert.equal(report.status, "applied-postcheck-failed")
  assert.equal(report.exitCode, 3)
  assert.equal(client.commits, 1)
  assert.match(text, /커밋 완료/)
  assert.doesNotMatch(text, /롤백했습니다/)
})

test("COMMIT connection failure is reported as an unknown outcome", async () => {
  const client = new FakeClient(rowsOf(["a", legacy(1)]), { failCommit: true })
  const { report, text } = await run(client, { apply: true, expectCount: 1 })
  assert.equal(report.status, "commit-unknown")
  assert.equal(report.exitCode, 3)
  assert.match(text, /커밋 여부/)
  assert.doesNotMatch(text, /변경 사항은 적용되지 않았습니다/)
})

test("all-v2 table is an idempotent no-op", async () => {
  const client = new FakeClient(rowsOf(["a", v2(1)]))
  const { report } = await run(client, { apply: true, expectCount: 0 })
  assert.equal(report.status, "noop")
  assert.equal(report.exitCode, 0)
  assert.equal(client.commits, 0)
})

test("parseArgs rejects unsafe or mixed modes", () => {
  assert.throws(() => parseArgs(["--apply"]), UpgradeAbort)
  assert.throws(() => parseArgs(["--expect-count=1"]), UpgradeAbort)
  assert.throws(() => parseArgs(["--expect-count=abc", "--apply"]), UpgradeAbort)
  assert.throws(() => parseArgs(["--fingerprint", "--apply", "--expect-count=1"]), UpgradeAbort)
  assert.throws(() => parseArgs(["--print-vector=ABCDE-12345", "--fingerprint"]), UpgradeAbort)
  assert.throws(() => parseArgs(["--aply"]), UpgradeAbort)
  assert.equal(parseArgs(["--apply", "--expect-count", "0"]).expectCount, 0)
})

test("test vector formula matches SHA-256 then HMAC-SHA256", () => {
  const vector = buildVector("abcde-12345", PEPPER)
  assert.equal(vector.normalized, "ABCDE12345")
  assert.equal(vector.legacySha256, sha("ABCDE12345"))
  assert.equal(vector.storedValue, wrap(vector.legacySha256, PEPPER))
  assert.ok(vector.storedValue.startsWith(PREFIX))
  assert.throws(() => buildVector("short", PEPPER), UpgradeAbort)
  assert.throws(() => normalizeCode("abcde!12345"), UpgradeAbort)
})

test("pepper fingerprint is stable and changes with the pepper", () => {
  assert.match(pepperFingerprint(PEPPER), /^[a-f0-9]{16}$/)
  assert.equal(pepperFingerprint(PEPPER), pepperFingerprint(PEPPER))
  assert.notEqual(pepperFingerprint(PEPPER), pepperFingerprint("different-pepper-value-0123456789"))
})
