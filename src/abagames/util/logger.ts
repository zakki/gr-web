/*
 * $Id: logger.d,v 1.1.1.1 2004/11/10 13:45:22 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

/**
 * Logger(error/info).
 */
export class Logger {
  public static info(msg: string, nline = true): void {
    if (nline) console.info(msg);
    else process.stderr.write(msg);
  }

  public static infoNumber(n: number, nline = true): void {
    if (nline) console.info(String(n));
    else process.stderr.write(`${n} `);
  }

  public static error(msg: string | Error): void {
    // Note: Web/Node port intentionally uses console output instead of platform dialog APIs.
    if (typeof msg === "string") {
      console.error(`Error: ${msg}`);
      return;
    }
    console.error(`Error: ${msg.toString()}`);
  }
}
