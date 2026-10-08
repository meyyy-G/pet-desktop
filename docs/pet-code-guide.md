# Pet 代码文件完整导览

更新时间：2026-09-27

这份文档回答三个问题：Pet 由哪些文件组成、每个文件具体负责什么、一次用户操作如何在这些文件之间流动。问题诊断与整改优先级另见 `docs/pet-system-analysis.md`。

## 1. 目录与边界

### 1.1 Pet 核心目录

```text
src/desktop_pet/pet/
├── __init__.py                  # Python 包标记，目前为空
├── pet_window.py                # Pet 总控制器与顶层透明窗口
├── animation.py                 # 序列帧加载和播放
├── behavior_state_machine.py    # 行为选择、抢占和恢复
├── pet_state.py                 # 饱食/心情/精力的数值模型
├── pet_state_store.py           # Pet 数值 JSON 存档
├── state_decay.py               # 运行期间数值自然下降
├── need_rules.py                # 数值到身体需求动画的规则
├── pet_physics.py               # 点击、双击、拖拽和落地
└── status_panel.py              # 状态条和头顶需求提示
```

### 1.2 直接参与 Pet 的外围文件

```text
src/desktop_pet/app.py                       # 创建 PetWindow 和系统托盘
src/desktop_pet/settings.py                  # 位置、缩放、置顶配置
src/desktop_pet/paths.py                     # 资源与数据文件路径
src/desktop_pet/diary/diary_window.py        # 向 Pet 转发日记事件
src/desktop_pet/diary/diary_bridge.py        # Web 页面输入/切页信号来源
tools/pet_touch_transition_tester.py          # Touch 恢复人工测试器
DesktopPet.spec                              # 打包 Pet 动画及应用资源
assets/animations/cat/                       # Pet 身体序列帧
assets/animations/cat_panel/                 # 三条状态条图片
assets/animations/cat_thought/               # 需求气泡图片
```

Web 页面本身不会直接控制 Pet。它通过 `DiaryBridge` 发出输入和页面切换信号，再由 `DiaryWindow` 转发给 `PetWindow`。

## 2. 总体结构

```text
app.main()
  └─ PetWindow                         顶层协调者
      ├─ PetState                      当前数值
      ├─ PetStateStore                 读写 JSON
      ├─ PetStateDecay                 定时改变数值
      ├─ PetAnimation                  加载并播放当前动画
      ├─ PetBehaviorStateMachine       决定应该播放什么
      ├─ PetPhysics                    将鼠标操作解释为点击/拖拽/落地
      ├─ StatusPanel                   显示三个数值
      ├─ PetNeedIndicator              显示头顶需求图
      └─ DiaryWindow                   日记打开后提供切页/输入/关闭事件
```

严格来说，`PetWindow` 才是当前系统的实际总状态机。`PetBehaviorStateMachine` 只统一了身体行为的一部分，日记上下文、窗口移动和 Overlay 状态仍由其他对象分别维护。

## 3. 核心文件逐个说明

### 3.1 `pet_window.py` — 总装配与事件路由

这是 Pet 最核心的文件。`PetWindow(QWidget)` 同时是透明顶层窗口、其他 Pet 对象的创建者、Qt 鼠标事件入口、右键菜单入口、日记联动器以及每帧布局器。

初始化顺序：读取设置和 Pet 数值 → 建立透明窗口 → 创建身体 Label、状态条和提示 → 创建播放器 → 创建行为状态机并应用初始 Need → 创建数值衰减器 → 创建 Physics → 恢复位置。

窗口与布局方法：

| 方法 | 作用 |
| --- | --- |
| `_apply_window_flags()` | 设置无边框、Tool 窗口和可选置顶。 |
| `_show_frame(pixmap)` | 接收动画帧，重算整个窗口尺寸，将 Pet 水平居中。 |
| `_move_inside_available_screen()` | 启动后把存档位置限制在屏幕可用区域。 |
| `_update_overlay_positions()` | 摆放状态条和头顶提示。 |

`_show_frame()` 每一帧都可能调用 `resize()`，所以动画资源宽度会直接影响顶层窗口宽度和 Pet 水平位置。

鼠标入口：

