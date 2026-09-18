import { describe, expect, it } from 'bun:test'
import type { Stage } from '@ledger/contracts'
import { formatCostPerThousand, humanMs, slowestStage, waterfall } from './ledger.ts'

function stage(name: Stage['name'], from: string, to: string, toolCalls = 0): Stage {
	return { runId: 'r', name, startedAt: from, endedAt: to, toolCalls }
}

describe('waterfall', () => {
	it('puts stages in loop order whatever order they arrived in', () => {
		const bars = waterfall([
			stage('verify', '2026-09-16T10:04:00Z', '2026-09-16T10:05:00Z'),
			stage('claim', '2026-09-16T10:00:00Z', '2026-09-16T10:00:10Z'),
			stage('gates', '2026-09-16T10:02:00Z', '2026-09-16T10:04:00Z'),
		])
		expect(bars.map((bar) => bar.name)).toEqual(['claim', 'gates', 'verify'])
	})

	it('shares sum to one, so the bars cannot exceed the whole', () => {
		const bars = waterfall([
			stage('claim', '2026-09-16T10:00:00Z', '2026-09-16T10:00:10Z'),
			stage('implement', '2026-09-16T10:00:10Z', '2026-09-16T10:03:10Z'),
			stage('gates', '2026-09-16T10:05:00Z', '2026-09-16T10:06:00Z'),
		])
		const total = bars.reduce((sum, bar) => sum + bar.share, 0)
		expect(total).toBeCloseTo(1, 10)
	})

	it('reports zero shares rather than dividing by zero', () => {
		const bars = waterfall([stage('claim', '2026-09-16T10:00:00Z', '2026-09-16T10:00:00Z')])
		expect(bars[0]?.share).toBe(0)
	})

	it('has nothing to show for a run with no stages', () => {
		expect(waterfall([])).toEqual([])
	})
})

describe('slowestStage', () => {
	it('finds the stage worth attacking', () => {
		const bars = waterfall([
			stage('claim', '2026-09-16T10:00:00Z', '2026-09-16T10:00:10Z'),
			stage('verify', '2026-09-16T10:00:10Z', '2026-09-16T10:09:10Z'),
			stage('implement', '2026-09-16T10:09:10Z', '2026-09-16T10:12:10Z'),
		])
		expect(slowestStage(bars)?.name).toBe('verify')
	})

	it('is undefined when there is nothing measured', () => {
		expect(slowestStage([])).toBeUndefined()
	})
})

describe('humanMs', () => {
	it('reads as seconds below a minute', () => {
		expect(humanMs(9_400)).toBe('9s')
	})

	it('pads the seconds so a column of times lines up', () => {
		expect(humanMs(305_000)).toBe('5m 05s')
	})
})

describe('formatCostPerThousand', () => {
	it('computes the rate from cost and the sum of tokens', () => {
		// 74 minor units / 46300 total tokens * 1000 = 1.598...
		expect(formatCostPerThousand(41200, 5100, 74, 'EUR')).toBe('€1.60 /1k')
	})

	it('rounds to two decimal places', () => {
		expect(formatCostPerThousand(10000, 2000, 100, 'USD')).toBe('$8.33 /1k')
	})

	it('shows an em dash when there are no tokens to divide by', () => {
		expect(formatCostPerThousand(0, 0, 50, 'EUR')).toBe('—')
	})

	it('shows zero when the run was free', () => {
		expect(formatCostPerThousand(1000, 500, 0, 'USD')).toBe('$0.00 /1k')
	})
})
