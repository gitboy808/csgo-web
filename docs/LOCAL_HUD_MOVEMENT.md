# HUD、移动、脚步与队友控制

准备阶段为 **3 秒**，商店打开时暂停本地比赛。本页浏览器实测来自 2026-09-25。

## 资料来源与还原范围

1. HUD 与声音直接从本机 CS2 app 730 / depot 2347770 / manifest `5009084625236407721` 提取。参考文件在 `local-assets/hud-movement/`：`panorama/layout/hud/`、`panorama/styles/hud/`、`soundevents/game_sounds_footsteps.vsndevts`、`scripts/surfaceproperties_footsteps.txt`。这些是资源包中的原始布局、样式、材质映射和声音事件数据。
2. [Valve CS2 展示](https://www.counter-strike.net/cs2)用于核对整体呈现。HUD 采用原始中央血量/弹药结构、64px 阵营圆徽、顶部五人队列、圆形旋转雷达、左下资金、右侧装备轮廓和击杀图标；16 个新增 SVG 来自原包，装备轮廓复用已有资源。浏览器字体仍使用项目中的 Barlow，未声称字体度量与 Panorama 完全一致。
3. [CS2 引擎控制台数据转储](https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/DumpSource2/convars.txt)记录 `sv_accelerate=5.5`、`sv_airaccelerate=12`、`sv_air_max_wishspeed=30`、`sv_friction=5.2`、`sv_stopspeed=80`、`sv_gravity=800`、`sv_jump_impulse=301.99338`、`sv_stepsize=18`。该仓库存放直接转储的游戏数据；本实现采用这些数值，单位按 1 Source unit = 0.0254m 换算。
4. [Valve Source SDK 的移动实现](https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/shared/gamemovement.cpp)提供摩擦、沿期望方向加速及空中控制的公开参考；[脚步实现](https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/shared/baseplayer_shared.cpp)提供速度门槛与步频参考。它们属于 Source 1，不能当作 CS2 未公开的 Subtick 实现。本游戏仍是浏览器 60Hz 固定步长，步频、静步门槛与遮挡混音是重建，未宣称逐帧/逐采样一致。
5. [CS2 竞技模式原始配置](https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/cfg/gamemode_competitive.cfg)明确开启友伤与实体队友，并覆盖引擎默认友伤系数：子弹 0.33、手雷 0.85、其他 0.4，自伤 1，误杀队友扣 $300。使用竞技模式值，避免误用控制台默认的休闲配置。

## 行为与实现

- `movement.ts` 统一地面摩擦、加速、空中控制和单位换算。持刀、枪械与投掷物走同一控制路径；斜向输入限速，转向不直接旋转原有惯性，反向急停比松键滑行更快恢复准确速度。
- Rapier 碰撞后回写受阻速度，修复贴墙仍被判作跑动的问题。重力采用半步积分，台阶高度使用 18 units。角色加入彼此的碰撞查询，并预留已处理角色的下一步位置，防止同一帧双方抢占相同空间。死亡角色关闭碰撞。
- 保存碰撞面的原始材质名；脚步发生时才向下查询地面，不对所有角色每帧做地面射线。看不见的 playerclip 不作为脚步材质。
- 共 29 种地图材质映射、57 个声音事件、218 段原始采样，保留 CT/T 差异、随机音高/音量、原始距离曲线、落地子事件。缺少明确材质覆盖时的材质族回退记录在生成脚本中。
- 普通跑动播放落脚声；稳定静步和蹲行无跑步声。按 Shift 后残余高速仍可出声，跳跃离地不循环脚步，落地根据落速发声。脚步与命中共用 `SpatialAudioBank` 实现，各自有 24 路上限，优先保留本地声音；暂停、离开页面或重新比赛会清理活动声音。
- 子弹命中最近的角色，包括队友；队友会挡住后方敌人。机器人发现射线上有队友时主动停火。友伤使用上述竞技系数，误杀扣款且不发敌方击杀奖励。
- 死亡后鼠标左/右键轮换观战，数字 **1–5** 对应顶部己方队列，**E** 接管所选存活机器人。控制权使用稳定角色 ID 切换，保留角色血量、护甲、弹药、资金、炸弹归属与正在进行的换弹。不能在自身存活或回合已结束时接管，下一回合回到原始玩家。

## 重建与检查

```sh
pnpm exec tsx scripts/prepare-source2-hud-movement.ts
pnpm check:assets
pnpm typecheck
pnpm test
pnpm build
```

本机额外从 Steam 官方内容服务器补齐 `pak01_118.vpk` 和 `pak01_182.vpk`；二者包含缺少的 HUD 图标，原始包不进入网页资源。运行时新增声音约 **11.50 MiB**；浏览器解码缓冲为 **27,522,844 字节 / 26.25 MiB**，全角色共享，最多 4 个并发解码任务。播放时不发起网络请求，不持有第二份压缩音频。

HUD 不增加 3D 预览、全屏模糊或额外渲染目标。雷达沿用缓存地图图像；队列、装备与图标按状态签名更新，普通 HUD 每 50ms 更新一次。

首次回归检查复现了两个问题：贴墙速度仍为 6.35m/s，以及已加载素材后仍播放合成噪声。对应回归现已通过。新增测试覆盖加速/急停/静步、移动角色互相阻挡、死亡后通行、最近队友拦截子弹、连续接管与状态保留。

浏览器验证：四种地面原始事件可播放；实际移动路径触发 `ct_concrete.stepleft`，反向输入后的速度低于准确阈值，稳定静步新增脚步数为 0。接管测试从原角色死亡后控制 MASON，保留 **47 HP / 7 发弹药**；原角色仍死亡。真实骨骼命中、石墙遮挡、木材穿透、安装中断、安装/拆除回归通过，控制台未发现错误。当前汇总见 [VALIDATION.md](VALIDATION.md)。

