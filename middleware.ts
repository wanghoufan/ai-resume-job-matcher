// Next.js 15 executes middleware.ts; the shared implementation is named proxy
// so the project is ready for Next.js versions that adopt the proxy convention.
export { proxy as middleware, config } from "./proxy";