| 事件 | 处理 |
| --- | --- |
| `mousePressEvent()` | 记录是否正在唤醒主动睡眠的 Pet，再交给 Physics。 |
| `mouseMoveEvent()` | 左键按住时交给 Physics 移动。 |
| `mouseReleaseEvent()` | 交给 Physics 判断点击还是拖拽落地。 |
| `mouseDoubleClickEvent()` | 检查 Care 锁，取消单击，登记互动并打开日记。 |
| `contextMenuEvent()` | 构建日记、喂食、玩耍、睡觉、治疗、置顶和退出菜单。 |

主动互动：

| 方法 | 数值变化 | 身体动作 |
| --- | --- | --- |
| `_feed()` | `PetState.feed()` | `eat` 2.5 秒 |
| `_play()` | 检查 `can_play()` 后调用 `play()` | `play` 2.5 秒 |
| `_sleep()` | `sleep()` | 无限 `sleeping`，点击唤醒 |
| `_touch_cat()` | `touch()` | `touch` 1.8 秒，之后恢复自然姿势 |
| `_treat()` | 暂不改数值 | `treating` 30 分钟 |
| `_complete_treatment()` | 三项直接设为 75 | 清锁并回 `idle` |

拖拽链路由 `_start_carry()`、`_finish_landing()`、`_restore_after_carry()` 组成。Carry 可以打断日记身体动画，落地后由 PetWindow 根据日记是否打开、当前页面及输入状态手工恢复。

Need/Care 方法：`_update_need_animation()` 计算身体 Need；`_care_interaction_blocked()` 拦截 Sick/Treating 普通互动；`_register_interaction()` 同时通知 Behavior 与 StateDecay。

日记状态由 `is_diary_page_active`、`has_started_typing`、`typing_requested_during_open` 三个布尔值记录。`_open_diary_window()`、`_start_typing_animation()`、`_handle_diary_page_changed()`、`_finish_diary_animation()` 和 `_handle_animation_finished()` 共同串起打开、等待、打字、退出动画。

退出与设置由 `_quit_app()`、`closeEvent()`、`_toggle_always_on_top()` 和 `_save_position()` 负责。

### 3.2 `animation.py` — 序列帧播放器

`PetAnimation(QObject)` 不决定业务优先级，只负责加载帧、保存当前动画与帧索引、按 Timer 换帧并报告一次性动画结束。

对外信号：

- `frame_changed(QPixmap)` 连接 `PetWindow._show_frame()`；
- `state_finished(str)` 同时连接 Behavior（处理 `gaping`）和 PetWindow（处理日记过渡）。

注册表：`FRAME_PATTERN` 定义普通序列；`STATIC_FRAMES` 定义静态图；`ONE_SHOT_STATES` 定义一次性动画；`STATE_INTERVALS` 定义单帧时长。日记动画在 `_load_frames()` 中用 `hide_` 和 `typing_` 的正序/逆序组合生成。

| 方法 | 作用 |
| --- | --- |
| `start()` | 启动 Timer 并立即显示第一帧。 |
| `set_state()` | 校验动画名，重置帧索引、完成标记和间隔。 |
| `next_frame()` | 循环动画取模前进；一次性动画末帧发完成信号。 |
| `_load_frames()` | 构造完整的动画帧字典。 |
| `_load_sequence*()` | 加载固定数量、正序范围或逆序范围。 |
| `_scaled_pixmap()` | 按设置中的目标高度等比缩放。 |

缺失动画和未知状态都会静默回退到 `idle`。

### 3.3 `behavior_state_machine.py` — 身体行为决策器

`BehaviorState` 包括：`IDLE`、`SITTING`、`GAPING`、`LAYDOWN`、`NEED`、`RECOVERING`、`TEMPORARY`、`SICK`、`TREATING`。

自然时间：10 分钟 Sitting、20 分钟 Gaping、30 分钟 Laydown，每 250 ms 检查；Laydown 后 Touch 有 20 秒 Sitting 恢复；治疗持续 30 分钟。

关键内部状态：无互动时钟、20 分钟哈欠是否已播、Temporary 期间的待播哈欠、最新 Need、Temporary 是否重置时钟、Touch 恢复目标，以及独立锁存的 Care 状态。

Timer：周期性的 `inactivity_timer`，单次的 `temporary_timer`、`touch_recovery_timer` 和 `treatment_timer`。

