import { createHmac } from "node:crypto"
import pg from "pg"

const { Pool } = pg
const databaseUrl = process.env.DATABASE_URL
const pepper = process.env.CHILD_ACCESS_CODE_PEPPER

if (!databaseUrl) throw new Error("DATABASE_URL is required.")
if (!pepper || pepper.length < 32) throw new Error("CHILD_ACCESS_CODE_PEPPER must be at least 32 characters.")

const pool = new Pool({ connectionString: databaseUrl, max: 1 })
const client = await pool.connect()

try {
  await client.query("BEGIN")
  const { rows } = await client.query(
    "SELECT id, access_code_hash FROM child_profiles WHERE access_code_hash NOT LIKE 'v2:%' FOR UPDATE",
  )
  let updated = 0
  for (const row of rows) {
    if (!/^[a-f0-9]{64}$/i.test(row.access_code_hash)) {
      throw new Error(`Unexpected legacy hash format for child profile ${row.id}; transaction aborted.`)
    }
    const upgraded = "v2:" + createHmac("sha256", pepper).update(row.access_code_hash).digest("hex")
    const result = await client.query(
      "UPDATE child_profiles SET access_code_hash = $1 WHERE id = $2 AND access_code_hash = $3",
      [upgraded, row.id, row.access_code_hash],
    )
    if (result.rowCount !== 1) throw new Error(`Concurrent update detected for child profile ${row.id}; transaction aborted.`)
    updated += 1
  }
  const remaining = await client.query(
    "SELECT COUNT(*)::int AS count FROM child_profiles WHERE access_code_hash NOT LIKE 'v2:%'",
  )
  await client.query("COMMIT")
  console.log(JSON.stringify({ upgraded, remainingLegacy: Number(remaining.rows[0]?.count ?? 0) }))
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined)
  throw error
} finally {
  client.release()
  await pool.end()
}
