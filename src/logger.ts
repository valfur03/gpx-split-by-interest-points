export class Logger {
  constructor(private readonly level = 2) {}

  debug(...args: Parameters<typeof console.debug>) {
    return console.debug(...args);
  }

  log(...args: Parameters<typeof console.log>) {
    return console.log(...args);
  }

  error(...args: Parameters<typeof console.error>) {
    return console.error(...args);
  }
}
