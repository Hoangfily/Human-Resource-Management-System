import type { ThemeConfig } from 'antd';

export const themeConfig: ThemeConfig = {
  token: {
    // Tông màu chủ đạo Deep Forest Emerald từ Screenshot
    colorPrimary: '#0f4c3a',
    colorSuccess: '#16a34a',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    colorInfo: '#0d9488',

    // Kiểu chữ & Kích thước
    fontFamily:
      "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSize: 14,
    borderRadius: 8,

    // Màu nền Warm Ivory Cream từ Screenshot
    colorBgLayout: '#fcfbf7',
    colorBgContainer: '#ffffff',
    colorBorderSecondary: '#eeebe3',
  },
  components: {
    Button: {
      controlHeight: 38,
      borderRadius: 8,
      fontWeight: 600,
    },
    Card: {
      borderRadiusLG: 14,
      boxShadowTertiary: '0 1px 3px rgba(0, 0, 0, 0.04)',
    },
    Table: {
      borderRadius: 10,
      headerBg: '#faf9f5',
      headerColor: '#181816',
    },
    Tag: {
      borderRadiusSM: 6,
    },
  },
};
