# 验证入口与当前结果

复核日期：2026-09-26。项目仅支持原始 CS2 模式，构建和运行需要本机素材。

## 检查入口

```sh
pnpm check:architecture
pnpm check:assets
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

`check:architecture` 输出依赖盘点，不会因报告结构问题而自动失败。`check:assets` 始终要求原始 CS2 素材，检查运行清单与 glTF/GLB 外部引用；它只报告额外文件，不自动删除。`build` 包含类型检查及资源检查，随后由 Vite 打包，不再生成 Recast 导航。

缺少原始素材时，源码 CI 可做类型检查并运行通用行为测试，原始地图/模型/音效测试按可用资源跳过。CI 不再构建和发布 GitHub Pages；素材准备见 [LOCAL_CS2.md](LOCAL_CS2.md)。

## 本次结果

| 检查 | 结果 |
| --- | --- |
| 架构 | 57 个源码模块在包含类型导入的入口图中可达；运行图与含类型的图均无循环；无未解析动态导入或没有其他文件引用的运行值导出 |
| 类型 | `pnpm typecheck` 通过 |
| 测试 | 23 个文件、108 项测试通过 |
| 源资源 | 1,880 个运行引用文件、121 个 glTF/GLB，缺失 0 |
| 构建 | `pnpm build` 通过；主 JavaScript 约 3.82 MB，仍有大型分块提示 |
| 文档 | 本地文件链接与标题锚点检查通过；`git diff --check` 通过 |

本次删除 23 项过时或重复测试，具体依据见 [ARCHITECTURE_AUDIT.md](ARCHITECTURE_AUDIT.md#测试精简依据)。没有以新增镜像测试抵消删除。

## 浏览器检查

已检查本地原图加载、地图浏览和训练入口，启动后无控制台错误。后台验收窗口不能取得鼠标锁定，训练会按既有逻辑暂停；这次未把它当作完整键鼠实战或 FPS 验收。

开发构建只保留 `window.__dust.snapshot()` 和 `window.__dust.performance()` 两个只读诊断入口。旧 `?qa=1` 测试面板、状态修改命令和专用压测场景已移除，生产构建不挂载诊断入口。

修改对应模块时按需检查：

| 领域 | 检查重点 | 说明 |
| --- | --- | --- |
| 地图与材质 | 固定机位、出生地面、贴花/窗洞、阴影 | [LOCAL_CS2.md](LOCAL_CS2.md)、[PERFORMANCE.md](PERFORMANCE.md) |
| 枪械与角色 | 换弹、骨骼命中、墙体遮挡、死亡/复活 | [LOCAL_WEAPONS.md](LOCAL_WEAPONS.md)、[LOCAL_CHARACTERS_RADIO.md](LOCAL_CHARACTERS_RADIO.md) |
| 移动与团队 | 急停、静步、队友碰撞、死亡后接管 | [LOCAL_HUD_MOVEMENT.md](LOCAL_HUD_MOVEMENT.md) |
| C4 与拾取 | 安装中断/拆除、空槽拾取、弹药保留 | [LOCAL_C4_LOOT.md](LOCAL_C4_LOOT.md) |
| 投掷物 | 六类投掷、烟火交互、闪光遮挡、回合清理 | [LOCAL_GRENADES.md](LOCAL_GRENADES.md) |
| 购买与声音 | 退款/重购、头像、音乐切换、音效回收 | [LOCAL_BUY_MENU.md](LOCAL_BUY_MENU.md)、[LOCAL_HIT_AUDIO_MUSIC.md](LOCAL_HIT_AUDIO_MUSIC.md) |

领域文档中的历史浏览器记录不是本次重测。比较性能时固定机位、角色、特效、画质、缓冲尺寸和帧率上限；不同对局中的 FPS 不直接作前后对照。
