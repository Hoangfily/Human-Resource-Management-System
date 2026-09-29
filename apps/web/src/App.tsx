import { Alert, Typography } from 'antd';

export default function App() {
  return (
    <main style={{ maxWidth: 720, margin: '64px auto', padding: 24 }}>
      <Typography.Title level={2}>HR Agent</Typography.Title>
      <Alert
        type="info"
        showIcon
        message="Web app đã sẵn sàng"
        description="Các màn hình nghiệp vụ sẽ được phát triển trong thư mục features theo API contract."
      />
    </main>
  );
}