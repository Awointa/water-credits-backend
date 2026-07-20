import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { verifyWsToken } from '../../common/websockets/ws-jwt.util';

@WebSocketGateway({
  namespace: 'notifications',
  cors: {
    origin: process.env.NODE_ENV === 'production' ? process.env.CORS_ORIGIN : '*',
  },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  // Map of userId to Socket IDs
  private userSockets: Map<string, string[]> = new Map();

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    const payload = await verifyWsToken(client, this.jwtService, this.logger);
    if (!payload) {
      client.disconnect(true);
      return;
    }

    // userId is derived solely from the verified JWT `sub` claim — never from
    // client-supplied query params, which previously allowed impersonation.
    const userId = payload.sub;
    client.data.userId = userId;

    const sockets = this.userSockets.get(userId) || [];
    sockets.push(client.id);
    this.userSockets.set(userId, sockets);
    this.logger.log(`Client connected: ${client.id} (User: ${userId})`);
    client.join(`user:${userId}`);
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (userId) {
      const sockets = this.userSockets.get(userId) || [];
      const index = sockets.indexOf(client.id);
      if (index !== -1) {
        sockets.splice(index, 1);
        if (sockets.length === 0) {
          this.userSockets.delete(userId);
        } else {
          this.userSockets.set(userId, sockets);
        }
      }
      this.logger.log(`Client disconnected: ${client.id} (User: ${userId})`);
    } else {
      this.logger.log(`Client disconnected: ${client.id}`);
    }
  }

  sendToUser(userId: string, event: string, data: Record<string, unknown>) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  broadcast(event: string, data: Record<string, unknown>) {
    this.server.emit(event, data);
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket, data: Record<string, unknown>) {
    return { event: 'pong', data };
  }
}
