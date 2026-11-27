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
