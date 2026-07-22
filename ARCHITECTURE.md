# SideX Architecture

A technical reference for how SideX maps to VSCode's architecture.

The VSCode source (MIT License) is the architectural reference. No proprietary code is used.

## Process Model

```
VSCode (Electron)                    SideX (Tauri)
─────────────────                    ─────────────
Electron Main Process        →       Tauri Rust Backend
  ├─ BrowserWindow           →       WebviewWindow
  ├─ ipcMain                 →       Tauri Commands + Events
  ├─ Menu/Dialog/Shell       →       Tauri Plugins
  └─ UtilityProcess          →       Rust async tasks / sidecars

Renderer Process             →       Tauri Webview (frontend TS)
  ├─ Workbench               →       Workbench (same TS)
  ├─ Monaco Editor           →       Monaco Editor (same)
  └─ Extension Host API      →       Extension Host API (ported)

Shared Process               →       Rust service layer
Extension Host               →       Sidecar process (in progress)
```

## VSCode Layering (Preserved)

```
┌─────────────────────────────────────────────┐
│  code/        → Application entry (Tauri)   │
├─────────────────────────────────────────────┤
│  workbench/   → IDE shell                   │
│    ├── Feature contributions (contrib/)     │
│    ├── Services (services/)                 │
│    ├── Visual Parts (browser/parts/)        │
│    ├── Extension host API (api/)            │
│    └── Layout engine (browser/layout.ts)    │
├─────────────────────────────────────────────┤
│  editor/      → Monaco text editor core     │
├─────────────────────────────────────────────┤
│  platform/    → Platform services (DI)      │
├─────────────────────────────────────────────┤
│  base/        → Foundation utilities        │
└─────────────────────────────────────────────┘
```

## Workspace Layout

The JavaScript side is a Bun workspace. Package boundaries follow the layering
above, and the dependency direction is enforced by module resolution rather than
convention — `@sidex/base` declares no layer dependencies, so an upward import
fails to resolve instead of silently working.

| Package | Path | Depends on |
| --- | --- | --- |
| `@sidex/base` | `packages/base` | — |
| `@sidex/platform` | `packages/platform` | base |
| `@sidex/editor` | `packages/editor` | base, platform |
| `@sidex/workbench` | `packages/workbench` | base, platform, editor |
| `@sidex/app-workbench` | `apps/workbench` | all of the above |
| `@sidex/build` | `packages/build` | — (build tooling; the `bun test` target) |
| `@sidex/vscode-dts` | `packages/vscode-dts` | — (extension API typings) |

Cross-layer imports are written as `@sidex/<layer>/...`; imports within a layer
stay relative. Vite resolves the package names through `resolve.alias` and
TypeScript through `compilerOptions.paths`, both defined once in
`apps/workbench/vite.config.ts` and `tsconfig.json`.

Rust spans three separate Cargo workspaces, each with its own build target and
release profile (Cargo's `[profile.release]` is workspace-global, and wasm
crates cannot build for the native host):

| Workspace | Members | Target |
| --- | --- | --- |
| native (repo-root `Cargo.toml`) | `apps/desktop` + `crates/*` (incl. `extension-sdk`) | native |
| `wasm/` | wasm-bindgen modules | wasm32 |
| `extensions-wasm/` | wit-bindgen component extensions | wasm32 |

### WebAssembly acceleration (`wasm/`)

`wasm/` is a Cargo workspace of `wasm-bindgen` crates compiled by `wasm-pack`
and served at `/wasm/<crate>/` (built into `apps/workbench/public/wasm/`,
gitignored). Currently one member: `tfidf`, which accelerates Command Palette
and Settings search scoring. Consumers load the module at runtime with a
graceful fall back to a JS implementation, so the app never hard-depends on
wasm; `bun run build` compiles it, `bun run dev` falls back if the toolchain
is absent.

**Adding a wasm module:**
1. New crate under `wasm/<name>/` (`crate-type = ["cdylib"]`, `wasm-bindgen`), add it to `wasm/Cargo.toml` members.
2. Extend `packages/build/src/wasm/build.ts` to emit it to `apps/workbench/public/wasm/<name>/`.
3. Consumer: dynamic-import `/wasm/<name>/…​.js`, pass the explicit `…_bg.wasm` URL to init, wrap in try/catch with a JS fallback.
4. If it replaces existing JS behavior, add a parity test (`packages/build/test/…-parity.test.ts`) gating that results match the JS reference.

Crate directories drop the `sidex-` prefix (`crates/text`), but crate names keep
it (`sidex-text`), so `use sidex_text::…` is unchanged. Rust is otherwise
unaffected by the JavaScript layout.

**Both Bun and Node.js are required.** Bun is the package manager, script
runner, and test runner; Node.js executes Vite, because the production build
needs `--max-old-space-size=12288`, a V8 flag with no Bun equivalent.

## Electron API Replacement Map

