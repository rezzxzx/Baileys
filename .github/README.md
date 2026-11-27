# @vlyzer/baileys

Vlyzer's own fork of [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) — the WhatsApp Web API library, extended with the features the Vlyzer bot actually needs. This is **not** the upstream package: everything below the line is added or fixed on top of upstream master (post-`7.0.0-rc14`).

Current version: **7.0.0-vlyzer.5** · WA Web version: **2.3000.1056179073** · License: MIT

## Install

Not published on npm — install straight from this repo:

```bash
npm install github:rezzxzx/Baileys#main
```

```ts
import makeWASocket from '@vlyzer/baileys'

const sock = makeWASocket({ /* your usual baileys options */ })
```

Everything from upstream Baileys works exactly as documented at [baileys.wiki](https://baileys.wiki). The additions below are purely additive — no upstream API was removed or changed in spirit.

## What's different from upstream

### Sending

- **`mentionAll`** — mention every group member in one call, no participant list needed:
  ```ts
  await sock.sendMessage(groupJid, { text: 'tag all' }, { mentionAll: true })
  ```
- **Interactive messages** (native-flow buttons):
  ```ts
  await sock.sendMessage(jid, {
    interactive: {
      header: 'Choose one',
      body: 'Pick an option below',
      footer: 'Vlyzer',
      buttons: [{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Yes', id: 'yes' }) }]
    }
  })
  ```
- **Rich responses** — text, code blocks and tables in one message:
  ```ts
  await sock.sendMessage(jid, {
    richResponse: { submessages: [
      { type: 'text', text: 'Result:' },
      { type: 'code', code: 'console.log(1)', language: 'javascript' },
      { type: 'table', header: ['Col'], rows: [['a', 'b']] }
    ] }
  })
  ```
- **Payments** — `requestPayment` (amount in major units, e.g. `25000` = Rp25.000) and `paymentInvite` (FBPAY / NOVI / UPI).
- **Sticker packs** — send a whole pack with `{ stickerPack: { name, publisher, stickers: [...] } }`.
- **Sound stickers** — attach an audio track to a sticker with `{ sticker, stickerAudio }` (embedded `StickerMessage.audioMessage`).
- **`ai` flag** — attach Meta AI persona metadata to a message: `sendMessage(jid, { text: 'hi' }, { ai: true })`.
- **Albums** — supported upstream and verified here (`{ album: {...} }` + per-item `albumParentKey`).

### Receiving

- **Meta AI replies just work.** Messages from Meta AI arrive as `<enc type="msmsg">`, which upstream ignores. This fork decrypts them (two-pass HKDF over the outgoing message's `messageSecret` → AES-256-GCM) and delivers them as normal messages. Secrets are registered at send time and recovered from your message store after a restart — nothing to configure.
- **Newsletter quoting** — quoted context is attached for newsletter JIDs instead of being dropped.

### Utilities

- **`makeInMemoryStore`** — the classic in-memory store (chats / contacts / messages / groups, JSON persist via `readFromFile` / `writeToFile`), reimplemented dependency-free:
  ```ts
  import { makeInMemoryStore } from '@vlyzer/baileys'
  const store = makeInMemoryStore({})
  store.bind(sock.ev)
  ```
- **Listener crash guard** — listeners registered through `sock.ev` are wrapped so a throwing/rejecting async handler is logged instead of crashing the process with an unhandled rejection.

### Inherited from upstream (already there, verified)

Selective history sync (`shouldSyncHistoryMessage`, `syncFullHistory`), `getPNForLID` / `getLIDForPN`, custom pairing codes, USync username + bot-profile protocols, MEX GraphQL queries (`executeWMexQuery`), and the `a.whatsapp.net` media-host fix behind the "newsletter media" issue.

Full per-batch changelog: [VLYZER_FORK.md](./VLYZER_FORK.md)

## Credits

Built on [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) (MIT). This fork is an independent project, not affiliated with WhatsApp LLC or Meta.
