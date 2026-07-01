import { NestFactory } from "@nestjs/core";
import "reflect-metadata";
import { AppModule } from "./app.module";
import { assertSafeEnvironment } from "./environment";

async function bootstrap() {
  assertSafeEnvironment();
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
  console.log(`MiniCal running at http://localhost:${port}`);
}

void bootstrap();
