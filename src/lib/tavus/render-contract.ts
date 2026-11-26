export const renderRoomDurationSeconds = 120;
export const scopeIdPattern = /^[a-f0-9]{64}$/;
export const requestIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const conversationIdPattern = /^c[A-Za-z0-9_-]{1,63}$/;

export type RenderRoom = {
  requestId: string;
  conversationId: string;
  conversationUrl: string;
  meetingToken: string;
};

export function readRenderRoom(input: unknown): RenderRoom | null {
  if (!input || typeof input !== "object") return null;
  const room = input as Record<string, unknown>;
  const { requestId, conversationId, conversationUrl, meetingToken } = room;
  if (typeof requestId !== "string" || !requestIdPattern.test(requestId) ||
      typeof conversationId !== "string" || !conversationIdPattern.test(conversationId) ||
      conversationUrl !== "https://tavus.daily.co/" + conversationId ||
      typeof meetingToken !== "string" || meetingToken.length > 4096 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(meetingToken)) return null;
  return { requestId, conversationId, conversationUrl, meetingToken };
}
