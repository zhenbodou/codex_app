# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Windows 安装包

生成带 Megvii Logo 的 EXE 安装包：

```powershell
npm.cmd run tauri -- build --bundles nsis
```

输出目录：`src-tauri/target/release/bundle/nsis/`。
安装器与卸载器图标在 `src-tauri/tauri.conf.json` 的
`bundle.windows.nsis.installerIcon` / `uninstallerIcon` 中配置。

分发时使用这里的 `Megvii Code_版本_x64-setup.exe`。
MSI 文件在资源管理器中通常显示 Windows Installer 的统一图标；
更改应用图标不会改变 MSI 文件类型图标。