| 对外方法 | 说明 |
| --- | --- |
| `register_interaction()` | 清临时/恢复状态，重启无互动时钟，按 Care/Need/Idle 恢复。 |
| `start_treating()` | 只允许从 Sick 进入 Treating。 |
| `complete_treatment()` | 清 Care/Need 并回 Idle。 |
| `play_temporary()` | 播放临时动画，可设置时长、重置时钟策略及恢复目标。 |
| `play_touch()` | 记录自然姿势并播放不重置时钟的 Touch。 |
| `update_temporary_animation()` | Temporary 内只换身体动画，主要服务日记。 |
| `finish_temporary()` | 按 Care → Need → Touch 恢复 → Idle 决定落点。 |
| `update_need_animation()` | 保存最新 Need；Sick 可锁存并抢占，普通 Need 不打断 Temporary。 |
| `notify_natural_state_drop()` | 请求一次自然哈欠；生产代码目前未调用。 |
| `update_inactivity()` | 按无互动时间应用自然行为。 |

内部方法负责恢复自然行为、计算姿势、Touch 恢复、Gaping 完成落点以及真正调用 Animation 切换。`_transition()` 只有在状态或动画实际变化时才切换并发出 `state_changed`。

### 3.4 `pet_state.py` — 数值模型

`PetState` 是 dataclass：`satiety=80`、`mood=80`、`energy=80`、`current_animation="idle"`。最后一个字段是最近一次互动希望播放的动画命令，不会存档。

| 方法 | 饱食 | 心情 | 精力 | 动画命令 |
| --- | ---: | ---: | ---: | --- |
| `feed()` | +15 | 0 | +2 | `eat` |
| `play()` | -3 | +12 | -3 | `play` |
| `sleep()` | -2 | 0 | +12 | `sleeping` |
| `touch()` | 0 | +2 | 0 | `touch` |

值被限制在 0～100。`can_play()` 要求饱食和精力均大于 20。

### 3.5 `pet_state_store.py` — JSON 存档

`PetStateTimes` 保存三个上次更新时间；`LoadedPetState` 组合 State 与 Times；`PetStateStore` 负责读写。

`load()` 在文件不存在或损坏时返回 80/80/80，并 clamp 所有读取值。加载时会把三个更新时间重设为启动时刻，所以离线期间不下降。

`save()` 保存三个数值及三个 UTC ISO 时间戳，不保存动画、行为、治疗、无互动时间或日记状态。饱食下降周期与数量常量也定义在这里。

### 3.6 `state_decay.py` — 运行期自然衰减

每 10 秒检查一次：饱食每 10 分钟 -2、心情每 30 分钟 -6、精力每 45 分钟 -6。

- `register_interaction()` 当前为空，互动不影响数值下降；
- `commit_manual_change()` 在互动后发 `values_changed` 并保存，参数 `old_satiety` 未使用；
- `check_now()` 计算每项跨过几个完整周期并一次补扣；
- `save()` 委托 Store。

`values_changed` 同时驱动头顶提示与身体 Need 更新。

### 3.7 `need_rules.py` — 身体需求规则

`need_severity()` 和 `highest_need_severity()` 用于严重度计算，但后者当前未被生产代码调用。

`resolve_need_animation()` 按严重度优先、字段次序其次返回一个身体动画：

| 阈值 | 饱食 | 精力 | 心情 |
| ---: | --- | --- | --- |
| ≤15 | `sick` | `sleep` | `sick` |
| ≤25 | `angry` | `sleepy` | `cry` |
| ≤50 | `upset` | `sleepy` | `upset` |

### 3.8 `pet_physics.py` — 输入判定与窗口运动

信号：`clicked`、`drag_started`、`landed`。内部记录按点偏移、按下坐标、是否超过 6 px 阈值、是否忽略下一次 Release、下落速度和目标。

| 方法 | 作用 |
| --- | --- |
| `press()` | 记录位置并清本轮拖拽标记。 |
| `move()` | 超阈值时停下落并发 drag_started，同时移动窗口。 |
| `release()` | 拖拽则开始下落，否则等待双击间隔后确认单击。 |
| `cancel_pending_click()` | 取消待确认单击。 |
| `handle_double_click()` | 取消单击并忽略对应 Release。 |
| `start_fall()` | 目标设为当前位置向下 36 px。 |
| `_update_fall()` | 每 16 ms 加速移动至目标。 |
| `_land()` | 上弹 6 px，80 ms 后落回，130 ms 后发 landed。 |

