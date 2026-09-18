import { expect, it } from 'bun:test'
import { load, save } from './views.ts'

// Bun has no localStorage, and the module reads the global at call time.
it('round-trips a saved view through storage', () => {
	const store = new Map<string, string>()
	Object.defineProperty(globalThis, 'localStorage', {
		value: {
			getItem: (key: string): string | null => store.get(key) ?? null,
			setItem: (key: string, value: string): void => {
				store.set(key, value)
			},
		},
		configurable: true,
	})
	save({ filter: 'failed' })
	expect(load()?.filter).toBe('failed')
})
