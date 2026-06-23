import { Module } from "@nestjs/common";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { DatabaseService } from "./database.service";
import { MockTelegramLogger } from "./mock-telegram.logger";

@Module({
  controllers: [BookingsController],
  providers: [DatabaseService, BookingsService, MockTelegramLogger]
})
export class AppModule {}
