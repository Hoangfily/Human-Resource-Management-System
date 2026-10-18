import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserRole } from '@hr-agent/shared';
import { User, LoginCredentials } from '../../types';
import { authStorage } from '../../lib/auth-storage';
import { MOCK_USERS, isMockEnabled } from '../../lib/mock-data';
import apiClient from '../../lib/api-client';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<boolean>;
  loginAsDemoRole: (roleKey: 'employee' | 'manager' | 'hrAdmin' | 'admin') => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Khôi phục phiên đăng nhập từ localStorage khi khởi động
    const storedUser = authStorage.getUser();
    const token = authStorage.getAccessToken();

    if (storedUser && token) {
      setUser(storedUser);
    } else {
      // Mặc định đăng nhập nhân viên demo nếu đang ở chế độ mock
      if (isMockEnabled()) {
        const defaultUser = MOCK_USERS.employee;
        authStorage.setUser(defaultUser);
        authStorage.setAccessToken('mock_token_employee_001');
        setUser(defaultUser);
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (credentials: LoginCredentials): Promise<boolean> => {
    setIsLoading(true);
    try {
      // 1. Ưu tiên gọi API Backend NestJS thật
      const response = await apiClient.post<{ user: User; tokens: { accessToken: string } }>(
        '/auth/login',
        credentials
      );

      // Lưu trữ thông tin đăng nhập từ backend
      const authData = response as unknown as { user: User; tokens: { accessToken: string } };
      if (authData?.tokens?.accessToken) {
        authStorage.setAccessToken(authData.tokens.accessToken);
        authStorage.setUser(authData.user);
        setUser(authData.user);
        setIsLoading(false);
        return true;
      }
      setIsLoading(false);
      return false;
    } catch {
      // 2. Khi API lỗi hoặc offline, nếu bật mock thì tự fallback
      if (isMockEnabled()) {
        let matchedUser = Object.values(MOCK_USERS).find((u) => u.email === credentials.email);
        if (!matchedUser) {
          matchedUser = {
            id: 'emp-custom',
            email: credentials.email,
            fullName: credentials.email.split('@')[0],
            role: UserRole.Employee,
            departmentName: 'Phòng Kỹ thuật',
            positionName: 'Nhân viên',
          };
        }
        authStorage.setUser(matchedUser);
        authStorage.setAccessToken(`mock_token_${matchedUser.id}`);
        setUser(matchedUser);
        setIsLoading(false);
        return true;
      }
      setIsLoading(false);
      return false;
    }
  };

  const loginAsDemoRole = async (
    roleKey: 'employee' | 'manager' | 'hrAdmin' | 'admin',
  ): Promise<boolean> => {
    const emailMap: Record<string, string> = {
      employee: 'an.nguyen@company.com',
      manager: 'bich.tran@company.com',
      hrAdmin: 'cuong.le@company.com',
      admin: 'admin@company.com',
    };
    const email = emailMap[roleKey];
    if (email) {
      return login({ email, password: 'password123' });
    }
    const demoUser = MOCK_USERS[roleKey];
    authStorage.setUser(demoUser);
    authStorage.setAccessToken(`mock_token_${demoUser.id}`);
    setUser(demoUser);
    return true;
  };

  const logout = () => {
    apiClient.post('/auth/logout', {}).catch(() => {});
    authStorage.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        loginAsDemoRole,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
