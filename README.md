# DUST II — 本地网页演练

桌面键鼠操作的 3D FPS：玩家与 4 名队友机器人对抗 5 名敌方机器人，进行 MR12 爆破比赛。仅使用本机 CS2 原始 Dust II、角色、武器和音频资源；游戏规则、机器人、物理和 Three.js 呈现由本项目实现。

这是独立本地演练项目，与 Valve 无关联。原始素材仅保留在本机，不随源码进入公开仓库。渲染、混音和物理行为不是完整的 Source 2 引擎。

## 启动

本文命令默认在项目根目录执行。

开发环境使用 Node.js 22.12+ 与项目指定的 pnpm 11：

```sh
corepack enable
pnpm install
pnpm check:assets
pnpm dev
```

打开 [本地页面](http://localhost:5173/)，点击“进入战场”启用鼠标锁定与音频。也可双击 [start-local.command](start-local.command)。主页提供地图浏览、枪械训练、投掷物训练和音乐盒试听。

项目只使用原始 CS2 资源，不需要配置 `VITE_MAP`。源码仓库不含这些素材；已有本机原始资源的重建步骤见 [LOCAL_CS2.md](docs/LOCAL_CS2.md)。素材不完整时检查和构建会报错。首次启动需要加载模型、解码音效和预热着色器，开始按钮出现后再进入对局。

## 操作

| 操作 | 按键 |
| --- | --- |
| 移动 / 瞄准 / 射击 | WASD / 鼠标 / 左键 |
| 跳跃 / 蹲伏 / 静步 | Space / Ctrl / Shift |
| 换弹 / 购买菜单 | R / B |
| 主武器 / 手枪 / 匕首 | 1 / 2 / 3 |
| 切换投掷物 | 4 |
| HE / 闪光 / 烟雾 / 诱饵 / 燃烧 | 6 / 7 / 8 / 9 / 0 |
| 投掷 | 左键长抛、右键短抛、双键中抛；松手投出 |
| 选择 C4 / 丢弃装备 | 5 / G；匕首不能丢弃 |
| 安装 C4 | 包点内长按 E，或持 C4 时长按左键 |
| 拆弹 / 替换地面同槽武器 | E |
| AWP 两段开镜 / Glock 三连发切换 | 右键 |
| 检视枪械或 C4 | F |
| 无线电：战术 / 战况 / 回应 | Z / X / C |
| 计分板 / 暂停 | Tab / Esc |
| 阵亡后轮换观战 / 选择队友 / 接管 | 左右键 / 1–5 / E |
| 训练武器库 / 循环选择 | B / [ 和 ] |

空武器槽、可携带的投掷物、CT 拆弹工具和 T 的掉落 C4 支持接近自动拾取。自动拾取不替换同槽装备，也不强制切走当前武器；枪内弹药与备弹保持原值。

## 对局规则

先赢 13 回合获胜，第 12 回合后换边，12:12 平局。准备阶段 **3 秒**，回合 115 秒，炸弹倒计时 40 秒。安装 3.2 秒，拆除 10 秒，有工具时 5 秒；离开范围、停止交互或死亡会中断进度。

准备阶段可在出生区域购买，打开本地购买菜单会暂停对局。支持退款、自动购买、重购和购买投掷。

友伤与存活人物碰撞已开启。队友承受子弹伤害的 33%、手雷的 85%、其他伤害的 40%，误杀扣 $300。指定木质掩体可被步枪穿透。死亡后可接管存活机器人，保留其位置、血量和装备；下一回合恢复原始玩家。

包含 7 种枪械/近战装备、6 类投掷物与 11 套原始音乐盒。枪械数据取自固定版本原始资源；后坐力、移动、弹道、掉落和混音仍有浏览器适配。

## 检查与构建

    pnpm check:architecture
    pnpm check:assets
    pnpm typecheck
    pnpm test
    pnpm build
    pnpm preview

构建使用根路径 `/`，包含类型和资源检查；`pnpm preview` 预览当前产物。GitHub Actions 只运行源码类型检查与测试，不再自动构建或发布原始素材。架构命令仅做只读盘点。

项目结构、模块职责和扩展顺序见 [ARCHITECTURE_AUDIT.md](docs/ARCHITECTURE_AUDIT.md)，当前自动检查与浏览器验收入口见 [VALIDATION.md](docs/VALIDATION.md)。

## 实现与素材记录

| 领域 | 说明 |
| --- | --- |
| 地图、场景修正与重建 | [LOCAL_CS2.md](docs/LOCAL_CS2.md) |
| 枪械与角色 | [LOCAL_WEAPONS.md](docs/LOCAL_WEAPONS.md)、[LOCAL_CHARACTERS_RADIO.md](docs/LOCAL_CHARACTERS_RADIO.md) |
| HUD、移动、脚步与接管 | [LOCAL_HUD_MOVEMENT.md](docs/LOCAL_HUD_MOVEMENT.md) |
| C4、掉落、拾取与预热 | [LOCAL_C4_LOOT.md](docs/LOCAL_C4_LOOT.md) |
| 投掷物 | [LOCAL_GRENADES.md](docs/LOCAL_GRENADES.md)、[GRENADE_RESEARCH.md](docs/GRENADE_RESEARCH.md) |
| 购买与音频 | [LOCAL_BUY_MENU.md](docs/LOCAL_BUY_MENU.md)、[LOCAL_HIT_AUDIO_MUSIC.md](docs/LOCAL_HIT_AUDIO_MUSIC.md) |
| 性能与来源 | [PERFORMANCE.md](docs/PERFORMANCE.md)、[ASSETS.md](ASSETS.md) |

使用 Three.js / WebGL2、Rapier、TypeScript，导航来自原始 Source 2 数据。脚步、C4、枪械、命中、无线电与音乐均使用本机原始资源；画面、物理及部分环境反馈仍由浏览器适配。

设置保存在 localStorage。没有联网对战或遥测。字体 Barlow / Barlow Condensed 通过 Fontsource 本地打包，采用 SIL Open Font License。
