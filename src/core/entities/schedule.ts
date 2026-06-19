import type { ID, ISODateString } from '../types/common';
import type { ScheduleItemType } from '../types/enums';

export interface ScheduleItem {
  id: ID;
  day: string;
  startTime: string;
  endTime?: string | null;
  title: string;
  location?: string | null;
  type: ScheduleItemType;
  isCheckInPoint: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