Physics 只负责手势和位移，落地后的身体动画由 PetWindow 恢复。

### 3.9 `status_panel.py` — 状态条与需求气泡

`ImageProgressBar` 加载背景/填充图片，固定 180×38，按 0～100 百分比裁剪填充并绘制文字。

`StatusPanel` 包含三条进度条，总宽 220；`show_status()` 显示并在 3 秒后自动隐藏；`update_position()` 负责居中。

`PetNeedIndicator` 是独立的 90×90 头顶图片，不参与身体 Animation。它保存最近数值、当前提示、是否持久、Care 提示和图片缓存。

优先级为 Care（sick/treating）→ 普通持久提示 → 越线临时提示。饱食从 >75 降到 ≤75 显示 hungry 30 秒；精力从 >50 降到 ≤50 显示 sleep 30 秒。它维护自己的需求规则，不调用 `need_rules.py`。

### 3.10 `__init__.py` — 包标记

文件为空，只用于把目录标记为 Python 包，没有集中导出符号。

## 4. 外围文件

### 4.1 `app.py`

`main()` 创建 QApplication、设置图标、创建并显示唯一的 PetWindow。系统支持托盘时建立“打开今日手帐 / 显示小猫 / 退出”菜单，并把托盘对象挂到 Window 防止回收。

### 4.2 `settings.py`

`DesktopPetSettings` 默认 `x=1200`、`y=650`、`scale=120`、`always_on_top=True`。scale 实际是所有身体帧的目标高度。Store 负责 JSON 默认合并与整体保存。

### 4.3 `paths.py`

区分源码与 PyInstaller 模式，定位 `ASSETS_DIR`、Web 资源和数据目录。源码默认写项目 `data`，打包默认写 `%LOCALAPPDATA%/DesktopPet`，`DESKTOP_PET_DATA_DIR` 可覆盖。

### 4.4 `diary_window.py`

向 Pet 暴露 `typing_triggered`、`page_changed(str)`、`diary_closed`。前两个来自 DiaryBridge；关闭信号只在无需保存、保存或丢弃后发出，Cancel 不发出。

### 4.5 `diary_bridge.py`

Pet 只依赖 `notifyTyping(text)` 和 `notifyPageChanged(page_name)`：前者在非空输入时发 typing，后者更新 `current_page` 并发切页信号。其他方法属于日记/聊天/任务数据。

### 4.6 `pet_touch_transition_tester.py`

复用生产 State、Animation、Behavior，但不创建 PetWindow、不读写存档、不运行衰减。用可控时钟人工观察 Idle、Sitting、Gaping、Laydown、Touch 和 Need 恢复；它不是自动化测试。

### 4.7 `DesktopPet.spec`

PyInstaller 配置将整个 `assets/animations` 和 Web 资源加入发布包。发布版动画依赖此资源映射和 `paths.py` 对 `_MEIPASS` 的解析。

## 5. 信号连接清单

| 发出者 | 信号 | 接收者 |
| --- | --- | --- |
| PetAnimation | `frame_changed` | `PetWindow._show_frame` |
| PetAnimation | `state_finished` | Behavior 的 Gaping 完成处理 |
| PetAnimation | `state_finished` | PetWindow 的日记动画完成处理 |
| Behavior | `treatment_due` | `PetWindow._complete_treatment` |
| Behavior | `state_changed` | 生产代码无人接收；测试器接收 |
| StateDecay | `values_changed` | NeedIndicator + PetWindow Need 更新 |
| Physics | `clicked` | `PetWindow._touch_cat` |
| Physics | `drag_started` | `PetWindow._start_carry` |
| Physics | `landed` | `PetWindow._finish_landing` |
| NeedIndicator | `visibility_changed` | PetWindow Overlay 重排 |
| DiaryWindow | `typing_triggered` | PetWindow 打字动画 |
| DiaryWindow | `page_changed` | PetWindow 日记页面处理 |
| DiaryWindow | `diary_closed` | PetWindow 结束日记动画 |

## 6. Timer 清单

