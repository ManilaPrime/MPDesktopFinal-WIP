
# Building Manila Prime for Tauri (Desktop)

This guide provides the exact steps to prevent the "White Screen" issue and successfully build your native desktop application.

## 1. Prerequisites
Ensure you have installed:
- **Rust**: [rustup.rs](https://rustup.rs/)
- **Node.js**: v18 or later.

## 2. Configuration Sync (CRITICAL)
The "White Screen" happens when Tauri looks in the wrong folder. Open your `src-tauri/tauri.conf.json` and ensure these values match exactly:

```json
{
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devPath": "http://localhost:9002",
    "distDir": "../out"
  },
  "tauri": {
    "bundle": {
      "active": true,
      "targets": "all",
      "identifier": "com.manilaprime.admin",
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ]
    },
    "security": {
      "csp": null
    },
    "window": {
      "title": "Manila Prime Admin",
      "width": 1280,
      "height": 800,
      "resizable": true,
      "fullscreen": false
    }
  }
}
```

## 3. The Build Process

### Step A: Export the Web App
This generates a static `out/` folder at your project root.
```bash
npm run build
```

### Step B: Verify the Export
Check that a folder named `out` exists and contains an `index.html`. If it doesn't, the build failed.

### Step C: Build the Native App
This uses Rust to compile the native binary and bundle it with your static files.
```bash
npx tauri build
```

## 4. Troubleshooting the "White Screen"
If you still see a white screen after installing:
1. **Developer Tools**: Run the app using `npx tauri dev` instead of `build`. Right-click anywhere and select "Inspect" to see Console errors.
2. **Missing Out Folder**: If `distDir` in `tauri.conf.json` points to a non-existent folder, the app will be empty.
3. **Internal Routing**: Ensure `trailingSlash: true` is in `next.config.ts` (this app already has it). Without it, internal links like `/bookings` won't find the `bookings.html` file in the bundle.
