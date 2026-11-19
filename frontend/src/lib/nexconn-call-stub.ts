/**
 * Stub for @nexconn/call — used when the real Nexconn SDK is not installed.
 * All methods are no-ops so the app boots without errors; call features will
 * simply be unavailable until the real package is provided.
 */

export const NCCallEndReason = {
  NO_ANSWER: 'NO_ANSWER',
  MISSED: 'MISSED',
  DECLINED: 'DECLINED',
  CANCELED: 'CANCELED',
  FAILED: 'FAILED',
} as const
export type NCCallEndReason = typeof NCCallEndReason[keyof typeof NCCallEndReason]

export const NCCallCode = {
  SUCCESS: 0,
} as const
export type NCCallCode = typeof NCCallCode[keyof typeof NCCallCode]

export const NCCallVideoResolution = {
  RESOLUTION_1280X720: '1280x720',
} as const
export type NCCallVideoResolution = typeof NCCallVideoResolution[keyof typeof NCCallVideoResolution]

export const NCCallVideoFrameRate = {
  FPS_24: 24,
} as const
export type NCCallVideoFrameRate = typeof NCCallVideoFrameRate[keyof typeof NCCallVideoFrameRate]

export type NCCallEventHandler = Record<string, unknown>
export type NCCallEngine = typeof NCCallEngineStub

const NCCallEngineStub = {
  install: () => {},
  initialize: (_opts: Record<string, unknown>) => NCCallEngineStub,
  setCallEventHandler: (_handler: NCCallEventHandler) => NCCallEngineStub,
  connect: async (_opts: Record<string, unknown>): Promise<{ code: NCCallCode }> => ({ code: NCCallCode.SUCCESS }),
  disconnect: async () => {},
  startCall: async (_opts: Record<string, unknown>): Promise<{ code: NCCallCode; callId?: string; busyLineUserList?: unknown[] }> => ({ code: NCCallCode.SUCCESS }),
  acceptCall: async (_opts: Record<string, unknown>): Promise<{ code: NCCallCode }> => ({ code: NCCallCode.SUCCESS }),
  declineCall: async (_opts: Record<string, unknown>): Promise<{ code: NCCallCode }> => ({ code: NCCallCode.SUCCESS }),
  endCall: async (_opts: Record<string, unknown>): Promise<{ code: NCCallCode }> => ({ code: NCCallCode.SUCCESS }),
  muteLocalMicrophone: async (_opts: { muted: boolean }) => ({ code: NCCallCode.SUCCESS }),
  enableLocalCamera: async (_opts: { enabled: boolean }) => ({ code: NCCallCode.SUCCESS }),
  CallVideoConfig: {
    newBuilder: () => ({
      setResolution: (_r: NCCallVideoResolution) => ({
        setFrameRate: (_fps: NCCallVideoFrameRate) => ({
          build: () => ({}),
        }),
      }),
    }),
  },
}

export const NCCallEngine = NCCallEngineStub
