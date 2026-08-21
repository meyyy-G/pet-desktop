# 🐾 Desktop Journal Companion

<p align="center"><img src="assets/images/app-icon.png" width="128" alt="Desktop Journal Companion"></p>

<p align="center">一只会陪你写日记、记录心情，也需要你照顾的像素桌面小猫。</p>

<p align="center">A cozy pixel-art desktop companion combining a virtual pet, journal, mood tracker, calendar and daily tasks.</p>

---

## 🌟 项目介绍

**Desktop Journal Companion** 是一个使用 **Python 和 PySide6** 开发的 Windows 桌面陪伴应用。

它将像素桌宠与个人日记系统结合在一起。小猫会停留在桌面上，根据时间、互动行为和自身状态播放不同动画。你可以拖动、抚摸、喂食、陪它玩耍或让它睡觉，也可以打开手帐页面记录日记、心情和每日任务。

项目希望在日常工作和学习过程中，提供一个轻松、安静、有陪伴感的桌面空间。

> 当前项目仍在持续开发中，部分页面和功能尚未完成。

### 📦 公开范围与素材说明

本仓库公开程序源代码，以及 README 展示所需的截图和演示 GIF。

为了保护原创美术内容，以下资源不包含在公开仓库中：

- 桌宠动画原始帧与工程素材
- 日记界面的原始 UI 图片和图标素材
- 可直接用于重新制作完整视觉效果的源文件

`assets/images/` 中公开的图片仅用于项目介绍和效果预览。由于缺少私有原始素材，公开源码不能直接还原完整桌宠动画和日记界面。

---

## ✨ 主要功能

### 🐱 像素桌面宠物

- 透明无边框桌面窗口
- 支持窗口置顶
- 支持鼠标拖动和物理落地效果
- 双击小猫打开手帐
- 自动保存桌宠位置
- 自动修正超出屏幕范围的窗口位置
- 根据空闲时间自然切换动作
- Looking、Sitting、Gaping、Laydown 等待机状态
- 支持喂食、玩耍、睡觉和抚摸互动

<p align="center">
  <img src="assets/images/1.gif" width="170" alt="Desktop pet animation 1">
  <img src="assets/images/2.gif" width="170" alt="Desktop pet animation 2">
  <img src="assets/images/3.gif" width="170" alt="Desktop pet animation 3">
  <img src="assets/images/4.gif" width="170" alt="Desktop pet animation 4">
</p>

<p align="center"><em>小猫会在桌面上自然切换不同动画状态。</em></p>

### 🤍 桌宠互动

可以拖动小猫，也可以通过右键菜单进行喂食、玩耍和睡觉等互动。

<p align="center"><img src="assets/images/互动.gif" width="360" alt="Pet interaction"></p>

---

### 🍞 状态与需求系统

小猫拥有三项会随时间变化的状态：

- 饱食度
- 心情值
- 精力值

状态会保存在本地，并在关闭程序后继续进行离线时间结算。当状态较低时，小猫会通过不同动画表达饥饿、困倦、难过或生气等需求。

<p align="center">
  <img src="assets/images/hungry.gif" width="150" alt="Hungry">
  <img src="assets/images/sleepy.gif" width="150" alt="Sleepy">
  <img src="assets/images/upset.gif" width="150" alt="Upset">
  <img src="assets/images/angry.gif" width="150" alt="Angry">
</p>

---

### 📖 日记系统

- 按日期创建和查看日记
- 日记内容本地保存
- 支持保存、放弃修改
- 日历日期导航
- 已记录日期高亮
- 输入日记时触发专属桌宠动画

<p align="center"><img src="assets/images/app_diary.png" width="900" alt="Diary page"></p>

<p align="center">
  <img src="assets/images/日记端盒子猫.gif" width="180" alt="Cat opening diary">
  <img src="assets/images/看你打字.gif" width="260" alt="Cat watching user type">
</p>

<p align="center"><em>当你打开日记并开始输入时，小猫也会在旁边陪着你。</em></p>

---

### 😊 心情记录

- 记录每天的心情
- 心情数据本地持久化
- 在主页和日历中查看心情
- 使用不同颜色展示每日心情

<p align="center"><img src="assets/images/app_home.png" width="900" alt="Application home page"></p>

---

### 📅 日历

- 月历视图
- 上个月和下个月切换
- 快速跳转到指定日期
- 显示日记记录日期
- 显示每日心情颜色

<p align="center"><img src="assets/images/app_calendar.png" width="900" alt="Calendar page"></p>

---

### ✅ 每日任务

