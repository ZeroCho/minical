import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";

@Injectable()
export class MockTelegramLogger {
  private readonly logFile: string;

  constructor() {
    const logDir = process.env.MINICAL_LOG_DIR ?? path.join(process.cwd(), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    this.logFile = path.join(logDir, "telegram_mock.log");
  }

  write(message: string) {
    fs.appendFileSync(this.logFile, `[${formatNow()}] ${message}\n`, "utf8");
  }
}

export function formatNow(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds())
  ].join("");
}
