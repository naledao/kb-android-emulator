# KB 安卓模拟器管理器

一个基于 **React** 和 **Tauri v2** 的独立桌面应用，用于创建、配置和管理安卓虚拟设备（AVD）。应用界面默认使用简体中文。可在「设置 → 界面语言」切换语言。

## 主要功能

- **GPU 加速**：可选自动渲染（`auto`）、宿主显卡渲染（`host`）或软件渲染（`software`）。
- **设备配置优化**：根据 Wear OS、Android TV 和 Android Automotive 系统镜像调整内存、CPU 核心数和虚拟机堆大小。Wear OS 设备保留系统镜像的圆形屏幕布局。
- **启动故障恢复**：设备卡片上的「清除数据并启动」会使用 `-wipe-data` 启动模拟器，可用于处理启动循环。此操作会清除设备内的应用、设置和文件。
- **AOT 预编译**：通过 ADB 运行 `cmd package compile -m speed`，为已安装的应用和游戏预编译代码。
- **网络优化**：启动模拟器时可使用 Cloudflare DNS（`1.1.1.1`），并调整 TCP 缓冲区。

## 开始使用

### 环境要求

- [Node.js](https://nodejs.org/)，建议使用 LTS 版本。
- [Rust 工具链](https://www.rust-lang.org/tools/install)，可通过 rustup 安装。
- 在 Windows 上使用硬件虚拟化时，请启用合适的加速器，例如 WHPX。

### 安装依赖

```bash
git clone https://github.com/kil0bit-kb/kb-android-emulator-manager.git
cd kb-android-emulator-manager
npm install
```

启动后，先在「配置与安装」下载 JDK 和 Android 命令行工具，再到「SDK 管理器」安装模拟器、平台工具和所需的系统镜像。应用将这些组件保存在本地 `android-sdk/` 目录。

## 运行与构建

启动 Vite 开发服务器和 Tauri 桌面窗口。

```bash
npm run tauri dev
```

构建前端和 Rust 后端，并将 Windows 安装程序输出到 `src-tauri/target/release/bundle/`。

```bash
npm run tauri build
```

## 项目结构

```text
├── src/                  # React 前端
│   ├── components/       # 设备、SDK、GPU 与共享界面组件
│   ├── localization/     # 界面翻译资源
│   ├── App.jsx           # 主窗口和页面导航
│   └── index.css         # 界面样式
├── src-tauri/            # Rust 后端和 Tauri 配置
│   └── src/
│       ├── commands/     # 设备、ADB、SDK 和系统命令
│       └── main.rs       # 桌面应用入口
└── package.json          # Node.js 依赖和脚本
```

[查看使用与配置指南](GUIDE.md)
