/**
 * Stub for @nexconn/chat — used when the real Nexconn SDK is not installed.
 * All methods are no-ops so the app boots without errors; call features will
 * simply be unavailable until the real package is provided.
 */

export const NCEngine = {
  initialize: (_opts: { appKey: string }) => {},
  connect: async (_opts: { token: string }): Promise<{ code: number }> => ({ code: 0 }),
  disconnect: async () => {},
}
