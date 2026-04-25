# ADR-007: Browser Security — WASM Sandbox + CSP for Decryption

## Status
Deferred until Phase 2 (post-traction)

## Solo Dev Note
WASM sandbox is high build complexity for marginal benefit at low user count. Mitigate with strict CSP and input sanitization in MVP. Revisit after a security audit or if you process high-value content that attracts targeted attacks.

## Context
The AES-CTR key (`aesKeyB64`) exists as a Base64 string in the main-thread JavaScript heap. XSS, malicious extensions, or DevTools can extract it trivially. There is no Content Security Policy (CSP) enforcing script boundaries.

## Decision
1. **Compile the decryption core** (AES-CTR chunk decryption + counter offset math) to WebAssembly (Rust or AssemblyScript).
2. **Run WASM inside a Web Worker** with no DOM access and a minimal message-passing interface.
3. **Main thread never holds `aesKeyB64`.** The key is passed into the Worker once at session start and stored in WASM linear memory (not JS heap).
4. **Strict CSP:** `script-src 'self'; object-src 'none'; base-uri 'none';` — no inline scripts, no `eval`, no `data:` scripts.
5. **Zeroize key in WASM memory** after playback session ends (overwrite with zeros; best-effort on JS engine).

## Consequences
### Positive
- Key is isolated from main-thread XSS and extension content-script access.
- CSP blocks common injection vectors.
- WASM memory is harder to introspect than JS strings (not impossible, but raises the bar).

### Negative
- Build pipeline complexity increases (WASM compilation step).
- Potential performance overhead on low-end devices (must benchmark).
- Debugging decryption issues becomes harder.

## KPI
- **Browser security score:** 3/10 → 7/10
- **Main-thread heap snapshots containing AES key:** present → absent

## Validation
- Security test: mock XSS payload injected; CSP blocks execution.
- Heap audit: take Chrome DevTools heap snapshot during playback; search for `aesKeyB64` pattern; expect 0 matches.
- Performance benchmark: 1080p video chunk decryption < 16ms (60fps budget).

## Open Questions
- Should we use `SharedArrayBuffer` for zero-copy chunk transfer, or copy into Worker (safer, slower)?
- How to handle Safari's JIT restrictions on WASM crypto performance?
