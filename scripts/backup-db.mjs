// Sao lưu Postgres của bản production ra backups/hr-<ngày-giờ>.sql.gz (pg_dump, nén gzip).
//
//   npm run prod:backup
//
// Khôi phục vào DB TRỐNG (vd: máy mới sau `npm run prod:up`, trước khi có dữ liệu):
//   gunzip -c backups/hr-....sql.gz | docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres psql -U hr_agent -d hr_agent
//   (Windows PowerShell: dùng 7-Zip hoặc `tar -xzf` để giải nén rồi `Get-Content file.sql | docker compose ... exec -T postgres psql ...`)
//
// File sao lưu chứa toàn bộ dữ liệu nhân sự, mật khẩu đã băm (bcrypt) VÀ refresh token của các phiên đang đăng nhập
// (lưu nguyên văn trong DB): ai có file này dùng được phiên đó tới khi hết hạn (7 ngày). Cất nơi an toàn, đừng commit
// (backups/ nằm trong .gitignore). Khôi phục sự cố bảo mật: đổi JWT_REFRESH_SECRET để thu hồi mọi phiên.
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, rmSync } from 'node:fs';
import { createGzip } from 'node:zlib';

const envFile = process.env.ENV_FILE || '.env.production';
const user = process.env.POSTGRES_USER || 'hr_agent';
const db = process.env.POSTGRES_DB || 'hr_agent';

mkdirSync('backups', { recursive: true });
const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
const out = `backups/hr-${stamp}.sql.gz`;

const dump = spawn(
  'docker',
  ['compose', '-f', 'docker-compose.prod.yml', '--env-file', envFile, 'exec', '-T', 'postgres', 'pg_dump', '-U', user, '-d', db, '--no-owner'],
  { stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32' },
);

const file = createWriteStream(out);
dump.stdout.pipe(createGzip()).pipe(file);

let exitCode = 1;
dump.on('exit', (code) => {
  exitCode = code ?? 1;
});
file.on('finish', () => {
  if (exitCode !== 0) {
    rmSync(out, { force: true }); // Không để lại file sao lưu dở dang trông như thật
    console.error(`pg_dump thất bại (mã ${exitCode}). Dịch vụ đang chạy chưa? Kiểm tra: npm run prod:logs`);
    process.exit(exitCode);
  }
  console.log(`Đã sao lưu: ${out}`);
});
