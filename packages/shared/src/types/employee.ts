import { Role } from '../enums/role';
import { EmployeeStatus } from '../enums/employee-status';

export interface EmployeeProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  role: Role;
  status: EmployeeStatus;
  joinDate?: string; // ISO string
  departmentId?: string;
  positionId?: string;
  managerId?: string;
  defaultShiftId?: string;
}
