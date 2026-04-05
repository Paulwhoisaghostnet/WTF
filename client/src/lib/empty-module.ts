// Browser-safe stub for Node built-in modules (http, https, stream, os, etc.)
// Taquito's http-utils does `import { Agent } from 'https'` which doesn't
// exist in the browser. Provide a no-op class so the named import resolves
// and the code never actually constructs one (guarded by isNode check).

export class Agent {
  constructor(_opts?: any) {}
}
export class Server {
  constructor(_opts?: any) {}
}
export function createServer() {
  return new Server();
}
export function request() {
  return {};
}
export function get() {
  return {};
}
export default {};
