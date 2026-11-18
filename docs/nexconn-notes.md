# Nexconn – verified facts (source: docs.nexconn.ai, checked 2026-11-18)

- Rebrand of RongCloud (2026). Console app: "First application". App Key lives in `.env` (`NEXCONN_APP_KEY`); secret in `NEXCONN_APP_SECRET`.
- Web SDK: `npm i @nexconn/engine @nexconn/chat`. `NCEngine.initialize({ appKey })` once; `NCEngine.connect({ token })` once (auto-reconnect). Messages: `NCEngine.addMessageHandler`, history via `BaseChannel.createMessagesQuery` (1–100/page). Offline messages kept 7 days.
- ChatUI Web (`nexconn-chatui-web`) is Lit web components; works in React with `isCustomElement`.
- Channel types: Direct, Group, System, Open, Community (`CommunityChannel` + `CommunitySubChannel`, user groups, private sub-channels; **Pro plan**).
- Server API: all `POST`, base URL per data center (TBD), headers `App-Key`, `Nonce` (≤18 chars, unique), `Timestamp` (ms), `Signature = SHA1(AppSecret + Nonce + Timestamp)`. Return code `0` = success. Server-only.
- Token: `POST /v4/auth/access-token/issue` body `{userId, name, avatarUrl}`.
- Messages: `/v4/{direct|group|community}-channel/message/send`, `.../message/update` (edit), `/v4/message/delete` (recall), metadata set/list/delete under `/v4/channel-type/message/metadata/*`.
- Group: `/v4/group-channel/{create,join,leave,dismiss,member/list,admin/add,...}`; mute/freeze/allowed-sender lists exist for group, community, open.
- Moderation: `/v4/profanity-word/*`, user ban `/v4/user/ban`, console content-safety settings.
- **Not available natively:** threads, edit history, full-text message search → built in MedCord (see ADR 0003).
- Typing indicator: direct channels only. Group member cap 300 default (1,000 Starter, 3,000 Pro).
- Plan: Chat Free trial expires 2026-12-16; "Free Chat Plan" (10K MAU, 1 year) must be activated in console.
- Open: data-center/base URL, Java server SDK Maven coordinates (`nexconn-server-sdk-java`), webhook signature format.
