import type { ThemeConfig } from 'antd';

export const themeConfig: ThemeConfig = {
  token: {
    // Màu sắc chủ đạo (Deep Emerald / Forest Green) từ bản thiết kế
    colorPrimary: '#059669',
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorInfo: '#0d9488',

    // Kiểu chữ & Kích thước
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
    fontSize: 14,
    borderRadius: 8,

    // Màu nền & Đường viền
    colorBgLayout: '#f8fafc',
    colorBgContainer: '#ffffff',
    colorBorderSecondary: '#e2e8f0',
  },
  components: {
    Button: {
      controlHeight: 38,
      borderRadius: 8,
      fontWeight: 500,
    },
    Card: {
      borderRadiusLG: 12,
      boxShadowTertiary: '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.03)',
    },
    Table: {
      borderRadius: 8,
      headerBg: '#f8fafc',
      headerColor: '#1e293b',
    },
    Menu: {
      darkItemBg: '#0f172a',
      darkItemSelectedBg: '#064e3b',
      darkItemSelectedColor: '#34d399',
      itemBorderRadius: 8,
      itemMarginInline: 10,
    },
    Tag: {
      borderRadiusSM: 6,
    },
  },
};
