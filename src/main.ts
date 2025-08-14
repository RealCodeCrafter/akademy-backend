import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common'; // Logger @nestjs/common dan
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.use(bodyParser.json({ type: ['application/json', 'application/jwt'] }));
  app.use(bodyParser.text({ type: ['text/plain', 'text/plain; charset=utf-8'] }));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: '*',
    credentials: true,
  });

  await app.listen(7000, '0.0.0.0');
  logger.log('Application started on port 7000');
}
bootstrap();