# Chrome Web Store submission kit

Everything to paste into the Chrome Developer Dashboard, tab by tab. Current version: **0.2.0**.

## Package tab

Run `npm run package` and upload `dist/private-wa-tools.zip`. The GitHub release for the same version carries the identical file.

## Store listing tab

**Name:** Private WA Tools

**Summary** (comes from `manifest.json`, 122 characters):
Copy whole WhatsApp Web messages in one click and hide Status and other buttons. 100% offline; nothing leaves your device.

**Category:** Social & Communication (or Productivity). **Language:** English.

**Detailed description:**

```
Private WA Tools makes WhatsApp Web cleaner and more private. It runs only on web.whatsapp.com and keeps everything on your computer.

WHAT IT DOES
• Copy a whole message in one click. Hover a message and click the copy button beside it. You get the full text on your clipboard, with line breaks and emoji. "Read more" is expanded first, and the time and read ticks are left out.
• Hide the clutter. Turn off Status, Channels, Communities, Meta AI, and the emoji, GIF and sticker buttons. Each has its own switch, and the unread dot goes away with its button.
• Optional privacy tools, all off by default: blur names, photos, previews or the open chat (hover to reveal), pin chats locally, and block read receipts.

PRIVACY
• 100% offline. No account, no analytics, no tracking, no server. The extension makes no network requests.
• It can only access web.whatsapp.com.
• Settings stay on your device. Message text is never saved unless you switch on the experimental recovery option. It is off by default and explained right next to its switch.
• Open source (MIT). Code, privacy policy and issue tracker: https://github.com/DhananjayBhosale/private-wa-tools

GOOD TO KNOW
• Blocking read receipts keeps chats unread on every linked device, including your phone, while it is on.
• Deleted-message recovery is experimental and does not work yet. Help is welcome on GitHub.
• Unofficial. Not affiliated with, endorsed by, or connected to WhatsApp or Meta. WhatsApp is a trademark of its owner.
```

**Images** (this folder):
- Store icon 128x128: `store-icon-128.png`
- Small promo tile 440x280: `promo-small-440x280.png`
- Screenshot 1280x800: `screenshot-1-1280x800.png` (the real settings panel)
- Add 2 to 3 real screenshots (1280x800) taken in a **test chat with made-up messages**: the copy button beside a message, and the left rail before and after hiding Status and Channels. Never use a real chat.

**Homepage URL:** https://github.com/DhananjayBhosale/private-wa-tools
**Support URL:** https://github.com/DhananjayBhosale/private-wa-tools/issues

## Privacy tab

**Single purpose:**
Make WhatsApp Web cleaner and more private by letting users copy whole messages in one click and hide interface buttons, with optional local-only privacy settings.

**Permission justifications:**
- Host permission `https://web.whatsapp.com/*`: runs the content script that adds the copy button, hides buttons and applies blur on WhatsApp Web only.
- `storage`: keeps the user's settings on the device, plus the optional pin list and the optional saved message text if the user turns recovery on.
- `clipboardWrite`: puts the message text on the clipboard when the user clicks the copy button.
- `offscreen`: writes to the clipboard from an offscreen document when the page blocks it.

**Remote code:** No. All code is in the package.

**Data usage:** Google's FAQ says data handled only on the device must still be disclosed. Tick **Personal communications** (message text is read when the user clicks copy, and saved only if the user turns recovery on) and **Website content**. Leave the rest unticked. The dashboard's own definitions decide; read them as you tick.

**Certifications:** all three can be ticked: not sold, not used for unrelated purposes, not used for creditworthiness or lending.

**Privacy policy URL:** https://github.com/DhananjayBhosale/private-wa-tools/blob/main/PRIVACY.md (includes the Limited Use statement Google requires).

## Distribution tab

Free. Public (or Unlisted for a soft launch). All regions.

## Test instructions tab

```
The extension runs only on https://web.whatsapp.com, which needs a WhatsApp account linked by QR code, so a test login cannot be supplied.
To check it: install, click the toolbar icon to see the settings panel. In WhatsApp Web, hover any message to see the copy button beside it. Tick Status or Channels in the panel and the matching buttons disappear from the left rail.
The extension makes no network requests. Source and tests: https://github.com/DhananjayBhosale/private-wa-tools (npm test runs an automated check that fails if a network call is added).
```

A short demo video linked in the listing makes review easier.

## What only the account owner can do

1. Register at https://chrome.google.com/webstore/devconsole. One-time fee, $5. The account email cannot be changed later, so use a dedicated one.
2. Turn on 2-Step Verification (required before publishing).
3. Declare trader or non-trader status. A free hobby project is normally non-trader. That is your call. Traders must give an address and phone number that are shown publicly.
4. Add new item, upload the zip, fill each tab from this file, submit for review.
5. After approval, add the store link to the README.

A new publisher can have at most two published extensions at first.

## Review risks

- **Single purpose.** The extension bundles several features. The purpose above frames them as one idea. If it is rejected on this ground, the fallback is a store build without pins and recovery.
- **Personal communications.** Handled and disclosed. Recovery is opt-in with the disclosure next to the switch, because Google requires prominent in-product disclosure of data collection.
- **Name and trademark.** The name uses "WA", not "WhatsApp", and the listing says it is unofficial. A trademark complaint from the brand owner is still possible.
- **Testing.** Reviewers cannot log in to WhatsApp. The test instructions and a demo video are the mitigation.