- 添加任务
- 编辑任务内容
- 标记任务完成
- 删除任务
- 显示任务完成进度
- 使用浏览器本地存储保存任务

> 当前任务系统仍在完善中。

---

### 💬 AI Companion

Chat 页面已经完成界面和基础消息交互。

<p align="center"><img src="assets/images/app_chat.png" width="900" alt="Chat page"></p>

> 当前版本尚未连接 AI API，聊天回复为界面演示内容。
> OpenAI、DeepSeek、Gemini、Claude 等模型均未接入。

---

## 🖥️ 系统要求

目前主要面向：

- Windows 10 / Windows 11
- Python 3.13（运行源码时需要）
- 64 位操作系统

---

## 🚀 运行源码

### 1. 克隆项目

```powershell
git clone https://github.com/meyyy-G/pet-desktop.git
cd pet-desktop
```

### 2. 创建虚拟环境

```powershell
python -m venv .venv
```

### 3. 激活虚拟环境

```powershell
.venv\Scripts\activate
```

### 4. 安装依赖

```powershell
python -m pip install -r requirements.txt
```

### 5. 启动程序

> 公开仓库不包含完整美术素材。启动源码前，需要自行准备对应资源；否则部分桌宠动画和日记 UI 图标无法显示。

可以双击 `run_app.bat`，或者执行：

```powershell
python src\desktop_pet_app.py
```

---

## 📦 本地构建 Windows 程序

安装开发和打包依赖：

```powershell
python -m pip install -r requirements-dev.txt
```

运行构建脚本：

```powershell
.\build.bat
```

构建完成后，程序位于：

```text
dist\DesktopPet\DesktopPet.exe
```

> PyInstaller 使用 `onedir` 模式。发布或移动程序时，需要保留整个 `DesktopPet` 文件夹，不能只复制其中的 EXE。
>
> 构建过程需要未公开的完整视觉素材；仅克隆公开仓库无法生成完整版本。

---

## 📂 项目结构

```text
pet-desktop/
├── assets/
│   └── images/                 # 仅包含 README 展示截图和演示 GIF
├── src/
│   ├── desktop_pet_app.py      # 程序入口
│   └── desktop_pet/
│       ├── app.py              # QApplication 初始化
│       ├── paths.py            # 资源及用户数据路径
│       ├── settings.py         # 桌宠设置
│       ├── pet/
│       │   ├── animation.py
│       │   ├── behavior_state_machine.py
│       │   ├── pet_physics.py
│       │   ├── pet_state.py
│       │   ├── pet_state_store.py
│       │   ├── state_decay.py
│       │   └── pet_window.py
│       ├── diary/
│       │   ├── diary_bridge.py
│       │   ├── diary_store.py
│       │   ├── diary_window.py
│       │   └── mood_store.py
│       └── web/
│           ├── index.html
│           ├── app.js
│           └── style.css
├── DesktopPet.spec             # PyInstaller 配置
├── build.bat                   # Windows 构建脚本
├── run_app.bat                 # 源码启动脚本
├── requirements.txt            # 运行依赖
├── requirements-dev.txt        # 开发及构建依赖
└── README.md
```

---

## 💾 本地数据

源码模式下，用户数据保存在项目的 `data` 目录。

打包后的 Windows 版本将数据保存在：

```text
%LOCALAPPDATA%\DesktopPet
```

其中包括：

- 日记内容
- 每日心情
- 桌宠状态
- 桌宠位置和应用设置

这些个人数据不会被包含在 Git 仓库或发布包中。

---

## 🛠️ 技术栈

- Python
- PySide6
- Qt WebEngine
- QWebChannel
- HTML
- CSS
- JavaScript
- PyInstaller
- Pillow

---

## 🚧 开发计划

- 接入真正的 AI 对话 API
- 完善任务页面
- 添加专注计时功能
- 增加状态统计和趋势页面
- 添加应用设置页面
- 增加更多桌宠互动
- 增加更多动画和桌宠形象
- 优化安装包和应用更新体验

---

## 📄 License

This project is licensed under the **MIT License**.

详细内容请查看 `LICENSE` 文件。

---

## 💬 English Summary

Desktop Journal Companion is a Windows desktop application built with Python and PySide6. It combines an animated pixel-art virtual pet with a personal journal, mood tracker, calendar and lightweight task system.

The pet responds to time, inactivity and user interactions through different animations. Users can drag, pet, feed, play with or put the cat to sleep. Journal entries, mood records and pet states are stored locally.

The Chat interface is currently a UI prototype and is not connected to an AI API yet.
