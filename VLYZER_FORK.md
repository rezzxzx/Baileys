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

## Package

Published name in `package.json`: `@vlyzer/baileys`, version `7.0.0-vlyzer.1`.
The Vlyzer bot consumes this fork as a local dependency.
