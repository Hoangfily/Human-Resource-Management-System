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
  loginAsDemoRole: (roleKey: 'employee' | 'manager' | 'hrAdmin') => void;
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
      // Nếu mock enabled hoặc backend không phản hồi, dùng mock login
      if (isMockEnabled()) {
        let matchedUser = Object.values(MOCK_USERS).find((u) => u.email === credentials.email);
        if (!matchedUser) {
          // Mặc định gán nhân viên nếu nhập email bất kỳ
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

      // Gọi API Backend thật
      const response = await apiClient.post<{ user: User; tokens: { accessToken: string } }>(
        '/auth/login',
        credentials
      );

      // Lưu trữ thông tin
      const authData = response as unknown as { user: User; tokens: { accessToken: string } };
      if (authData.tokens?.accessToken) {
        authStorage.setAccessToken(authData.tokens.accessToken);
        authStorage.setUser(authData.user);
        setUser(authData.user);
        setIsLoading(false);
        return true;
      }
      setIsLoading(false);
      return false;
    } catch {
      // Khi API lỗi, nếu bật mock thì tự fallback
      if (isMockEnabled()) {
        const fallback = MOCK_USERS.employee;
        authStorage.setUser(fallback);
        authStorage.setAccessToken('mock_token_fallback');
        setUser(fallback);
        setIsLoading(false);
        return true;
      }
      setIsLoading(false);
      return false;
    }
  };

  const loginAsDemoRole = (roleKey: 'employee' | 'manager' | 'hrAdmin') => {
    const demoUser = MOCK_USERS[roleKey];
    authStorage.setUser(demoUser);
    authStorage.setAccessToken(`mock_token_${demoUser.id}`);
    setUser(demoUser);
  };

  const logout = () => {
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
