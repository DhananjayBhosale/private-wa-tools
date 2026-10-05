# Privacy Policy

Private WA Tools is a browser extension that runs only on `https://web.whatsapp.com/`. It works entirely on your device. It has no server, no account, no analytics, and no third-party services. Nothing it handles is sent anywhere.

Last updated: 5 October 2026.

## What the extension handles

| Data | Why | Stored? |
| --- | --- | --- |
| Message text on the page | Read when you click the copy button, so it can be put on your clipboard. | No. |
| Your settings | Remember which options you turned on. | Yes, on this device. |
| Names of chats you pin | Only if you turn on local pins and pin a chat. Used to keep that chat marked in the list. | Yes, on this device. |
| Message text, for recovery | Only if you turn on **Save messages so deleted ones can be recovered**. Off by default. A local copy of message text you see, up to 2,000 messages, so a deleted message could be shown again. Recovery does not work yet. | Yes, on this device, until you erase it. |
| Install time and copy success or failure | Local diagnostics. No message text is included. | Yes, on this device. |

Stored data lives in `chrome.storage.local`. It is not synced and is not readable by any website.

## What it never does

- Send data to us or to anyone else. It has no network code. The test suite fails if a network call is added.
- Run remote code, or load scripts from outside the extension.
- Sell, share, or use data for ads, profiling, or anything other than the features above.
- Let a person read your data. Nobody but you has access to it.

## Your choices

- Saving message text is off until you switch it on. The switch sits next to a plain description of what it does.
- **Clear restored message cache** in the popup erases every saved message, in open tabs and in storage.
- Removing the extension deletes everything it stored.
- The optional read-receipt guard is off unless you turn it on. While it is on, WhatsApp Web is told the tab is hidden, so chats you read there stay unread on every linked device, including your phone. It keeps one flag in WhatsApp Web's own page storage so it can apply on reload. That flag stays there after you remove the extension, and nothing reads it.

## Permissions

- `https://web.whatsapp.com/*`: to add the copy button, hide buttons, and blur content on WhatsApp Web, and nowhere else.
- `storage`: to keep the settings and optional data above on your device.
- `clipboardWrite`: to put the message text on your clipboard when you click copy.
- `offscreen`: to write to the clipboard when the page blocks it.

## Limited Use

The use of information the extension handles complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used only to provide the features above and is not transferred, sold, or used for any other purpose.

## Limits

WhatsApp Web itself needs WhatsApp's servers to load and sync messages. This extension does not make WhatsApp offline. The offline promise means the extension's own features need no server and no third-party service.

## Changes

If how the extension handles data ever changes, this file will be updated and the change will be described in the release notes and shown in the extension before it takes effect.

## Contact

Open an issue at https://github.com/DhananjayBhosale/private-wa-tools/issues.
