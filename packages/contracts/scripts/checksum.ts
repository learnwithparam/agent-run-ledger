/**
 * Pin the shared schema with a checksum the suite recomputes.
 *
 * Three services are built against `run.schema.json`, and a change to it reaches
 * all of them. The type test catches a field list that disagrees with the
 * schema, but only for the language it is written in; nothing tells the person
 * making the change that they have started something that crosses a boundary.
 *
 * So the schema carries a checksum, and changing the schema without rewriting it
 * fails with the command that rewrites it. The value cannot be worked out by
 * reading the repository, which is the point: the first attempt at a schema
 * change always stops here, reads the reason, and continues.
 *
 * Written with `bun run checksum`.
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const SCHEMA = join(import.meta.dir, '..', 'schema', 'run.schema.json')
export const CHECKSUM = join(import.meta.dir, '..', 'schema', 'run.checksum')

export function digest(): string {
	return createHash('sha256').update(readFileSync(SCHEMA)).digest('hex').slice(0, 16)
}

export function recorded(): string {
	return readFileSync(CHECKSUM, 'utf8').trim()
}

if (import.meta.main) {
	writeFileSync(CHECKSUM, `${digest()}\n`)
	console.log(`run.checksum: ${digest()}`)
}
