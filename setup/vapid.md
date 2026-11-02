# Web Push keys (VAPID), one time per monitor

24.10.2026. These keys let the monitor send a notification straight to the phone
(the home screen app), through the browser's push service. They are made once.
Without them the push channel is off and every notification goes by ntfy and mail,
as before.

## 1. Make the keys (once, anywhere with Node)

    npx web-push generate-vapid-keys

It prints a Public Key and a Private Key.

## 2. Put them where the monitor reads them

- **VAPID_PRIVATE** (secret): only in the listener's environment on the server, next
  to the other secrets of that unit (the systemd unit's `Environment=` or its
  EnvironmentFile). Never in the repository, never in a chat, never in `instance.json`.
- **VAPID_PUBLIC**: the same value goes in the listener's environment as well, and
  build.js reads it from there when it writes the page. It may also go in
  `instance.json` as `"vapidPublic"` (the public key is not a secret). The page shows
  the "התראות לטלפון" box only when this key exists.

Then restart the listener and rebuild the page once (`node build.js`, or the next
normal build), so the box appears in settings.

## 3. Install the package

The channel needs the `web-push` package listed in `package.json`:

    npm install

Run it on the server where the listener runs. Until it is installed, the push channel
reports one clear error and the notification falls back to ntfy, as designed.

## 4. Check it

- Open the page on the phone, from the home screen icon, and press "להפעיל התראות".
  The chat gets one line, and `data/push/subs.json` holds that phone's subscription.
- `node notify.js --budget` shows the shared daily count (push and ntfy share it).

## Rules

- Do not commit `data/push/` (the subscriptions are private, `data/` is ignored).
- Changing the keys makes every phone subscribe again: the old subscriptions stop
  working and the box asks for the button once more.
