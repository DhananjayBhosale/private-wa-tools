# Privacy Model

Private WA Tools is designed as a local-only browser extension.

## Guarantees

- No project backend.
- No analytics.
- No telemetry.
- No remote JavaScript.
- No cloud sync.
- No account or license system.
- No extension-origin `fetch` or XHR calls.

## Local Data

The extension stores these values in `chrome.storage.local`:

- Feature settings.
- Local visual pin list.
- Deleted-message cache for messages observed by the extension before deletion.
- A cache generation number to prevent pending writes from bringing cleared messages back.
- Installation time, local-only privacy marker, and clipboard success/failure diagnostics (without copied message text).

Recovery must be enabled to cache new messages. Turning it off hides recovered text and stops new collection; already saved copies remain until cleared or evicted by the cache limits. Clearing the cache removes saved copies in open tabs as well as persistent storage. The read-receipt guard is off unless you turn it on in the popup; a value stored by an older version is ignored until you opt in. While it is on, WhatsApp Web is told the tab is hidden, so chats you read there stay unread on every linked device, including your phone. The setting is mirrored in WhatsApp Web's local storage so its page script can apply it on reload; that mirrored key stays on WhatsApp's origin if you uninstall the extension, but nothing reads it once the extension is gone.

## Important Limit

WhatsApp Web itself needs WhatsApp's own servers to load and sync messages. This extension does not make WhatsApp offline. The offline guarantee means the extension's features do not depend on our own server or any third-party service.
