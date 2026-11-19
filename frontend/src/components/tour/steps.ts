import type { Me } from '../../api/auth'

export interface TourStep {
  /** CSS selector of the element to spotlight. Omit for a centred card. */
  target?: string
  title: string
  body: string
  /** Optional small legend rendered under the body. */
  legend?: 'urgency'
}

export type TourRole = 'worker' | 'doctor' | 'admin'

export function roleOf(user: Me | null): TourRole {
  if (user?.platformRole === 'ADMIN') return 'admin'
  if (user?.verificationStatus === 'APPROVED') return 'doctor'
  return 'worker'
}

const AI: TourStep = {
  target: '.mc-ai-launcher',
  title: 'Ask MedCord AI',
  body: 'Stuck on a term or a guideline? Ask the assistant. It answers from the shared knowledge base and shows its sources.',
}

const URGENCY: TourStep = {
  title: 'Three colours, one meaning',
  body: 'Every case is rated automatically when it is sent. This is a safety alert, not a diagnosis.',
  legend: 'urgency',
}

const RADAR: TourStep = {
  target: '[aria-label="Outbreak radar"]',
  title: 'Outbreak radar',
  body: 'The app watches every case. When 3 or more similar cases appear in one area within 3 days, it raises an alert here with a map and what to do.',
}

export const STEPS: Record<TourRole, TourStep[]> = {
  worker: [
    { title: 'Welcome to Case Rooms', body: 'You will never face a hard case alone. Send a patient case to a verified doctor and chat about it in a private room. This 1-minute tour shows you how.' },
    { target: '[aria-label="Case rooms"]', title: 'Start here', body: 'Open Case rooms, then tap New case. You can speak, type, or tap a symptom. Add vitals if you have them. It works even with no signal and sends later.' },
    URGENCY,
    { target: '[aria-label="Direct messages"]', title: 'Talk to colleagues', body: 'Message a doctor or another health worker one to one. Use this for questions that are not a case.' },
    { target: '[aria-label="Verified answer library"]', title: 'Answers you can reuse', body: 'Every doctor answer is saved here. Search it first. Someone may have already solved a case like yours.' },
    RADAR,
    AI,
    { title: 'You are ready', body: 'Tap New case to send your first one. You can replay this tour any time from the help button at the bottom of the left bar. Use test data only.' },
  ],
  doctor: [
    { title: 'Welcome, doctor', body: 'Health workers in remote areas send you cases. You see a clean summary, accept the ones you can help with, and answer in a private room.' },
    { target: '[aria-label="Case rooms"]', title: 'Your queue', body: 'Open Case rooms. Switch on Go on duty so you are notified. The Waiting tab lists open cases, most urgent first. Accept one to claim it.' },
    URGENCY,
    { target: '[aria-label="Verified answer library"]', title: 'Answer once, help many', body: 'When you post a verified answer, it joins the library. The next worker with a similar case gets help in seconds. A 24-hour follow-up checks on the patient.' },
    { target: '[aria-label="Impact"]', title: 'See your impact', body: 'Watch where help is reaching and how fast cases get a doctor.' },
    RADAR,
    AI,
    { title: 'You are ready', body: 'Go on duty from Case rooms to start receiving cases. Replay this tour any time from the help button in the left bar.' },
  ],
  admin: [
    { title: 'Welcome, admin', body: 'You keep the programme safe and moving: verify doctors, watch urgent cases and see the impact.' },
    { target: '[aria-label="Verification queue"]', title: 'Verify doctors', body: 'Only verified doctors can answer cases. Review each licence here before approving.' },
    { target: '[aria-label="Case rooms"]', title: 'Watch the cases', body: 'Urgent cases that nobody accepts are escalated to you after the timer runs out.' },
    URGENCY,
    { target: '[aria-label="Impact"]', title: 'Show the impact', body: 'Cases by area, response times and a 14-day trend. Good for reports and demos.' },
    RADAR,
    { title: 'You are ready', body: 'Replay this tour any time from the help button in the left bar.' },
  ],
}

export const tourKey = (userId: string) => `mc_tour_done_${userId}`
export const START_TOUR_EVENT = 'mc:start-tour'
