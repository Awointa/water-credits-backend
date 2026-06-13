import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: any,
  ): Promise<Notification> {
    const notification = this.notificationRepository.create({
      userId,
      type,
      title,
      message,
      metadata,
    });

    const savedNotification = await this.notificationRepository.save(notification);

    // Emit via WebSocket
    this.notificationsGateway.sendToUser(userId, type, {
      id: savedNotification.id,
      title,
      message,
      metadata,
      createdAt: savedNotification.createdAt,
    });

    return savedNotification;
  }

  async getNotifications(userId: string, limit: number = 20, offset: number = 0) {
    return this.notificationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    return this.notificationRepository.update(
      { id: notificationId, userId },
      { isRead: true },
    );
  }

  async markAllAsRead(userId: string) {
    return this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
  }

  // Broadcasters for specific events as requested in Day 9
  async notifySensorReading(userId: string, projectId: string, reading: any) {
    return this.createNotification(
      userId,
      NotificationType.SENSOR_READING,
      'New Sensor Reading',
      `Project ${projectId} received a new reading.`,
      { projectId, reading },
    );
  }

  async notifyCreditMinted(userId: string, projectId: string, amount: number) {
    return this.createNotification(
      userId,
      NotificationType.CREDIT_MINTED,
      'Credits Minted',
      `Successfully minted ${amount} credits for project ${projectId}.`,
      { projectId, amount },
    );
  }

  async notifyCreditRetired(userId: string, projectId: string, amount: number) {
    return this.createNotification(
      userId,
      NotificationType.CREDIT_RETIRED,
      'Credits Retired',
      `Successfully retired ${amount} credits for project ${projectId}.`,
      { projectId, amount },
    );
  }
}