| Electron API | Tauri Replacement | Status |
|---|---|---|
| `BrowserWindow` | `WebviewWindow` | Ported |
| `ipcMain/ipcRenderer` | `invoke()` / `emit()` / `listen()` | Ported |
| `Menu/MenuItem` | `tauri::menu::Menu` | Ported |
| `dialog.*` | `@tauri-apps/plugin-dialog` | Ported |
| `clipboard` | `@tauri-apps/plugin-clipboard-manager` | Ported |
| `shell.openExternal` | `@tauri-apps/plugin-opener` | Ported |
| `Notification` | `@tauri-apps/plugin-notification` | Ported |
| `safeStorage` | Rust keyring crate | Partial |
| `protocol.*` | Tauri custom protocol | Ported |
| `screen/Display` | Tauri monitor API | Ported |
| `contextBridge` | `@tauri-apps/api` (direct) | Ported |
| `node-pty` | `portable-pty` (Rust) | Ported |
| `@parcel/watcher` | `notify` (Rust) | Ported |
| `child_process` | `std::process::Command` | Ported |
| `fs/fs.promises` | `@tauri-apps/plugin-fs` + Rust fs | Ported |
| `net/http` | `reqwest` (Rust) | Ported |
| `crypto` | Web Crypto API | Partial |
| `os.*` | `sysinfo` (Rust) | Ported |
| `@vscode/sqlite3` | `rusqlite` | Ported |
| `@vscode/spdlog` | `tracing` + `tracing-subscriber` | Partial |
| `autoUpdater` | `sidex-update` (native Rust) | Complete |
| `powerMonitor` | Rust system-info crates | Not started |
| `contentTracing` | Rust tracing crate | Not started |
| `native-keymap` | Rust keyboard crate | Not started |

## Porting Status by Layer

### base/ (Foundation)
| Sublayer | Strategy | Status |
|---|---|---|
| `common/` | Reuse directly (pure TS) | Done |
| `browser/` | Reuse directly (DOM only) | Done |
| `worker/` | Reuse directly (Web Workers) | Done |
| `node/` | Rewrite → Tauri invoke() | Done |
| `parts/ipc` | Rewrite for Tauri IPC | Done |
| `parts/storage` | Rewrite → Rust SQLite | Done |

### platform/ (Services)
| Service | Strategy | Status |
|---|---|---|
| `instantiation` (DI) | Reuse directly | Done |
| `files` | Tauri fs plugin + Rust | Done |
| `windows` | Tauri window API | Done |
| `configuration` | Mostly reuse | Done |
| `storage` | Rust SQLite backend | Done |
| `keybinding` | Mostly reuse | Done |
| `commands` | Reuse directly | Done |
| `contextkey` | Reuse directly | Done |
| `theme` | Reuse directly | Done |
| `log` | Rust tracing backend | Partial |
| `terminal` | Rust portable-pty | Done |
| `dialogs` | Tauri dialog plugin | Done |
| `clipboard` | Tauri clipboard plugin | Done |
| `native` | Rust OS integration | Partial |
| `encryption` | Rust keyring | Partial |

### editor/ (Monaco)
| Sublayer | Strategy | Status |
|---|---|---|
| `common/` | Reuse directly | Done |
| `browser/` | Reuse directly (DOM) | Done |
| `contrib/` (57 contributions) | Reuse directly | Done |
| `standalone/` | Removed (not needed in Tauri) | Deleted |

### workbench/ (IDE Shell)
| Sublayer | Strategy | Status |
|---|---|---|
| `browser/layout` | Reuse with mods | Done |
| `browser/parts` (8 Parts) | Reuse with mods | Done |
| `contrib/` (92 features) | Incremental port | Partial |
| `services/` (90 services) | Incremental port | Partial |
| `api/` (Extension host) | Port | In progress |

### code/ (Application Entry)
| Sublayer | Strategy | Status |
|---|---|---|
| `electron-main/` | Full rewrite → Tauri Rust | Done |
| `electron-browser/` | Rewrite → Tauri webview | Done |

## Rust Backend Commands

All Tauri commands are registered in `apps/desktop/src/lib.rs`.

| Module | Commands |
|---|---|
| **fs** | `read_file`, `read_file_bytes`, `write_file`, `write_file_bytes`, `read_dir`, `stat`, `mkdir`, `remove`, `rename`, `exists` |
| **terminal** | `terminal_spawn`, `terminal_write`, `terminal_resize`, `terminal_kill`, `terminal_get_pid`, `get_default_shell`, `check_shell_exists`, `get_available_shells` |
| **search** | `search_files`, `search_text` |
| **window** | `create_window`, `close_window`, `set_window_title`, `get_monitors` |
| **os** | `get_os_info`, `get_env`, `get_all_env`, `get_shell` |
| **storage** | `storage_get`, `storage_set`, `storage_delete` |
| **git** | `git_status`, `git_diff`, `git_log`, `git_log_graph`, `git_add`, `git_commit`, `git_checkout`, `git_branches`, `git_create_branch`, `git_delete_branch`, `git_push`, `git_pull`, `git_fetch`, `git_stash`, `git_reset`, `git_show`, `git_init`, `git_is_repo`, `git_clone`, `git_remote_list`, `git_run` |
| **ext_host** | `extension_platform_bootstrap`, `extension_platform_status`, `extension_platform_restart`, `extension_platform_stop`, `extension_platform_init_data` |
| **network** | `fetch_url`, `fetch_url_text`, `proxy_request` |
| **debug** | `debug_spawn_adapter`, `debug_send`, `debug_kill`, `debug_list_adapters` |
| **tasks** | `task_spawn`, `task_kill`, `task_list` |
