<p align="center"><img src="icons/icon-128.png" width="96" alt="Private WA Tools icon"></p>

# Private WA Tools

[![Test](https://github.com/DhananjayBhosale/private-wa-tools/actions/workflows/test.yml/badge.svg)](https://github.com/DhananjayBhosale/private-wa-tools/actions/workflows/test.yml)

A small Chrome extension for WhatsApp Web. It does two things well and keeps everything on your computer.

- **Hide the clutter.** Turn off Status, Channels, Communities, Meta AI, and the emoji, GIF and sticker buttons. Each one has its own switch. The unread dot goes away with its button.
- **Copy a whole message in one click.** Hover a message and click the copy button beside it. You get the full text on your clipboard with line breaks and emoji intact. "Read more" is expanded first, and the time and read ticks are left out.

**100% offline.** No account, no analytics, no tracking, no server. Nothing you read or copy leaves your browser.

> Unofficial project. Not affiliated with, endorsed by, or connected to WhatsApp or Meta.

## Install

1. [Download private-wa-tools.zip](https://github.com/DhananjayBhosale/private-wa-tools/releases/latest/download/private-wa-tools.zip) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the unzipped folder.

Open or reload [web.whatsapp.com](https://web.whatsapp.com), then click the shield icon in the toolbar to choose your settings.

Chrome only allows installing outside the Chrome Web Store this way, so these three steps are as short as it gets. Tested on Chrome. Other Chromium browsers such as Edge and Brave have not been tested.

**Update:** unzip the new release over the old folder, click the reload arrow on the extension card at `chrome://extensions`, and reload WhatsApp Web.

## Help wanted: deleted message recovery

The extension is meant to show the original text of a message after the sender deletes it. **This does not work yet, and we need help to fix it.**

- Recovery passes in tests that simulate a deletion. On real WhatsApp Web, nothing appears when someone deletes a message for everyone.
- We have not captured the real markup WhatsApp uses for a deleted message. That is the missing piece.

Two ways to help:

- **Share data.** Take a before and after snapshot of a real deletion with the [redacting snapshot tool](docs/recovery-snapshot.js), then open a [Deleted message recovery data](https://github.com/DhananjayBhosale/private-wa-tools/issues/new?template=deleted-message-recovery-data.yml) issue. The snapshot keeps page structure only. Message text, names, numbers, links and ids are removed before you see the output. Full steps are in [docs/deleted-message-recovery.md](docs/deleted-message-recovery.md).
- **Send a fix.** If you have a solution, open a pull request. Include a test built from real captured markup, plus before and after output from a real deletion.

## Privacy

- **No network calls.** The extension code has no `fetch`, `XMLHttpRequest`, WebSocket, beacon or remote script. `npm test` runs [`scripts/audit-offline.mjs`](scripts/audit-offline.mjs), which fails if one is added.
- **Narrow access.** The only site it can touch is `https://web.whatsapp.com/*`. Other permissions: `storage` (your settings), `clipboardWrite` (the copy button) and `offscreen` (clipboard fallback).
- **Stored on your device only**, in `chrome.storage.local`: settings, local pins and, while **Recover deleted messages inline** is on (the default), a local copy of message text seen in open chats, up to 2,000 messages. Use **Clear restored message cache** in the popup to erase it, or turn the feature off.
- WhatsApp Web still uses the internet to work. The extension adds nothing to that.

Details are in [PRIVACY.md](PRIVACY.md). The source is small enough to read in an evening.

## Also included

- Blur contact names, photos, message previews, or the open chat. Hover to reveal.
- Local chat pins. Visual only; they do not change WhatsApp's own pins.
- Optional read-receipt guard, **off by default**. While it is on, chats you read in WhatsApp Web stay unread on every linked device, including your phone.

## Known limits

- WhatsApp changes its web markup without notice, which can break any feature. Reports and fixes are welcome.
- The read-receipt guard is best effort.

## Contributing

Pull requests and issues are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

```sh
npm ci
npm test
```

`npm test` needs Node.js 20 or newer and does not start a browser.

## License

[MIT](LICENSE)
