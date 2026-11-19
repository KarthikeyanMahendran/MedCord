# Submission pack: MedCord · Rural Case Rooms

**Challenge:** Nexconn Build Challenge 2026 (Reskilll) · **Track:** Humanitarian & Social Good · **Team:** NexGen

## One line
A doctor in every village: community health workers send a patient case by voice, a verified doctor answers in a live Nexconn room, and the community helps pay for care.

## Short description (about 100 words)
MedCord Rural Case Rooms connects ASHA and community health workers in remote villages with verified doctors. A worker describes a patient by voice in her own language; the case is triaged in a second, with red-flag warnings, and routed to the right speciality. A doctor accepts it and they talk in a private live room built on the Nexconn Chat SDK, with voice typing, translation and read-aloud in Indian languages. Serious cases can raise money through a community Care Fund, volunteers can help with rides and medicine, and an Outbreak Radar warns when similar cases cluster in one area.

## Problem and impact
- Rural patients are often hours from a doctor; the health worker is the only medical help and has no fast way to reach a specialist or judge urgency.
- Families cannot always afford surgery or medicine.
- Language is a barrier between a village health worker and a specialist.
- Outbreaks go unnoticed because cases are not seen together.

MedCord shortens the time to a doctor, makes every answer reusable for the next worker, and lets the community help.

## How Nexconn is used
- **Chat SDK:** real-time case room conversation between the health worker and the accepting doctor. A server-issued token connects each browser to Nexconn; a direct-channel signal tells the other side a message is waiting, so the screen updates instantly. The label `● Live with Nexconn` shows when connected.
- **Server API:** the backend signs requests and issues Nexconn tokens (`/v4/auth/access-token/issue`).
- **Call SDK:** one-to-one voice and video calls in private messages (tested live on the deployed app), plus the same buttons in the case room, sharing the same connection.
- **Resilience:** PostgreSQL remains the record of every message, so chat degrades to a slow refresh if Nexconn is unreachable.

## Features judges can try (5 minutes)
| Feature | Where |
|---|---|
| Send a case by voice in Tamil, Hindi, Malayalam and more | Patient cases, then New case |
| Automatic SBAR, urgency and red flags | After sending |
| Doctor queue, accept, answer, follow-up | Doctor account, Patient cases |
| Live Nexconn chat, translate and read-aloud | Inside a case room |
| Care Fund with doctor approval and updates | Care Fund (rail) or a community's Care Fund tab |
| Volunteer help (ride, medicine, visit) | Volunteer help |
| Daily check-in and kind words | Daily check-in |
| Outbreak Radar with map and demo simulation | Outbreak radar (admin can simulate an outbreak) |
| Care network map | Care network map |
| Large-text mode, phone layout, microphone on forms | "T" button, resize to a phone, any form |

## Demo script (3 minutes)
1. **Problem (15 s).** A village health worker, the nearest doctor hours away.
2. **Send (35 s).** Sign in as the health worker. Open Patient cases, New case, choose Tamil, tap and speak. Tap *Chest pain*, add SpO2 88, send.
3. **Triage (20 s).** Show the red urgent badge, the red-flag advice and the SBAR summary.
4. **Doctor (40 s).** Second window as the doctor. Accept from the queue. Show `● Live with Nexconn` and send a message; it appears on the other side instantly. Use translate and read-aloud. Post the verified answer.
5. **Care Fund (25 s).** From the case room tap *Raise funds for this patient*. Show the doctor approval, give an amount, post a "how the money was used" update.
6. **Community (20 s).** Volunteer help request and a volunteer taking it; the daily check-in.
7. **Radar (15 s).** Admin: Outbreak radar, *Simulate outbreak*, show the alert on the map.
8. **Close (10 s).** Phone view and large-text mode. Built on Nexconn.

Record this run as a video as a backup in case the network fails on the day.

## Before you present (checklist)
- [ ] Use a **mobile hotspot**: college and office networks block Nexconn.
- [ ] Start the backend and frontend; sign in once on both demo accounts to warm up.
- [ ] Confirm both browsers show `● Live with Nexconn` in a case room.
- [ ] Test one video call right before recording (private message works; also try from a case room).
- [ ] Change the demo admin password if the app will be public.
- [ ] Reset demo data if needed (Outbreak radar, *Reset demo*).

## Honest limits
- Care Fund payments are simulated (no real money moves).
- Doctor verification is a human review of a licence number in the app, not a register lookup.
- Outbreak detection is rule-based decision support, not a diagnosis.
- Case-room calls were added after the last live call test; private-message calls are the verified path.

## Links
- Repository: https://github.com/KarthikeyanMahendran/MedCord
- README with architecture and screenshots: [`README.md`](../README.md)
