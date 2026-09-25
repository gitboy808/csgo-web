# 本地角色、无线电与音乐盒

本地地址：`http://localhost:5173/`。服务未运行时双击 `start-local.command`。

## 已实现

- **角色**：CT 使用 CS2 原始 SAS，T 使用原始 Phoenix。替换此前的几何体人物，保留原始面罩、服装、护具、手套、装备和 PBR 贴图。世界模型只启用 thirdperson body / gloves，CT 拆弹工具随装备显示。
- **动作**：53 组原始第三人称动作（包含后续投掷物更新），覆盖步枪、手枪、匕首的站立、四向跑步、慢走、蹲伏与空中姿态，以及按武器区分的持枪、射击、换弹，受击、倒地、安装与拆除。上下半身分层，武器使用 `wpn` 挂点；六把枪保留第三人称枪机和弹匣动作。死亡后禁用碰撞，下一回合复位骨架。
- **无线电**：45 组事件、211 段原始语音（包含后续燃烧 / 诱饵呼叫）。SAS / Phoenix 分别使用自己的声音，中文显示说话人、地点与内容。队友发现敌人、投掷物、安装 / 拆除、交战和回合开始会触发播报。只传递己方战术语音，不借敌方无线电泄露位置。
- **播报秩序**：炸弹安装、拆除及胜负由原始播报员发声。高优先级播报中断战术闲聊；拆弹完成后先播拆除，再播 CT 获胜。相同战术消息限频，过期消息丢弃；暂停、重开清理队列。
- **音乐盒**：菜单的「♫ 音乐盒」提供 **11 套原始音乐盒**，包含两套 Valve 默认 / 经典及新增 9 套；完整列表见 [部位音效与音乐扩充](LOCAL_HIT_AUDIO_MUSIC.md)，使用原始封面，可装备、试听。包含主菜单、比赛开始、准备阶段、行动开始、回合最后十秒、安装后、炸弹最后十秒、胜 / 负、死亡、MVP、比赛结束。每轮根据目标完成或本轮击杀评选 MVP，并显示姓名与原因。MVP 乐曲可延续至下一轮购买时间。
- **混音**：主音量、无线电音量、音乐音量分开保存；无线电发声时自动压低音乐，暂停 / 切换标签页暂停音乐。短语音提前解码，长音乐按需流式播放。浏览器首次播放需要点击页面。

## 操作

- `Z`：战术命令；`X`：战况；`C`：回应。
- 菜单打开后 `1`–`6` 发送对应无线电，`0` 关闭。Esc 仍可触发浏览器退出鼠标锁定。
- 主菜单「♫ 音乐盒」选择并试听，游戏设置中也可切换或关闭音乐，以及调节两个独立音量。
- 对局仍使用 WASD / 鼠标，B 购买，R 换弹，E 交互，Tab 计分板。

## 来源与转换

所有模型、动画、语音和音乐均来自 Steam 官方内容服务器：app **730**，depot **2347770**，manifest **5009084625236407721**，与本地图 / 枪械版本相同。不是 CC0，不作为公开仓库素材发布。

- 原始模型与动作路径：`scripts/source2-characters.json`。
- 语音：`soundevents/vo/agents/game_sounds_sas.vsndevts_c`、`game_sounds_phoenix.vsndevts_c` 与 `soundevents/vo/announcer/game_sounds_cs2_classic.vsndevts_c`。
- 音乐：`soundevents/music/valve_cs2_01/game_sounds_music.vsndevts_c` 和 `soundevents/music/valve_01/game_sounds_music.vsndevts_c`。以及 [音乐目录](../src/game/music-kits.ts) 中的 9 套追加配乐。保留原曲、版本变体、音量与各变体独立的循环 / 停止时间。
- 使用当前固定版本 ValveResourceFormat 导出，AG2 动作按世界骨架重定向到各角色骨架；移除第一人称专用网格与辅助骨架预览。
- 校正部分 ORM 导出图的 R / B 通道：与原始 AO 逐像素对照后修正，保留原分辨率无损 WebP。
- 叠加动作以世界骨架的中立姿态重新计算差值；Source 的乘法缩放 1 转换为 Three.js 的加法缩放 0，避免逐级放大。移动动画去除水平根位移，角色仍由物理 / 导航定位。

## 本机重建

当前机器已有原始 VPK、声音定义与原始 AO 参考 PNG。其位置分别为 `local-assets/cs2`、`local-assets/characters`、`local-assets/characters/raw`。

```sh
.local-tools/dotnet/dotnet build scripts/source2-helper
python3 scripts/export-source2-characters.py
pnpm exec tsx scripts/prepare-source2-characters.ts
pnpm exec tsx scripts/prepare-source2-world-weapons.ts
pnpm exec tsx scripts/prepare-source2-media.ts
python3 scripts/export-source2-media.py
pnpm typecheck
pnpm test
pnpm build
```

原始文件、转换中间产物、日志与运行资源均被 `.gitignore` 排除。浏览器资源位于 `public/assets/source2/characters`（约 99 MiB）、`public/assets/source2/media`（约 197 MiB）及枪械库的 `world.json`。

## 实际边界

使用的是原版资源，渲染、动画分层、机器人、MVP 评选与混音调度由此网页实现。动态人物光照是对环境照明的近似，没有移植 Source 2 的完整角色着色器、IK、布料、物理布娃娃或音频混音图；不承诺逐像素、逐帧一致。当前提供 11 套音乐盒，并非商店全部曲目。没有部署或推送本轮资源。

技术参考：[Source 2 Viewer 格式支持](https://s2v.app/ValveResourceFormat/guides/format-support.html)、[Valve 音乐盒说明](https://blog.counter-strike.net/2014/10/10432/)。
