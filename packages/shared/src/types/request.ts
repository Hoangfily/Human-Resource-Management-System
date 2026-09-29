import type { RequestStatus, RequestType } from '../index';

export interface RequestSummary {
  id: string;
  type: RequestType;
  status: RequestStatus;
  createdAt: string;
}
