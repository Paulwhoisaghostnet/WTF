// Some wallet SDK dependencies inspect `global` while the module graph loads.
// Keep this pre-module compatibility shim external so the strict production
// Content Security Policy can execute it through `script-src 'self'`.
globalThis.global = globalThis;
