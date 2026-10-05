# Deleted message recovery: help wanted

**Status: not working on real WhatsApp Web.** We need real data to fix it.

## What it should do

The extension saves the text of messages it sees in an open chat. When the sender deletes a message for everyone, it should show the saved text inside the deleted bubble, labelled "Recovered locally". Everything stays on your device.

## What we know

- The logic lives in [`src/content.js`](../src/content.js): `scanMessages`, `isDeletedMessage` and `restoreDeletedMessage`.
- Tests pass when a deletion is simulated by replacing a cached message's text with WhatsApp's placeholder.
- On real WhatsApp Web, when someone deletes a message for everyone, nothing appears. Not the recovered text, and not the "No saved copy" note.
- **We have never captured the real markup of a deleted message.** The tests use our guess.

Open questions the data can answer:

- Does the message keep the same `data-id` after it is deleted?
- Is the placeholder text in the same element as the original text, or does WhatsApp replace the whole bubble or row?
- Which icon, if any, marks a deleted message?
- Is the row removed and re-created, so the saved text is never matched to it?

## How to share data

Use a test chat. A second phone, a friend, or a small group you create for this works well.

1. Install the [latest release](https://github.com/DhananjayBhosale/private-wa-tools/releases/latest). In the extension popup, make sure **Recover deleted messages inline** is on. Reload WhatsApp Web.
2. Open the test chat in WhatsApp Web and leave it open.
3. From the other device, send a short text message. Wait until it appears.
4. Open the browser console on web.whatsapp.com: **Cmd+Option+J** on macOS, **Ctrl+Shift+J** on Windows and Linux.
5. Open [`recovery-snapshot.js`](recovery-snapshot.js), copy all of it, paste it into the console, and press Enter. The result is copied to your clipboard. Save it as the **before** snapshot.
6. From the other device, delete that message for everyone.
7. Run the snapshot again. Save it as the **after** snapshot.
8. Open a [Deleted message recovery data](https://github.com/DhananjayBhosale/private-wa-tools/issues/new?template=deleted-message-recovery-data.yml) issue and paste both snapshots.

### Privacy

The snapshot records page structure only: tag names, class names, icon names, and the length of any text. Message text, names, numbers, links and ids are removed. Texts that WhatsApp writes itself, such as "This message was deleted", are kept because they are the clue we need. Ids become short one-way tags, so the before and after runs can be matched without revealing the real id.

Read the output before you post it. Do not post screenshots of real chats.

If WhatsApp is not in English, add the "deleted message" text from your language to the `PLACEHOLDERS` list at the top of the snapshot file before you run it.

## How to send a fix

Open a pull request. A good one has:

- The code change.
- A test built from the real markup captured in the snapshots, with names and text anonymized, instead of a synthetic placeholder swap.
- Before and after snapshot output from a real deletion, showing recovery working in a real browser.
- No new network calls or permissions. See [CONTRIBUTING.md](../CONTRIBUTING.md).
