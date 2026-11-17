import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // Đọc apps/api/.env một cách tường minh (không ghi đè biến đã có sẵn, nên Docker/CI dùng biến môi trường).
  // Trước đây chỉ nhờ Prisma tình cờ nạp .env khi khởi tạo: sinh lại client từ thư mục gốc là mất.
  try {
    process.loadEnvFile();
  } catch {
    /* Không có file .env: dùng biến môi trường của tiến trình */
  }

  const app = await NestFactory.create(AppModule);
  app.enableCors();
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

