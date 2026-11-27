# @vlyzer/baileys — Vlyzer's own Baileys fork

Personal fork of [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)
(official, MIT) maintained for the **Vlyzer** WhatsApp bot. Not affiliated with
WhiskeySockets. Base: upstream master post-7.0.0-rc14.

## Changes on branch `vlyzer-fork` (batch 1)

1. **WA Web version bump** — `2.3000.1043857760` → `2.3000.1056179073`
   (`src/Defaults/index.ts`).
2. **`mentionAll` send option** — pass `{ mentionAll: true }` to
   `sock.sendMessage(...)` in a group and the library resolves all participants
   from group metadata and injects them into the message `contextInfo.mentionedJid`
   (merged + de-duplicated). Implemented in `src/Socket/messages-send.ts` with the
   exported helper `applyMentionAllToMessage` in `src/Utils/messages.ts`; option
   typed in `src/Types/Message.ts`.

Album messages (`{ album: {...} }` + `albumParentKey`) are already supported by
upstream and are used as-is.

## Changes on branch `vlyzer-fork` (batch 2)

3. **New message content types** in `generateWAMessageContent`
   (`src/Utils/messages.ts`, typed in `src/Types/Message.ts`):
   - `{ interactive: { title?, subtitle?, text, footer?, buttons } }` — native-flow
     interactive message; button params are JSON-encoded for you.
   - `{ richResponse: { text?, codeBlocks?, tables? } }` — AI rich-response message
     with text / code / table submessages.
   - `{ requestPayment: { currency, amount, note?, expiryTimestamp?, requestFrom? } }`
     — payment request; `amount` is in major units, converted to `amount1000`.
4. **`makeInMemoryStore`** (`src/Utils/make-in-memory-store.ts`) — the classic
   store API upstream removed, reimplemented dependency-free on Maps:
   `bind(ev)`, `loadMessage`, `loadMessages`, chats/contacts/messages/groupMetadata,
   JSON `toJSON`/`fromJSON`/`readFromFile`/`writeToFile`.

All batch 1+2 features are covered by offline generation/store tests
(message generation + protobuf round-trip). Live rendering of the new
message types still needs an on-device check.

## Changes on branch `vlyzer-fork` (batch 3)

5. **`{ stickerPack: { name, publisher, packId?, stickers } }`** — sticker pack
   message; the first sticker goes through the normal sticker media pipeline and
   provides the pack-level media payload.
6. **`{ paymentInvite: { serviceType, expiryTimestamp? } }`** — payment invite.
7. **`ai` send option** — `sendMessage(jid, content, { ai: true, aiPersonaId? })`
   attaches `botMetadata` to the message context info, the same place Meta AI
   messages carry theirs.
8. **Newsletter quoting enabled** — upstream skips quoted contextInfo for
   newsletter JIDs entirely; the fork attaches stanzaId/quotedMessage there too.

Already present upstream (inherited by this fork, no change needed):
selective history sync (`shouldSyncHistoryMessage`, `syncFullHistory`),
LID <-> phone-number mapping (`getPNForLID` / `getLIDForPN`), USync username
and bot-profile protocols, MEX GraphQL queries (`executeWMexQuery`),
custom pairing codes, album messages.

## Package

Published name in `package.json`: `@vlyzer/baileys`, version `7.0.0-vlyzer.3`.
The Vlyzer bot consumes this fork as a local dependency.

## Batch 4 — Meta AI msmsg decryption + listener crash guard (7.0.0-vlyzer.4)

The last two Zireku gaps, implemented from the protocol after studying how
msmsg works (the algorithm was verified with a full offline round-trip:
simulate the server encrypting a bot reply, then decrypt it back):

- **Meta AI `msmsg` decryption** (`src/Utils/meta-ai-msmsg.ts`): replies from
  Meta AI arrive as `<enc type="msmsg">` carrying a `MessageSecretMessage`
  (encIv + encPayload). The key is a two-pass HKDF over the `messageSecret`
  of the message we sent to the bot: k1 = HKDF(secret, info "Bot Message"),
  k2 = HKDF(k1, info msgId‖targetJid‖botJid), AES-256-GCM with
  AAD = msgId‖0x00‖botJid. msgId/target-JID candidates (edit target, stanza
  id, meta target; PN and LID forms) are tried in order.
  - Secret registry in `decode-wa-message.ts` (`setBotMessageSecret`):
    populated at send time (`messages-send.ts`), from any decoded message's
    messageContextInfo, and recovered from the message store on receive
    (`messages-recv.ts`, via `<meta target_id>`) so restarts don't lose it.
    Upstream's "ignore msmsg + NACK" placeholder is replaced by real handling;
    streaming partials (`<bot edit="first">`) are skipped, complete responses
    (`full`/`last`) are decrypted and delivered as normal messages.
  - Offline tests: PN-target decrypt, LID-target decrypt, base64 secret,
    wrong secret correctly rejected.
- **Listener crash guard** (`src/Utils/listener-guard.ts`): wraps listeners
  registered through the event buffer (`ev.on`/`ev.off`) so a throwing or
  rejecting async listener is logged instead of becoming an unhandled
  rejection that kills the process. Wrappers are memoized per listener so
  `off()` still finds the registration.

## Batch 5 — Sound stickers (7.0.0-vlyzer.5)

WhatsApp's sound stickers (animated sticker with an attached audio track)
turned out to already exist in the wire protocol as an embedded message:
`StickerMessage.audioMessage` — a full `AudioMessage` in the oneof `audio`.
The field was found in a newer proto extraction (field **26**, tag 210);
upstream's proto does not have it yet. Note the top-level
`Message.audioStickerMessage` in newer protos is only a `FutureProofMessage`
placeholder, not the usable format.

- **WAProto** (`WAProto/index.js` + `index.d.ts`): `audioMessage` added to
  `StickerMessage` by hand (encode/decode/fromObject/toObject + the `audio`
  oneof accessor), matching the generated-code patterns of the neighbouring
  fields. This is a deliberate, documented deviation from "never hand-edit
  WAProto": the field cannot be regenerated without a newer proto extraction,
  and the edit is fully covered by round-trip tests.
- **Sending**: pass `stickerAudio` next to `sticker` in the message content.
  The audio is uploaded as regular audio media via `prepareWAMessageMedia`
  and embedded into the generated `stickerMessage`
  (`src/Utils/messages.ts`, type in `src/Types/Message.ts`).
- Offline tests: proto encode/decode round-trip keeps the audio (oneof
  discriminator `audio: "audioMessage"`), generation with a mocked upload
  attaches a fully populated `audioMessage` (media key, url, duration),
  plain stickers are unaffected.
- Receiving works through the same proto change: incoming sound stickers
  decode with their `audioMessage` intact instead of dropping the field.
