/**
 * vlyzer-fork: decryption for Meta AI bot replies (`<enc type="msmsg">`).
 *
 * When you message Meta AI, your outgoing message carries a random
 * `messageSecret` in its messageContextInfo. The bot's reply arrives as a
 * `MessageSecretMessage` (encIv + encPayload) instead of a Signal ciphertext,
 * and is decrypted with a two-pass HKDF over that secret:
 *
 *   k1    = HKDF(messageSecret, salt=empty, info="Bot Message", 32)
 *   k2    = HKDF(k1, salt=empty, info=msgId || targetSenderJid || botJid, 32)
 *   AAD   = msgId || 0x00 || botJid
 *   plain = AES-256-GCM-Decrypt(k2, encIv, encPayload, AAD)
 *
 * The plaintext is a randomly padded protobuf Message. Which msgId / target
 * JID combination the server used varies (edits use the edit target id, the
 * target JID may be the PN or the LID form), so candidates are tried in order.
 */
import { proto } from '../../WAProto/index.js'
import { aesDecryptGCM, hkdf } from './crypto'
import { unpadRandomMax16 } from './generics'

const BOT_MESSAGE_INFO = 'Bot Message'
const KEY_LENGTH = 32

export type MsmsgMessageKey = {
	/** JID of the bot that sent the msmsg reply */
	participant: string
	/** our own JID (PN form) */
	meId: string
	/** our own JID (LID form), when known */
	meLid?: string
	botEditTargetId?: string | null
	metaTargetId?: string | null
	stanzaId?: string | null
}

export type MsmsgPayload = {
	encIv: Uint8Array | Buffer
	encPayload: Uint8Array | Buffer
}

const toBuffer = (value: Uint8Array | Buffer | string): Buffer => {
	if (Buffer.isBuffer(value)) {
		return value
	}

	if (value instanceof Uint8Array) {
		return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
	}

	return Buffer.from(value, 'base64')
}

// strips the device suffix from LID JIDs: "user:device@lid" -> "user@lid"
const normalizeLidJid = (jid?: string | null): string => {
	if (!jid || !jid.endsWith('@lid') || !jid.includes(':')) {
		return jid || ''
	}

	return `${jid.split(':')[0]}@lid`
}

// ordered msgId candidates: botEditTargetId when editing, stanzaId for the
// normal full response, metaTargetId as a fallback
const selectMsgIdCandidates = (messageKey: MsmsgMessageKey): string[] => {
	const seen = new Set<string>()
	const result: string[] = []
	for (const id of [messageKey.botEditTargetId, messageKey.stanzaId, messageKey.metaTargetId]) {
		const s = id ? String(id) : ''
		if (s && !seen.has(s)) {
			seen.add(s)
			result.push(s)
		}
	}

	return result
}

// ordered target_sender_user_jid candidates — the non-AD user JID (no device suffix)
const selectTargetJidCandidates = (messageKey: MsmsgMessageKey): string[] => {
	const seen = new Set<string>()
	const result: string[] = []
	for (const jid of [normalizeLidJid(messageKey.meId), normalizeLidJid(messageKey.meLid)]) {
		if (jid && !seen.has(jid)) {
			seen.add(jid)
			result.push(jid)
		}
	}

	return result
}

/**
 * Decrypts an msmsg payload with the messageSecret of the message we sent to
 * the bot. Tries the msgId / target-JID candidate combinations in order and
 * resolves with the decrypted (still padded) protobuf bytes.
 */
export const decryptMsmsgBotMessage = async (
	messageSecret: Uint8Array | Buffer | string,
	messageKey: MsmsgMessageKey,
	msMsg: MsmsgPayload
): Promise<Buffer> => {
	if (!messageSecret || (messageSecret instanceof Uint8Array && !messageSecret.byteLength)) {
		throw new Error('Missing required messageSecret for msmsg decryption')
	}

	if (!messageKey?.participant) {
		throw new Error('Missing required participant for msmsg decryption')
	}

	if (!messageKey?.meId) {
		throw new Error('Missing required meId for msmsg decryption')
	}

	if (!msMsg?.encIv) {
		throw new Error('Missing required encIv for msmsg decryption')
	}

	if (!msMsg?.encPayload) {
		throw new Error('Missing required encPayload for msmsg decryption')
	}

	const msgIdCandidates = selectMsgIdCandidates(messageKey)
	if (!msgIdCandidates.length) {
		throw new Error('Missing required target message id for msmsg decryption')
	}

	const targetJidCandidates = selectTargetJidCandidates(messageKey)
	if (!targetJidCandidates.length) {
		throw new Error('Missing required target JID for msmsg decryption')
	}

	const botJidBuf = Buffer.from(String(messageKey.participant))
	const payload = toBuffer(msMsg.encPayload)
	const iv = toBuffer(msMsg.encIv)
	// k1 depends only on the secret, so it is derived once and reused across candidates
	const baseKey = Buffer.from(hkdf(toBuffer(messageSecret), KEY_LENGTH, { info: BOT_MESSAGE_INFO }))

	let lastError: unknown
	for (const msgId of msgIdCandidates) {
		// msg_id is always the ASCII bytes of the id
		const idBuf = Buffer.from(msgId)
		for (const targetJid of targetJidCandidates) {
			const info = Buffer.concat([idBuf, Buffer.from(targetJid), botJidBuf])
			const key = Buffer.from(hkdf(baseKey, KEY_LENGTH, { info: info.toString('latin1') }))
			// the AAD always uses the bot JID, never the target sender JID
			const aad = Buffer.concat([idBuf, Buffer.from([0x00]), botJidBuf])
			try {
				return Buffer.from(aesDecryptGCM(payload, key, iv, aad))
			} catch (err) {
				lastError = err
			}
		}
	}

	throw lastError instanceof Error ? lastError : new Error('msmsg decryption failed for all candidates')
}

/** Decodes decrypted msmsg bytes (randomly padded protobuf) into a Message. */
export const decodeDecryptedMsmsgMessage = (decrypted: Uint8Array | Buffer): proto.IMessage => {
	const buf = toBuffer(decrypted)
	try {
		const unpadded = Buffer.from(unpadRandomMax16(buf))
		const decoded = proto.Message.decode(unpadded)
		const fields = decoded as unknown as Record<string, unknown>
		const hasContent = Object.keys(decoded).some(k => k !== 'messageContextInfo' && fields[k] != null)
		if (hasContent) {
			return decoded
		}
	} catch {
		// not padded — fall through and decode the raw buffer
	}

	return proto.Message.decode(buf)
}
