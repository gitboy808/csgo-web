# 部位命中音效与音乐盒 — 2026-09-25

在 `http://localhost:5173/` 进入对局或枪械训练可体验命中音效；主页「♫ 音乐盒」选择、装备和试听。全部素材在本机运行。

## 查证与素材

取自项目已固定的 Steam 官方内容：app **730**，depot **2347770**，manifest **5009084625236407721**，没有混用不同版本的音频。

- 原始人物声音定义：`soundevents/game_sounds_player.vsndevts_c`。原文件明确区分 `AttackerFeedback`、`Victim`、`Onlooker`，以及 `Damage` / `Death`、`Body` / `BodyArmor` / `HeadShot` / `HeadShotArmor`。原定义保存在 `local-assets/hit-audio/player.vsndevts`。
- 原始匕首声音：`soundevents/game_sounds_weapons.vsndevts_c` 中的 `Weapon_Knife.Hit.Light.Flesh`、其子事件与 `Weapon_Knife.HitWall`；燃烧受击沿用原始 `Player.BurnDamage`。
- 命中几何来自 SAS / Phoenix `.vmdl_c` 的 `MDAT.m_hitboxsets`，每方 **19 个原始胶囊**，保留骨骼绑定、半径、端点、部位 ID。转换结果仅 **5,074 字节**，不是逐顶点射线检测。
- 音乐定义为 `soundevents/music/<source>/game_sounds_music.vsndevts_c`，封面来自 `panorama/images/econ/music_kits/<source>_png.vtex_c`。名称用原始 `resource/csgo_schinese.txt` 核对；特别区分 `neckdeep_01`（人生何处不青山）和 `neckdeep_02`（躺平青年）。

[Valve 音乐盒介绍](https://blog.counter-strike.net/2014/10/10432/)说明音乐覆盖游戏阶段并包含 MVP 凯歌；[EZ4ENCE 官方更新](https://blog.counter-strike.net/2019/03/23732/)确认曲目归属。[Initiators 官方公告](https://blog.counter-strike.net/da/2022/08/39444/)列出 Knock2 等音乐人。本轮选择常见曲目扩充，没有把社区偏好描述为官方使用率排名。

## 命中行为

- 由骨骼驱动的原始区域取代三个大球：头、颈、胸、腹、左右臂、左右腿，蹲伏时跟随真实动作。渲染裁剪隐藏的人物仍能更新命中姿态。
- 子弹先与地图遮挡比较，再取最近的胶囊表面；原有指定木材穿透保留。头部使用枪械爆头倍率，腹部 1.25、腿部 0.75；腿部不消耗防弹衣。
- 先记录中弹前的护甲 / 头盔状态，再扣除护甲，防止击穿最后一点护甲时错误播放裸头音效。
- 射击者、受击者、旁观者使用不同的原始事件；根据是否致命切换事件。胸腹与受保护手臂共用防弹衣声音、裸露肉体共用肉体声音，遵循原始分组。
- 头盔致命命中的父事件原始音量为零，但它的肉体声和金属声子事件仍需同时播放。保留子事件的独立音量、音高和延迟，不重复叠加旧合成命中声。
- 保留原始样本，没有重新编码或音量归一化。使用原始事件音量、微小音高随机范围、变体、延迟、距离曲线和同目标冷却；旁观声音根据方向和墙体遮挡混音。

当前命中声音库是 **40 个事件 / 53 个唯一文件**（包含燃烧受击、匕首及其叠加层）。`public/assets/source2/hits/sources.json` 记录原始路径，`audio.json` 记录运行事件。

## 音乐盒

| 显示名称 | 音乐人 | 原始目录 |
| --- | --- | --- |
| CS2 默认 | Valve | `valve_cs2_01` |
| CS:GO 经典 | Valve | `valve_01` |
| EZ4ENCE | The Verkkars | `theverkkars_01` |
| dashstar* | Knock2 | `knock2_01` |
| 迈阿密热线 | 多名作曲家 | `hotlinemiami_01` |
| 闪光舞 | The Verkkars & n0thing | `theverkkars_02` |
| ULTIMATE | Denzel Curry | `denzelcurry_01` |
| 花脸 | Perfect World | `perfectworld_01` |
| 人生何处不青山 | Neck Deep | `neckdeep_01` |
| 躺平青年 | Neck Deep | `neckdeep_02` |
| 你急了！ · u mad! | bbno$ | `bbnos_01` |

每套都有 12 种阶段映射：菜单、比赛开始、准备、行动、回合十秒、安包、炸弹十秒、胜、负、阵亡、MVP、比赛结束。共 **154 个唯一音乐文件**，没有用同一段 MVP 替代整套配乐。保留各个变体自己的开始 / 循环点；MVP 播完即结束，可延续至下一轮准备阶段，进入行动或目标警报时中断。

装备选择原地更新，不重建整张音乐盒网格。封面延迟加载，支持键盘焦点、小屏滚动、独立音量和设置持久化。

## 性能策略与历史实测（2026-09-25）

- 命中样本压缩体积 **2,513,917 字节**；本机 Chromium 解码后 **13,565,072 字节（12.94 MiB）**。启动时 4 路并行解码，释放输入字节，所有角色共享缓冲；交战中不下载、不解码。
- 命中音轨上限 **24**；超限优先替换低优先级旧声音，保护玩家受击 / 命中反馈。播放完、暂停、返回菜单会断开并释放临时音源和节点。
- 浏览器一次提交 **100 个致命头盔旁观事件**（含叠加层）耗时约 **7.4 ms**，同时发声最多 24 路，3 秒后活动数回到 0。这是提交压力测试，不是整场 GPU / 帧率测量。
- 原枪械 / 投掷物声音也改为 6 路并行解码，移除了长驻的重复压缩字节及二次解码路径。
- 新增 9 套音乐文件占本地磁盘 **155,364,132 字节（148.17 MiB）**，不进入首屏资源预载或 Web Audio 解码缓存。音乐使用浏览器媒体流，仅请求当前曲目；最多保留一条当前流与一条短暂淡出流。快速切换、静音、关闭音乐和暂停均正确释放旧流。
- 浏览器逐套验证全部 11 个 MVP：`readyState=4`、正常播放、无媒体错误。静止试听 2 秒 **新增世界绘制 0 次**，音乐正常推进。主菜单背景只在音乐盒关闭后恢复。
- 实际 `Game.shoot` 验证：Glock 对真实头部击杀，石墙后目标无伤，AK 穿指定木材后目标剩余 21 HP，分别选择致命 / 非致命爆头事件。当前测试与验收入口见 [VALIDATION.md](VALIDATION.md)。

## 重建

本机已保留所需官方 VPK 和固定版本 Source 2 Viewer。缺失 VPK 时只补取固定 manifest 中的对应分片，不换成其他版本。

```sh
node --import tsx scripts/export-source2-sound-definitions.ts
node --import tsx scripts/prepare-source2-hit-audio.ts
python3 scripts/export-source2-hit-audio.py
node --import tsx scripts/prepare-source2-media.ts
python3 scripts/export-source2-media.py
pnpm test
pnpm build
```

运行资源和原始文件继续按项目约定被 Git 忽略；素材属于 Valve / 各音乐权利人，不是 CC0，本轮没有部署或推送。

音效文件、命中胶囊和事件参数来自原版，但网页没有移植完整 Source 2 音频图、混响 / HRTF 与网络回溯。距离曲线、遮挡和音效调度是 Web Audio 实现，音乐循环由媒体元素与约 50 ms 后台调度控制，不能宣称逐样本一致。环境脚步、完整墙面弹着音库等不属于本轮人物命中替换范围。
