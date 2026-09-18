/**
 * Saved views.
 *
 * Remembers what the reader was looking at so they do not have to set it again.
 */

export interface SavedView {
	readonly filter: string
}

const KEY = 'ledger.savedView'

export function save(view: SavedView): void {
	localStorage.setItem(KEY, JSON.stringify(view))
}

export function load(): SavedView | null {
	const raw = localStorage.getItem(KEY)
	return raw === null ? null : (JSON.parse(raw) as SavedView)
}
