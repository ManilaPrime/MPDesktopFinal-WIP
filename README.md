# Manila Prime Admin

Next.js 15 desktop client for managing Manila Prime bookings, units, and expenses. Renders native desktop window using Tauri.

## Local Dev
1. Install dependencies:
   ```bash
   npm install
   ```
2. Set up environment:
   Create a `.env.local` with the Firebase client keys:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   ```
3. Start Next.js dev server (runs on http://localhost:9002):
   ```bash
   npm run dev
   ```
4. Run Tauri in development mode:
   ```bash
   npm run tauri dev
   ```

## Scripts

- `npm run dev` - Next.js dev server.
- `npm run build` - Next.js static export build (goes to `./out`).
- `npm run tauri dev` - Launches the Tauri desktop app in dev mode.
- `npm run tauri build` - Compiles the production desktop installer.
- `npm run test` - Runs Vitest unit tests.
- `npm run typecheck` - Runs tsc to verify types.

## Docs & Reference

Check `./docs` for details on build:
- [TAURI_BUILD.md](./docs/TAURI_BUILD.md) - Packaging and installer compilation instructions.
- [vitest.config.ts](./vitest.config.ts) - Unit testing config.
