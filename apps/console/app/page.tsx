import Link from 'next/link'
import { durationMs, formatMinor } from '@ledger/contracts'
import { assess, periodOf, spendFor } from '@/lib/budget.ts'
import { humanMs, listRuns } from '@/lib/ledger.ts'
import { NoRuns, Unreachable } from '@/components/empty.tsx'
import { BudgetChip, OutcomeChip } from '@/components/state.tsx'

// Never prerendered. A cached page would show a run count that is quietly stale,
// and a ledger that is confidently wrong is worse than one that is slow.
export const dynamic = 'force-dynamic'

/** What a month of agent work is allowed to cost, in minor units. */
const MONTHLY_LIMIT_MINOR = 50_000

export default async function Page({
	searchParams,
}: {
	searchParams?: { startedAfter?: string; startedBefore?: string }
}) {
	const after = searchParams?.startedAfter
	const before = searchParams?.startedBefore
	let runs
	try {
		runs = await listRuns(after || before ? 200 : 50, after, before)
	} catch (error) {
		return (
			<Shell>
				<Unreachable reason={error instanceof Error ? error.message : String(error)} />
			</Shell>
		)
	}

	if (runs.length === 0) {
		return (
			<Shell>
				<NoRuns />
			</Shell>
		)
	}

	const period = periodOf(runs[0]!.startedAt)
	const spend = spendFor(runs, period)
	const budget = spend ? await assess(period, MONTHLY_LIMIT_MINOR, spend.minor, spend.currency) : undefined
	const refused = runs.filter((run) => run.outcome === 'refused').length

	return (
		<Shell>
			<section className="strip">
				<div className="wrap">
					<dl className="metrics">
						<div className="metric">
							<dt>Runs</dt>
							<dd>
								{runs.length}
								<small>{refused} refused by policy</small>
							</dd>
						</div>
						<div className="metric">
							<dt>Spend, {period}</dt>
							<dd>
								{spend ? formatMinor(spend.minor, spend.currency) : 'not comparable'}
								<small>
									{spend ? `of ${formatMinor(MONTHLY_LIMIT_MINOR, spend.currency)} allowed` : 'runs use more than one currency'}
								</small>
							</dd>
						</div>
						<div className="metric">
							<dt>Budget</dt>
							<dd>
								{budget?.ok ? <BudgetChip state={budget.budget.state} /> : 'unknown'}
								<small>
									{budget?.ok
										? `${formatMinor(budget.budget.remainingMinor, budget.budget.currency)} remaining`
										: (budget?.reason ?? 'no spend to assess')}
								</small>
							</dd>
						</div>
						<div className="metric">
							<dt>Tokens</dt>
							<dd>
								{runs.reduce((sum, run) => sum + run.tokensIn + run.tokensOut, 0).toLocaleString('en')}
								<small>in and out, every run</small>
							</dd>
						</div>
					</dl>
				</div>
			</section>

			<form className="strip" method="GET" action="/">
				<div className="wrap" style={{ display: 'flex', gap: '0.75rem', alignItems: 'end', flexWrap: 'wrap' }}>
					<label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.75rem' }}>
						From
						<input type="text" name="startedAfter" placeholder="2026-09-01T00:00:00Z"
							defaultValue={after ?? ''}
							style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }} />
					</label>
					<label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.75rem' }}>
						To
						<input type="text" name="startedBefore" placeholder="2026-09-30T23:59:59Z"
							defaultValue={before ?? ''}
							style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }} />
					</label>
					<button type="submit"
						style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem', cursor: 'pointer' }}>
						Filter
					</button>
					{(after || before) && (
						<a href="/" style={{ fontSize: '0.875rem' }}>Clear</a>
					)}
				</div>
			</form>

			<main>
				<div className="wrap">
					<h2>Runs</h2>
					<p className="note">
						Newest first. Every figure here was computed by the service that owns it: the ledger for
						runs and stages, the budget engine for anything denominated in money.
					</p>
					<table>
						<thead>
							<tr>
								<th>Item</th>
								<th>Outcome</th>
								<th className="num">Took</th>
								<th className="num">Tokens</th>
								<th className="num">Cost</th>
								<th>Run</th>
							</tr>
						</thead>
						<tbody>
							{runs.map((run) => (
								<tr key={run.id}>
									<td className="item">
										<Link href={`/runs/${run.id}`}>{run.item}</Link>
									</td>
									<td>
										<OutcomeChip outcome={run.outcome} />
									</td>
									<td className="num">{humanMs(durationMs(run.startedAt, run.endedAt))}</td>
									<td className="num">{(run.tokensIn + run.tokensOut).toLocaleString('en')}</td>
									<td className="num">{formatMinor(run.costMinor, run.currency)}</td>
									<td className="id">{run.id}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</main>
		</Shell>
	)
}

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<>
			<header className="mast">
				<div className="wrap">
					<p className="kicker">Agent run ledger</p>
					<h1>Where the time and the money went</h1>
					<p className="lede">
						Every run the factory finished, with its stages timed separately. The slow stage is rarely
						the one people expect, which is the whole reason this page exists.
					</p>
				</div>
			</header>
			{children}
			<footer>
				<div className="wrap">
					<p>Runs come from the ingest service. Anything in money comes from the budget engine.</p>
				</div>
			</footer>
		</>
	)
}
