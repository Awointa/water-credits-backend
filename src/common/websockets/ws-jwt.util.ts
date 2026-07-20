import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

export interface WsJwtPayload {
  sub: string;
  wallet: string;
  role: string;
}

/**
 * Pulls the bearer token from a WebSocket handshake. Only `auth.token` (set by
 * socket.io clients via `io(url, { auth: { token } })`) and a standard
 * `Authorization: Bearer <token>` header are honored — never query params,
 * which are logged/cached by proxies and were the source of CVE-worthy
 * impersonation in this gateway.
 */
export function extractWsToken(client: Socket): string | undefined {
  const authToken = client.handshake.auth?.token as string | undefined;
  if (typeof authToken === 'string' && authToken.length > 0) {
    return authToken;
  }

  const header = client.handshake.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }

  return undefined;
}

/**
 * Verifies the handshake JWT and returns its payload, or null if the client
 * did not present a valid token. Callers must disconnect the socket on null.
 */
export async function verifyWsToken(
  client: Socket,
  jwtService: JwtService,
  logger: Logger,
): Promise<WsJwtPayload | null> {
  const token = extractWsToken(client);
  if (!token) {
    logger.warn(`Rejected connection ${client.id}: no auth token presented`);
    return null;
  }

  try {
    return await jwtService.verifyAsync<WsJwtPayload>(token);
  } catch {
    logger.warn(`Rejected connection ${client.id}: invalid or expired token`);
    return null;
  }
}
