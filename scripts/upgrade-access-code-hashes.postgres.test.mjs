import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { Client } from "pg"
import { runUpgrade, wrap } from "./upgrade-access-code-hashes.mjs"

const databaseUrl = process.env.MIGRATION_TEST_DATABASE_URL
const enabled = (() => {
  if (!databaseUrl) return false
  const url = new URL(databaseUrl)
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) || url.pathname !== "/migration_test") {
    throw new Error("Refusing PostgreSQL integration tests: MIGRATION_TEST_DATABASE_URL must target localhost database /migration_test.")
  }
  return true
})()
const pepper = "postgres-integration-test-pepper-0123456789"
const sha = (value) => createHash("sha256").update(value).digest("hex")
const legacy = (value) => sha(value)
const clientForTest = async () => {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  await client.query("CREATE TEMP TABLE child_profiles (id text PRIMARY KEY, access_code_hash text NOT NULL) ON COMMIT PRESERVE ROWS")
  return client
}
const seed = async (client, rows) => {
  for (const [id, hash] of rows) await client.query("INSERT INTO child_profiles (id, access_code_hash) VALUES ($1, $2)", [id, hash])
}
const silentLog = () => {}

test("PostgreSQL: dry-run is truly read-only and leaves legacy hashes unchanged", { skip: !enabled }, async () => {
  const client = await clientForTest()
  try {
    await seed(client, [["a", legacy("CODE0000001")], ["b", "v2:" + "a".repeat(64)]])
    const report = await runUpgrade({ client, pepper, apply: false, log: silentLog })
    assert.equal(report.status, "dry-run")
    assert.equal(report.wouldUpgrade, 1)
    const rows = (await client.query("SELECT id, access_code_hash FROM child_profiles ORDER BY id")).rows
    assert.equal(rows[0].access_code_hash, legacy("CODE0000001"))
    assert.equal(rows[1].access_code_hash, "v2:" + "a".repeat(64))
  } finally { await client.end() }
})

test("PostgreSQL: apply commits correct HMAC hashes and second apply is idempotent", { skip: !enabled }, async () => {
  const client = await clientForTest()
  try {
    const oldA = legacy("CODE0000001")
    const oldB = legacy("CODE0000002")
    const existingV2 = "v2:" + "b".repeat(64)
    await seed(client, [["a", oldA], ["b", oldB], ["c", existingV2]])
    const first = await runUpgrade({ client, pepper, apply: true, expectCount: 2, log: silentLog })
    assert.equal(first.status, "applied")
    const rows = (await client.query("SELECT id, access_code_hash FROM child_profiles ORDER BY id")).rows
    assert.equal(rows[0].access_code_hash, wrap(oldA, pepper))
    assert.equal(rows[1].access_code_hash, wrap(oldB, pepper))
    assert.equal(rows[2].access_code_hash, existingV2)
    const second = await runUpgrade({ client, pepper, apply: true, expectCount: 0, log: silentLog })
    assert.equal(second.status, "noop")
  } finally { await client.end() }
})

test("PostgreSQL: abnormal hash aborts before changing any valid legacy row", { skip: !enabled }, async () => {
  const client = await clientForTest()
  try {
    const old = legacy("CODE0000001")
    await seed(client, [["valid", old], ["bad", "v2:broken"]])
    const report = await runUpgrade({ client, pepper, apply: true, expectCount: 1, log: silentLog })
    assert.equal(report.status, "aborted")
    const rows = (await client.query("SELECT id, access_code_hash FROM child_profiles ORDER BY id")).rows
    assert.equal(rows[0].access_code_hash, old)
    assert.equal(rows[1].access_code_hash, "v2:broken")
  } finally { await client.end() }
})

test("PostgreSQL: SHARE ROW EXCLUSIVE migration lock permits reads but blocks writes", { skip: !enabled }, async () => {
  const owner = await clientForTest()
  const contender = new Client({ connectionString: databaseUrl })
  try {
    await owner.query("INSERT INTO child_profiles (id, access_code_hash) VALUES ('seed', $1)", [legacy("CODE0000001")])
    await contender.connect()
    await contender.query("CREATE TEMP TABLE child_profiles (id text PRIMARY KEY, access_code_hash text NOT NULL) ON COMMIT PRESERVE ROWS")
    await contender.query("INSERT INTO child_profiles (id, access_code_hash) VALUES ('seed', $1)", [legacy("CODE0000001")])
    await owner.query("BEGIN")
    await owner.query("LOCK TABLE child_profiles IN SHARE ROW EXCLUSIVE MODE")
    const read = await owner.query("SELECT COUNT(*)::int AS count FROM child_profiles")
    assert.equal(read.rows[0].count, 1)
    await contender.query("BEGIN")
    await contender.query("SET LOCAL lock_timeout = '150ms'")
    await assert.rejects(
      contender.query("INSERT INTO child_profiles (id, access_code_hash) VALUES ('blocked', $1)", [legacy("CODE0000002")]),
      (error) => error.code === "55P03",
    )
    await contender.query("ROLLBACK")
    await owner.query("ROLLBACK")
  } finally {
    await contender.end().catch(() => undefined)
    await owner.end().catch(() => undefined)
  }
})
