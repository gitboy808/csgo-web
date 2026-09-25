# Dust II 原图本地版

项目仅保留原始 CS2 素材模式，直接启动即可。原始素材不随仓库检出，缺少素材时应先完成本机准备。

## 启动

```sh
pnpm install
pnpm dev
```

也可以双击根目录的 `start-local.command` 启动。

打开 <http://localhost:5173/>。首页「浏览地图」可以切换 A/B 包点、中门、A 大、A 小、B 洞和出生点，也可以拖动旋转、右键平移和滚轮缩放。

直接进入地图浏览：<http://localhost:5173/?inspect=1>。

## 原始数据

- 来源：Steam 官方内容服务器，Counter-Strike 2（app 730），depot 2347770。
- 固定内容清单：`5009084625236407721`（2026-09-23）。使用 Steam 允许的匿名服务器订阅下载。
- 地图：`game/csgo/maps/de_dust2.vpk`；远景：`maps/prefabs/de_dust2/de_dust2_skybox.vpk`。
- 主地图保留 4,542,449 个可见三角面；远景保留 85,591 个三角面。仅排除原本不显示的工具材质。
- 使用原始 2242 个导航区域、定向连接、出生点、购买区、包点范围、点位范围与 435,685 个碰撞三角面。
- 坐标统一为米：`X = Source X × 0.0254`，`Y = Source Z × 0.0254`，`Z = -Source Y × 0.0254`。
- 模型仅进行无损 Meshopt 编码；没有对顶点位置做量化或简化。贴图保持原始尺寸，转换为无损 WebP。
- 使用原始雷达、8192×8192 HDR 光照贴图、HDR 天空、烟尘遮罩，以及原图的太阳方向和颜色。
- 支持多重绘制的浏览器将 2930 个静态物件归为 261 批，保留原始几何、光照 UV 和逐物件视野裁剪。
- 当前资源规模通过 pnpm check:assets 检查，目录包含地图、枪械、角色、投掷物、C4、脚步、无线电和音乐。首次载入需要解码大量原始纹理；音乐按需流式播放。使用本地文件服务，不依赖远程 CDN。

原始游戏素材版权属于 Valve。素材、工具与转换产物保留在本地，并由 Git 忽略规则排除，来源索引见 [ASSETS.md](../ASSETS.md)。

## 转换工具与目录

- `.local-tools/depot/DepotDownloader`：SteamRE DepotDownloader 3.4.0。
- `.local-tools/source2/Source2Viewer-CLI`：Source 2 Viewer 20.0。
- `.local-tools/vrf-source`：兼容 VCS 72 的 VRF 源码，提交 `4154300943f9206f4e9d88fd900feadb5cb7a9d4`。
- `.local-tools/dotnet`：本地 .NET 10 SDK。
- `local-assets/cs2`：地图与所需 VPK 分片；文件清单、资源引用和处理日志位于 `local-assets/references`。
- `local-assets/export-current`：兼容版本导出的 glTF 与原始 PNG。
- `public/assets/source2`：浏览器使用的模型、纹理、碰撞、导航、光照与雷达数据。

已有原始数据时，模型可以重新无损打包：

`scripts/prepare-source2-model.ts` 默认从 `local-assets/export-current/de_dust2.gltf` 读取主地图；天空盒通过显式输入和输出路径转换。

```sh
pnpm exec tsx scripts/prepare-source2-model.ts local-assets/export-current/de_dust2.gltf public/assets/source2/de_dust2.gltf
pnpm exec tsx scripts/prepare-source2-model.ts local-assets/export-current/sky/de_dust2_skybox.gltf public/assets/source2/sky/de_dust2_skybox.gltf
```

`scripts/source2-helper` 使用 VRF 库读取导航文件和导出地图；`scripts/prepare-source2-data.ts` 生成统一坐标下的碰撞与玩法数据。源码版 VRF 可用时自动优先使用，否则使用固定的 NuGet 版本。

这些命令用于已有输入的本机增量重建。完整转换还依赖原始 VPK、导航/实体导出、声音定义和各装备的 AO 参考，尚无从空目录开始的一键资源流水线；领域步骤见 [README 文档索引](../README.md#实现与素材记录)。

## 场景与地面对齐

固定 VRF 版本 `4154300943f9206f4e9d88fd900feadb5cb7a9d4` 导出的深度偏移表面，存在沿法线约 `0.01 / 0.0254 = 0.393700787m` 的额外几何位移。运行时在合批前通过 [source2-surfaces.ts](../src/world/source2-surfaces.ts) 撤销外扩，改用光栅深度偏移处理共面表面；共享位置属性先克隆，同一几何只修正一次。原始 UV、法线和裁切遮罩保留。

贴花的 Modulate / Multiply 使用对应调制混合，关闭深度写入与投影，合批保留绘制顺序。升级导出器时应重新核对 `source2OverlayOffset`，避免对已修正输入重复补偿。

远景天空盒的沙地曾遮住 CT 出生地面。[source2-layers.ts](../src/world/source2-layers.ts) 将远景先绘入背景场景，清除深度，再绘制主地图；主地图、碰撞和出生点保持原始坐标。地面对齐检查使用同一运行时分层和表面修正。

历史场景验收覆盖 A 点全景、A/B 包点、中门、A 大、A 小、B 洞和双方出生点九个机位，未再出现同类窗洞/贴花外扩；五个 CT 出生点的脚底间隙为 0.025m。这些视觉记录未在本次文档整理时重测。

回归入口：[source2-surfaces.test.ts](../tests/source2-surfaces.test.ts)、[source2-ground.test.ts](../tests/source2-ground.test.ts) 和 [source2.test.ts](../tests/source2.test.ts)。地面对齐可单独运行 `pnpm exec tsx scripts/check-source2-ground.ts`，阴影与性能检查见 [PERFORMANCE.md](PERFORMANCE.md)。

## 验证与边界

```sh
pnpm typecheck
pnpm test
pnpm build
```

原图测试覆盖双方所有出生点到 A/B 的路径、碰撞与出生高度、CT→A 与 T→B 的真实角色行走。寻路区分普通通行与需要跳跃/垫人的连接。

地图几何、主要贴图和空间数据来自原作。枪械和第一人称动作、音效现也使用原始资源，见 [LOCAL_WEAPONS.md](LOCAL_WEAPONS.md)。双方角色现已使用原版 SAS / Phoenix，详见 [LOCAL_CHARACTERS_RADIO.md](LOCAL_CHARACTERS_RADIO.md)；枪战求解与机器人仍由本项目实现。浏览器采用 Three.js 渲染，对风动、烟尘、半透明与光照做了适配，并不是 Source 2 渲染器本身，视觉效果仍可能存在差异。

参考：[Source 2 Viewer 地图导出](https://s2v.app/ValveResourceFormat/guides/exporting-maps.html)、[DepotDownloader](https://github.com/SteamRE/DepotDownloader)。

当前自动检查及其适用范围见 [VALIDATION.md](VALIDATION.md)。
