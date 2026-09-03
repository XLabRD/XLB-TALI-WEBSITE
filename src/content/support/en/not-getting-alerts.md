---
title: I'm not getting alerts
summary: Check the zone armed, then the tier, the notification permission and Focus modes — in that order.
section: fix
category: app
order: 20
---

Alerts come in two kinds, and knowing which one you are missing points straight
at the fix.

## Local alerts

These appear on the Tali screen itself, are included with every device for life,
and do not need the cloud or your phone. If these are not firing, the thresholds
are the place to look — see below.

## Remote alerts

These are the ones that find you when you are not in the room, and they are part
of **Cloud Pro** — included for two years with the Founders Edition. They need
three things to line up:

- **The device online.** A Tali off the network cannot tell anyone anything.
- **Notification permission.** Check Tali in your phone's notification settings;
  permission is easy to dismiss during setup and invisible afterwards.
- **Focus modes.** A Do Not Disturb or Focus schedule will hold notifications
  silently, which looks exactly like not receiving them.

## Nothing has alerted since I set the thresholds

Check this first on a new setup. A zone's alerts stay **disarmed** until the Puk
reads a value *inside* the range you set — so a zone that has been out of range
since the moment you saved its limits has never armed, and will stay quiet.

Widen the range until the current reading falls inside it. Once it lands in
range the alerts arm themselves and you can tighten again. There is more in
[what kinds of alerts will I get?](/support/alert-types/)

## Testing that alerts work

Because of the arming behaviour above, the order matters:

1. **Check the zone is currently in range.** That is what arms it.
2. **Narrow one limit** so the current reading falls just outside.
3. **Confirm you are told.**
4. **Put the limit back.**

Do it the other way around — narrowing first, so the reading was never in range
— and nothing happens, which tells you nothing. It is worth knowing your alerts
work before you need them to.