| 所属 | 周期/时长 | 作用 |
| --- | --- | --- |
| Animation Timer | 120～540 ms | 身体换帧 |
| inactivity Timer | 250 ms | 自然行为检查 |
| temporary Timer | 动态单次 | 结束定时互动 |
| touch recovery Timer | 20 秒 | Sitting 后恢复 Laydown |
| treatment Timer | 30 分钟 | 完成治疗 |
| decay Timer | 10 秒 | 检查数值下降 |
| status hide Timer | 3 秒 | 隐藏状态条 |
| hint hide Timer | 10/30 秒 | 结束临时气泡 |
| fall Timer | 16 ms | 模拟下落 |
| click Timer | 系统双击间隔 | 排除双击后确认单击 |
| landing singleShot | 80/130 ms | 回弹和 landed |

全部运行在 Qt 主线程；风险主要来自旧回调和新交互的时序交叉，不是多线程竞争。

## 7. 典型调用链

### 单击抚摸

```text
Press/Release → Physics 延迟确认 clicked → PetWindow._touch_cat
→ PetState.touch → 显示状态条 → Behavior.play_touch
→ Animation.set_state("touch") → StateDecay 保存并更新 Need
```

### 拖拽落地

```text
Move 超阈值 → drag_started → _start_carry
→ register_interaction → play_temporary("carry")
→ Release → 下落/回弹 → landed
→ _finish_landing → 根据 Diary 上下文恢复 → 保存位置
```

### 数值自然下降

```text
Decay Timer → check_now → 扣数值 → values_changed
├─ NeedIndicator.update_values（头顶规则）
└─ PetWindow._update_need_animation
   → resolve_need_animation（身体规则）
   → Behavior.update_need_animation
→ Store.save
```

### 日记输入

```text
打开 → diary_open_enter → diary_open_exit → diary_waiting
Web 非空输入 → Bridge → Window → diary_typing_enter → diary_typing 循环
```

### 生病治疗

```text
Need == sick → Care 锁存 SICK → 身体/气泡 sick
→ 右键治疗 → TREATING 30 分钟 → 三项设 75
→ 清 Care/Need → idle → 更新提示并保存
```

## 8. 状态保存位置

| 状态 | 持有者 | 持久化 |
| --- | --- | --- |
| 三个需求值 | PetState | 是 |
| 身体行为枚举 | Behavior.state | 否 |
| 动画名/帧 | PetAnimation | 否 |
| 互动动画命令 | PetState.current_animation | 否 |
| Sick/Treating 锁 | Behavior._care_state | 否 |
| 无互动时间 | Behavior._inactivity_clock | 否 |
| 治疗剩余时间 | treatment_timer | 否 |
| 日记陪伴阶段 | PetWindow 布尔值 + Animation.state | 否 |
| 位置/高度/置顶 | DesktopPetSettings | 是 |
| 气泡状态 | PetNeedIndicator | 否 |
| 拖拽/下落 | PetPhysics | 否 |

## 9. 修改入口速查

| 想修改 | 首要文件 | 同时检查 |
| --- | --- | --- |
| 新增身体动画 | `animation.py` | 资源、Behavior、spec |
| 无互动时间 | `behavior_state_machine.py` | Touch 恢复测试 |
| 互动数值 | `pet_state.py` | Need、提示、存档 |
| Need 阈值 | `need_rules.py` | NeedIndicator 规则 |
| 点击/拖拽手感 | `pet_physics.py` | Window 鼠标事件、Carry 恢复 |
| 状态条/气泡 | `status_panel.py` | Window 布局、资源 |
| 疾病/治疗 | Behavior | Window、Store、提示 |
| 日记陪伴 | `pet_window.py` | Diary、Animation |
| 窗口锚点 | `pet_window.py` | 资源尺寸、Physics |
| 存档字段 | `pet_state_store.py` | Decay、Paths、迁移 |

## 10. 代码所有权总结

- 数值真相：`PetState`；
- 数值持久化：`PetStateStore`；
- 身体帧：`PetAnimation`；
- 一般身体优先级：`PetBehaviorStateMachine`；
- 跨模块实际优先级与恢复：`PetWindow`；
- 鼠标手势：`PetPhysics`；
- 身体需求解释：`need_rules.py`；
- 头顶需求解释：`PetNeedIndicator`；
- 日记页面事实：`DiaryBridge.current_page`，再同步到 PetWindow。

理解当前 Pet 代码时不能只看 Behavior。Pet 最终表现是 Window、Behavior、Animation、Physics、NeedIndicator 和 Diary 六部分共同作用的结果。
