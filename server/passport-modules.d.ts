declare module "passport-twitter" {
  import type { Strategy as PassportStrategy } from "passport-strategy";
  export class Strategy extends PassportStrategy {
    constructor(options: Record<string, unknown>, verify: (...args: any[]) => void);
  }
}

declare module "passport-discord" {
  import type { Strategy as PassportStrategy } from "passport-strategy";
  export class Strategy extends PassportStrategy {
    constructor(options: Record<string, unknown>, verify: (...args: any[]) => void);
  }
}
