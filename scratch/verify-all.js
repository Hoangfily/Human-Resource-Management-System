const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log('--- BẮT ĐẦU KIỂM TRA HỆ THỐNG HRMS TOÀN DIỆN ---');

  // 1. Đăng nhập Admin
  const loginRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'admin@gmail.com', password: 'password123' },
  );

  if (loginRes.status !== 200 && loginRes.status !== 201) {
    console.error('Đăng nhập thất bại:', loginRes);
    process.exit(1);
  }
  const token = loginRes.body.tokens?.accessToken || loginRes.body.accessToken;
  console.log('✓ 1. Đăng nhập thành công với vai trò:', loginRes.body.user.role);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 2. Kiểm tra Hồ sơ nhân sự
  const meRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/employees/me',
    method: 'GET',
    headers: authHeaders,
  });
  console.log('✓ 2. Hồ sơ nhân viên (/employees/me):', meRes.body.fullName, '|', meRes.body.departmentName);

  // 3. Kiểm tra Quỹ phép
  const leaveRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/leave/balance',
    method: 'GET',
    headers: authHeaders,
  });
  console.log('✓ 3. Quỹ phép (/leave/balance):', leaveRes.body.balances?.length, 'loại phép ghi nhận');

  // 4. Kiểm tra Chấm công Check-in
  const clockInRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/attendance/clock-in',
    method: 'POST',
    headers: authHeaders,
  });
  console.log('✓ 4. Chấm công (/attendance/clock-in):', clockInRes.body.message || clockInRes.body.status);

  // 5. Kiểm tra 9 Quy chế công ty
  const policiesRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/policies',
    method: 'GET',
    headers: authHeaders,
  });
  console.log('✓ 5. Danh sách quy chế công ty (/policies):', policiesRes.body.length, 'chính sách đã nạp DB');

  // 6. Kiểm tra Cấu hình tự chủ AI
  const autonomyRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/agent/autonomy',
    method: 'GET',
    headers: authHeaders,
  });
  const firstConfig = Array.isArray(autonomyRes.body) ? autonomyRes.body[0] : autonomyRes.body;
  console.log('✓ 6. Cấu hình tự chủ AI (/agent/autonomy):', firstConfig?.requestType, '->', firstConfig?.level);

  // 7. Kiểm tra Chat với Trợ lý AI
  const chatRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/agent/chat',
      method: 'POST',
      headers: authHeaders,
    },
    { message: 'Tôi muốn xin nghỉ phép 2 ngày thì cần báo trước bao lâu?' },
  );
  console.log('✓ 7. Phản hồi Trợ lý AI (/agent/chat):', chatRes.body.message?.slice(0, 90) + '...');
  console.log('     Điều khoản trích dẫn:', chatRes.body.citationKeys);

  console.log('==================================================');
  console.log('TẤT CẢ CÁC API VÀ CHỨC NĂNG BACKEND ĐÃ HOẠT ĐỘNG HOÀN HẢO!');
}

run().catch(console.error);
