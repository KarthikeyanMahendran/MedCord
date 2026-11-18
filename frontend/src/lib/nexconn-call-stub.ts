/**
 * Stub for @nexconn/call — used when the real Nexconn SDK is not installed.
 * All methods are no-ops so the app boots without errors; call features will
 * simply be unavailable until the real package is provided.
 */

export enum NCCallEndReason {
  NO_ANSWER = 'NO_ANSWER',
  MISSED = 'MISSED',
  DECLINED = 'DECLINED',
  CANCELED = 'CANCELED',
  FAILED = 'FAILED',
}

export enum NCCallCode {
  SUCCESS = 0,
}

export enum NCCallVideoResolution {
  RESOLUTION_1280X720 = '1280x720',
}

export enum NCCallVideoFrameRate {
  FPS_24 = 24,
}

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
