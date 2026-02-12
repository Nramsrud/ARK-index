export enum Verbosity {
  Quiet = 0,
  Normal = 1,
  Verbose = 2,
}

let level = Verbosity.Normal;

export function setVerbosity(newLevel: Verbosity): void {
  level = newLevel;
}

export const log = {
  info(message: string): void {
    if (level >= Verbosity.Normal) {
      console.log(message);
    }
  },
  warn(message: string): void {
    if (level >= Verbosity.Normal) {
      console.warn(message);
    }
  },
  error(message: string): void {
    console.error(message);
  },
  verbose(message: string): void {
    if (level >= Verbosity.Verbose) {
      console.log(message);
    }
  },
};
