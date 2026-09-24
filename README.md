# DUST II — 回到尘土之中

一个可在浏览器中直接游玩的 3D 战术射击游戏。玩家和 4 名友方 AI 对抗 5 名敌方 AI，在独立重建的 Dust II 风格地图中进行 MR12 爆破比赛。

**独立致敬作品，与 Valve 无关联。** 地图、角色、武器由代码重新制作；这不是 CS2 官方地图文件、官方游戏移植或像素级复刻。布局和画面属于针对浏览器的独立近似重建。

## 游玩

使用开启硬件加速的桌面 Chrome 或 Edge，点击「进入战场」后允许鼠标锁定。无需账号或额外服务器。所有对局在本地浏览器中执行。

| 操作 | 按键 |
| --- | --- |
| 移动 / 瞄准 / 射击 | WASD / 鼠标 / 左键 |
| 跳跃 / 蹲伏 / 静步 | Space / Ctrl 或 C / Shift |
| 换弹 / 买枪 | R / B |
| 主武器 / 手枪 / 匕首 | 1 / 2 / 3 |
| 切换投掷物 / 投掷 | 4 / 左键 |
| 选择 C4 / 丢弃当前武器或 C4 | 5 / G |
| 拾取 / 按住安装或拆除 | E |
| AWP 狙击镜 | 右键 |
| 计分板 / 暂停 | Tab / Esc |
| 阵亡后切换观战队友 | 左键 |

先赢 13 回合获胜，12 回合后换边，12:12 平局。准备时间 15 秒，攻防时间 115 秒，炸弹 40 秒爆炸。安装需要 3.2 秒，拆除需要 10 秒，拆弹工具缩短至 5 秒。停止交互、离开范围或死亡会取消进度。准备阶段只在出生区可以买枪。

包含 AK-47、M4A1-S、AWP、Glock-18、USP-S、Desert Eagle、M9 匕首与三种投掷物。友军枪击伤害关闭；高爆手雷和 C4 会造成范围伤害。步枪能穿透一层指定木质掩体，造成衰减伤害。规则、经济和枪械参数为此独立游戏的固定配置，并非完整 CS2 参数模拟。

## 本地开发

需要 Node.js 22.12+，使用项目指定的 pnpm 11。

```sh
corepack enable
pnpm install
pnpm run assets
pnpm dev
```

```sh
pnpm test
pnpm run build
pnpm preview
```

生产环境默认路径是 `/csgo-web/`，预览时访问该路径。其他托管路径可用 `BASE_PATH=/ pnpm run build` 覆盖。

## 实现

- Three.js WebGL2：PBR 材质、太阳阴影、SSAO、独立第一人称武器场景、区域合批。
- Rapier：固定 60 Hz 角色碰撞、斜坡、自动跨步、跳跃与射线遮挡。
- Recast：构建时生成导航网格；AI 具有视线和声音感知、反应延迟、射击误差及攻守目标。
- TypeScript：地图、枪械、经济、回合与炸弹状态相互分离。
- Web Audio：本地合成枪声、脚步、弹着点、换弹与炸弹音效，不请求远程音频。
- 设置存储在 localStorage；不收集玩家数据，不包含联网对战或遥测。

修改地图后运行 `pnpm run assets` 更新导航数据。`pnpm run build` 会自动更新并执行类型检查。测试覆盖经济、装填、伤害、判胜优先级、换边、地图连通和实际物理碰撞。

## GitHub Pages

仓库 Settings → Pages → Source 选择 **GitHub Actions**。推送到 `main` 后自动构建、测试并部署。工作流仅需要内置 `GITHUB_TOKEN`，不需要个人 Token 或其他秘密配置。

## 素材

见 [ASSETS.md](ASSETS.md)。全部运行资源随项目发布；纹理来源、下载 URL 与校验值见 `public/assets/materials.json`。可运行 `python3 scripts/fetch-textures.py` 重建纹理目录。

字体使用 Barlow / Barlow Condensed（SIL Open Font License），通过 Fontsource 本地打包。地图名称和相关游戏名称属于其各自权利人。
