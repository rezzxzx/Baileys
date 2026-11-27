/**
 * vlyzer-fork: a lightweight in-memory store, API-compatible in spirit with the
 * classic Baileys v6 `makeInMemoryStore` that upstream removed.
 *
 * It is intentionally dependency-free (the old one used @adiwajshing/keyed-db):
 * collections are backed by Maps behind a small KeyedDB-shaped facade.
 *
 * Usage:
 *   const store = makeInMemoryStore({ logger })
 *   store.bind(sock.ev)
 *   const msg = await store.loadMessage(jid, id)
 *   store.writeToFile('./store.json'); store.readFromFile('./store.json')
 */
import { promises as fs } from 'fs'
import type { Chat, Contact, GroupMetadata, WAMessage, WAMessageKey } from '../Types'
import type { ILogger } from './logger'

/** Minimal KeyedDB-shaped collection backed by a Map. */
export class SimpleKeyedDB<T> {
	private map = new Map<string, T>()

	constructor(private keyFn: (item: T) => string) {}

	get(id: string): T | undefined {
		return this.map.get(id)
	}

	insertIfAbsent(item: T): T {
		const key = this.keyFn(item)
		const existing = this.map.get(key)
		if (existing) {
			return existing
		}

		this.map.set(key, item)
		return item
	}

	upsert(item: T): T {
		const key = this.keyFn(item)
		const existing = this.map.get(key)
		const merged = existing ? { ...existing, ...item } : item
		this.map.set(key, merged)
		return merged
	}

	deleteById(id: string): boolean {
		return this.map.delete(id)
	}

	filter(predicate: (item: T) => boolean): T[] {
		return this.all().filter(predicate)
	}

	all(): T[] {
		return [...this.map.values()]
	}

	count(): number {
		return this.map.size
	}

	clear() {
		this.map.clear()
	}

	toJSON(): T[] {
		return this.all()
	}

	fromJSON(items: T[]) {
		this.map.clear()
		for (const item of items || []) {
			this.map.set(this.keyFn(item), item)
		}
	}
}

export type InMemoryMessageStore = {
	array: WAMessage[]
	get: (id: string) => WAMessage | undefined
	insert: (msg: WAMessage) => void
	toJSON: () => WAMessage[]
	fromJSON: (msgs: WAMessage[]) => void
}

const makeMessageStore = (): InMemoryMessageStore => {
	const array: WAMessage[] = []
	const byId = new Map<string, WAMessage>()
	return {
		array,
		get: id => byId.get(id),
		insert: msg => {
			const id = msg.key?.id
			if (!id) {
				return
			}

			const existing = byId.get(id)
			if (existing) {
				Object.assign(existing, msg)
			} else {
				byId.set(id, msg)
				array.push(msg)
			}
		},
		toJSON: () => array,
		fromJSON: msgs => {
			array.length = 0
			byId.clear()
			for (const msg of msgs || []) {
				const id = msg.key?.id
				if (id) {
					byId.set(id, msg)
					array.push(msg)
				}
			}
		}
	}
}

type StoreEventEmitter = {
	on: (event: string, listener: (data: never) => void) => void
}

