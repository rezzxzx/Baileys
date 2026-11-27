/**
 * vlyzer-fork: crash guard for event listeners.
 *
 * EventEmitter discards whatever a listener returns, so an async listener that
 * rejects becomes an unhandled rejection — and Node's default for those is to
 * terminate the process. In a host running one socket per account, a single bad
 * stanza can take every account down at once. Wrapping a listener keeps the
 * failure where it happened: it is logged, not fatal.
 *
 * Wrappers are remembered per original function so `off(event, handler)` still
 * finds the registration made by `on(event, handler)`.
 */
export const makeListenerGuard = (onError: (err: unknown) => void) => {
	const wrappers = new WeakMap<Function, Function>()

	return {
		/** the function to hand to EventEmitter in place of `listener` */
		wrap<T extends Function>(listener: T): T {
			if (typeof listener !== 'function') {
				return listener
			}

			const existing = wrappers.get(listener)
			if (existing) {
				return existing as T
			}

			const wrapper = function (this: unknown, ...args: unknown[]) {
				let result: unknown
				try {
					result = (listener as Function).apply(this, args)
				} catch (err) {
					onError(err)
					return
				}

				// only promises need the catch; a sync listener already returned
				if (result && typeof (result as { catch?: unknown }).catch === 'function') {
					;(result as Promise<unknown>).catch(onError)
				}

				return result
			}

			wrappers.set(listener, wrapper)
			return wrapper as unknown as T
		},
		/** the registration made for `listener`, so removal works on the original reference */
		unwrap<T extends Function>(listener: T): T {
			if (typeof listener !== 'function') {
				return listener
			}

			return (wrappers.get(listener) as T) || listener
		}
	}
}

export type ListenerGuard = ReturnType<typeof makeListenerGuard>
