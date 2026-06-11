import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

const PROJECT_PREFIX = 'project:';

@WebSocketGateway({
  namespace: '/sensors',
  cors: { origin: '*', credentials: true },
})
export class SensorsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SensorsGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    const rooms = Array.from(client.rooms).filter((r) => r !== client.id);
    for (const room of rooms) {
      client.leave(room);
    }
  }

  @SubscribeMessage('subscribe:project')
  handleSubscribeProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() projectId: string,
  ): void {
    const room = `${PROJECT_PREFIX}${projectId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} subscribed to project ${projectId}`);
  }

  @SubscribeMessage('unsubscribe:project')
  handleUnsubscribeProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() projectId: string,
  ): void {
    const room = `${PROJECT_PREFIX}${projectId}`;
    client.leave(room);
    this.logger.log(`Client ${client.id} unsubscribed from project ${projectId}`);
  }

  emitReading(projectId: string, reading: any): void {
    this.server.to(`${PROJECT_PREFIX}${projectId}`).emit('sensor:reading', reading);
  }

  emitAlert(projectId: string, alert: any): void {
    this.server.to(`${PROJECT_PREFIX}${projectId}`).emit('sensor:alert', alert);
  }
}
