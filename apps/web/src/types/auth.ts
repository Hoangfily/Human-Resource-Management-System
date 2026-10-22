import { UserRole } from '@hr-agent/shared';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  departmentId?: string;
  departmentName?: string;
  positionId?: string;
  positionName?: string;
  avatarUrl?: string;
}

export interface EmployeeProfile extends User {
  employeeCode: string;
  phoneNumber?: string;
  joinedDate: string;
  managerId?: string;
  managerName?: string;
  leaveBalanceRemaining?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export interface LoginCredentials {
  email: string;
  password?: string;
}
