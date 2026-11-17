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
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
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

    // Chỉ khôi phục phiên nếu token hợp lệ (không phải mock token cũ chưa đăng nhập)
    if (storedUser && token && !token.startsWith('mock_token_')) {
      setUser(storedUser);
    } else {
      if (token?.startsWith('mock_token_')) {
        authStorage.clear();
      }
      setUser(null);
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
    } catch (err) {
      // 2. Chỉ máy phát triển, khi không kết nối được API (không có phản hồi), mới được dùng dữ liệu mock.
      // Sai mật khẩu (401) hay tài khoản bị khóa (429) phải là lỗi thật: không được "đăng nhập giả" thay thế.
      const unreachable = (err as { code?: string })?.code === 'HTTP_UNKNOWN';
      if (import.meta.env.DEV && unreachable && isMockEnabled()) {
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
      throw err; // Giữ nguyên thông báo của API (vd: tài khoản tạm khóa) để trang đăng nhập hiển thị
    }
  };

  const loginAsDemoRole = async (
    roleKey: 'employee' | 'manager' | 'hrAdmin' | 'admin',
  ): Promise<boolean> => {
    const emailMap: Record<string, string> = {
      employee: 'minhphong@gmail.com',
      manager: 'tiendung@gmail.com',
      hrAdmin: 'huyhoang@gmail.com',
      admin: 'admin@gmail.com',
    };
    const email = emailMap[roleKey];
    // Mật khẩu mẫu chỉ có trong bản chạy phát triển (khớp SEED_PASSWORD mặc định của apps/api/prisma/seed.ts);
    // bản production không chứa nó và nút đăng nhập nhanh bị ẩn.
    if (import.meta.env.DEV && email) {
      return login({ email, password: 'Demo@12345' });
    }
    return false;
  };

  // Đổi mật khẩu: API thu hồi mọi phiên cũ và trả token mới cho phiên hiện tại
  const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    const response = (await apiClient.post('/auth/change-password', { currentPassword, newPassword })) as unknown as {
      tokens: { accessToken: string };
    };
    authStorage.setAccessToken(response.tokens.accessToken);
    if (user) {
      const updated = { ...user, mustChangePassword: false };
      authStorage.setUser(updated);
      setUser(updated);
    }
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
        changePassword,
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
