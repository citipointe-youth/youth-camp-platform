import type { ID, ISODateString } from '../types/common';
import type { NotificationScope, NotificationPriority, UserRole } from '../types/enums';

export interface Notification {
  id: ID;
  scope: NotificationScope;
  zone?: string | null;
  churchId?: string | null;
  priority: NotificationPriority;
  title: string;
  body: string;
  senderId: ID;
  senderName: string;
  senderRole: UserRole;
  audienceEstimate: number;
  expiresAt?: ISODateString | null;
  createdAt: ISODateString;
}
