import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // Đọc apps/api/.env một cách tường minh (không ghi đè biến đã có sẵn, nên Docker/CI dùng biến môi trường).
  // Trước đây chỉ nhờ Prisma tình cờ nạp .env khi khởi tạo: sinh lại client từ thư mục gốc là mất.
  try {
    process.loadEnvFile();
  } catch {
    /* Không có file .env: dùng biến môi trường của tiến trình */
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(helmet());

  // Chỉ bật khi API đứng sau proxy tin cậy (Caddy): số bước nhảy, ví dụ TRUST_PROXY=1. Nếu API lộ thẳng ra Internet
  // mà bật, người gọi tự khai X-Forwarded-For để né giới hạn số lần gọi.
  const hops = Number(process.env.TRUST_PROXY);
  if (Number.isInteger(hops) && hops > 0) {
    app.set('trust proxy', hops);
  }

  // CORS: danh sách origin cách nhau bằng dấu phẩy. Production cùng origin với web (qua proxy) thì không cần.
  // Máy phát triển không đặt thì cho web chạy ở cổng 5173.
  const configured = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  const devDefault = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const origins = configured?.length ? configured : process.env.NODE_ENV === 'production' ? [] : devDefault;
  app.enableCors({ origin: origins.length ? origins : false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Backend API is running on http://localhost:${port}/api/v1`);
}

void bootstrap();