export const makeInMemoryStore = ({ logger }: { logger?: ILogger } = {}) => {
	const chats = new SimpleKeyedDB<Chat>(chat => chat.id as string)
	const contacts: { [id: string]: Contact } = {}
	const messages: { [jid: string]: InMemoryMessageStore } = {}
	const groupMetadata: { [id: string]: GroupMetadata } = {}
	const presences: { [id: string]: { [participant: string]: unknown } } = {}
	const state = { connection: 'close' as string }

	const getMessageStore = (jid: string) => {
		if (!messages[jid]) {
			messages[jid] = makeMessageStore()
		}

		return messages[jid]
	}

	const loadMessage = async (jid: string, id: string) => messages[jid]?.get(id)

	const loadMessages = async (jid: string, count: number) => {
		const store = messages[jid]
		if (!store) {
			return []
		}

		return store.array.slice(-count)
	}

	const bind = (ev: StoreEventEmitter) => {
		const on = <T,>(event: string, handler: (data: T) => void) => ev.on(event, handler as never)

		on<{ chats: Chat[] }>('chats.set', ({ chats: newChats }) => {
			for (const chat of newChats || []) {
				chats.upsert(chat)
			}
		})
		on<Chat[]>('chats.upsert', newChats => {
			for (const chat of newChats || []) {
				chats.insertIfAbsent(chat)
			}
		})
		on<(Partial<Chat> & { id?: string | null })[]>('chats.update', updates => {
			for (const update of updates || []) {
				const chat = update.id ? chats.get(update.id) : undefined
				if (chat) {
					chats.upsert({ ...chat, ...update } as Chat)
				}
			}
		})
		on<string[]>('chats.delete', deletions => {
			for (const id of deletions || []) {
				chats.deleteById(id)
			}
		})
		on<{ contacts: Contact[] }>('contacts.set', ({ contacts: newContacts }) => {
			for (const contact of newContacts || []) {
				if (contact.id) {
					contacts[contact.id] = contact
				}
			}
		})
		on<Contact[]>('contacts.upsert', newContacts => {
			for (const contact of newContacts || []) {
				if (contact.id) {
					contacts[contact.id] = { ...contacts[contact.id], ...contact }
				}
			}
		})
		on<Partial<Contact>[]>('contacts.update', updates => {
			for (const update of updates || []) {
				if (update.id && contacts[update.id]) {
					contacts[update.id] = { ...contacts[update.id], ...update } as Contact
				}
			}
		})
		on<{ messages: WAMessage[]; type: string }>('messages.upsert', ({ messages: newMessages }) => {
			for (const msg of newMessages || []) {
				const jid = msg.key?.remoteJid
				if (jid) {
					getMessageStore(jid).insert(msg)
				}
			}
		})
		on<{ key: WAMessageKey; update: Partial<WAMessage> }[]>('messages.update', updates => {
			for (const { key, update } of updates || []) {
				const jid = key?.remoteJid
				const existing = jid && key.id ? messages[jid]?.get(key.id) : undefined
				if (existing) {
					Object.assign(existing, update)
				}
			}
		})
		on<{ keys: WAMessageKey[] } | { jid: string; all: true }>('messages.delete', data => {
			if ('all' in data && data.all) {
				const store = messages[data.jid]
				if (store) {
					store.array.length = 0
				}

				return
			}

			for (const key of (data as { keys: WAMessageKey[] }).keys || []) {
				const store = key.remoteJid ? messages[key.remoteJid] : undefined
				const existing = store && key.id ? store.get(key.id) : undefined
				if (store && existing) {
					const idx = store.array.indexOf(existing)
					if (idx >= 0) {
						store.array.splice(idx, 1)
					}
				}
			}
		})
		on<{ chats: Chat[]; contacts: Contact[]; messages: WAMessage[] }>('messaging-history.set', data => {
			for (const chat of data.chats || []) {
				chats.upsert(chat)
			}

			for (const contact of data.contacts || []) {
				if (contact.id) {
					contacts[contact.id] = contact
				}
			}

			for (const msg of data.messages || []) {
				const jid = msg.key?.remoteJid
				if (jid) {
					getMessageStore(jid).insert(msg)
				}
			}
		})
		on<Partial<GroupMetadata>[]>('groups.update', updates => {
			for (const update of updates || []) {
				if (update.id && groupMetadata[update.id]) {
					groupMetadata[update.id] = { ...groupMetadata[update.id], ...update } as GroupMetadata
				}
			}
		})
		on<{ connection: string }>('connection.update', update => {
			if (update.connection) {
				state.connection = update.connection
			}
		})
	}

	const toJSON = () => ({
		chats: chats.toJSON(),
		contacts,
		messages: Object.fromEntries(Object.entries(messages).map(([jid, store]) => [jid, store.toJSON()])),
		groupMetadata,
		presences,
		state
	})

	const fromJSON = (json: ReturnType<typeof toJSON>) => {
		chats.fromJSON(json.chats || [])
		Object.assign(contacts, json.contacts || {})
		for (const [jid, msgs] of Object.entries(json.messages || {})) {
			getMessageStore(jid).fromJSON(msgs)
		}

		Object.assign(groupMetadata, json.groupMetadata || {})
		Object.assign(presences, json.presences || {})
		if (json.state) {
			Object.assign(state, json.state)
		}
	}

	const readFromFile = async (path: string) => {
		try {
			const raw = await fs.readFile(path, { encoding: 'utf-8' })
			fromJSON(JSON.parse(raw))
			logger?.debug({ path }, 'in-memory store loaded from file')
		} catch (err) {
			logger?.warn({ err, path }, 'in-memory store: could not read file, starting empty')
		}
	}

	const writeToFile = async (path: string) => {
		await fs.writeFile(path, JSON.stringify(toJSON()))
		logger?.debug({ path }, 'in-memory store written to file')
	}

	return {
		chats,
		contacts,
		messages,
		groupMetadata,
		presences,
		state,
		loadMessage,
		loadMessages,
		bind,
		toJSON,
		fromJSON,
		readFromFile,
		writeToFile
	}
}

export type InMemoryStore = ReturnType<typeof makeInMemoryStore>
