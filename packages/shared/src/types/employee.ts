import { Role } from '../enums/role';

export interface EmployeeProfile {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  departmentId?: string;
  positionId?: string;
  managerId?: string;
}
