import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { ApiErrorResponse } from '../types';
import { authStorage } from './auth-storage';

// Base URL lấy từ biến môi trường Vite, mặc định theo docs/01-api-contract.md là /api/v1
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '')}/api/v1`
  : 'http://localhost:3000/api/v1';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Tự động đính kèm Bearer token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = authStorage.getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Chuẩn hóa dữ liệu và xử lý lỗi tập trung
apiClient.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error: AxiosError<ApiErrorResponse>) => {
    // 401 Unauthorized: Hết hạn phiên đăng nhập
    if (error.response?.status === 401) {
      authStorage.clear();
      // Nếu không ở trang login thì điều hướng về /login
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }

    // Chuẩn hóa cấu trúc lỗi theo docs/01-api-contract.md
    const serverError = error.response?.data;
    const formattedError: ApiErrorResponse = {
      code: serverError?.code || `HTTP_${error.response?.status || 'UNKNOWN'}`,
      message:
        serverError?.message ||
        error.message ||
        'Đã xảy ra lỗi không xác định từ máy chủ.',
      details: serverError?.details,
      requestId: serverError?.requestId,
    };

    return Promise.reject(formattedError);
  }
);

export default apiClient;
