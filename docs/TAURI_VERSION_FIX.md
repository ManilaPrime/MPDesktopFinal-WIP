# Tauri plugin version fix

The Tauri build checks that JavaScript plugin packages and Rust plugin crates are on the same major/minor version.

This project pins:

- `@tauri-apps/plugin-fs`: `2.4.5`
- Rust crate reported by build: `tauri-plugin-fs`: `2.4.5`

After extracting this zip, reinstall Node dependencies so the old `2.5.0` package is removed:

```bash
rm -rf node_modules package-lock.json
npm install
npx tauri build
```

If you prefer to upgrade instead, update the Rust crate `tauri-plugin-fs` to `2.5.0` in `src-tauri/Cargo.toml` and run `cargo update -p tauri-plugin-fs`, then reinstall Node dependencies with `@tauri-apps/plugin-fs@2.5.0`.
