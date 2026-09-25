# CS2 投掷物：固定版本原始证据

核对日期：2026-09-25。目标版本固定为 Steam app `730`、depot `2347770`、manifest `5009084625236407721`。本文保留原始数据、出处和未确认的引擎参数；研究时的重建方向不代表待办清单。当前实现与性能预算见 [LOCAL_GRENADES.md](LOCAL_GRENADES.md)。本地证据链接仅在具备原始素材的机器可用。

本次证据分为三类：**原始数据**是本机固定版本资源中的字段、模型、动画和声音；**官方行为说明**来自 Valve 发布页面；**实现建议**是针对本项目 Three.js / Rapier 架构的近似重建方案。没有把社区百科、论坛中的秒数、伤害曲线或泄漏源码当作 CS2 原始实现。

## 1. 可直接采用的本机参数

原始资源是 `scripts/weapons.vdata_c`，本机文本转换位于 [weapons.vdata](../local-assets/weapons/data/scripts/weapons.vdata)。文本 SHA-256：`3289d4dba65b1ef3f884c389448c8a6c6db8691442c18a7aaddb28434aaf250d`。表格读取最终 `weapon_*` 对象，而不是凭旧版网页数值填写。

| 类型 | 最终对象 | 价格 | `m_nDamage` | `m_flArmorRatio` | `m_flRange` | 原始模型 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| HE | `weapon_hegrenade` | 300 | 99 | 1.2 | 350 | `weapons/models/grenade/hegrenade/weapon_hegrenade.vmdl` |
| 闪光 | `weapon_flashbang` | 200 | 50 | 1.0 | 4096 | `weapons/models/grenade/flashbang/weapon_flashbang.vmdl` |
| 烟雾 | `weapon_smokegrenade` | 300 | 50 | 1.0 | 4096 | `weapons/models/grenade/smokegrenade/weapon_smokegrenade.vmdl` |
| 燃烧瓶 | `weapon_molotov` | 400 | 40 | 1.8 | 4096 | `weapons/models/grenade/molotov/weapon_molotov.vmdl` |
| 燃烧弹 | `weapon_incgrenade` | 500 | 40 | 1.475 | 4096 | `weapons/models/grenade/incendiary/weapon_incendiarygrenade.vmdl` |
| 诱饵 | `weapon_decoy` | 50 | 50 | 1.0 | 4096 | `weapons/models/grenade/decoy/weapon_decoy.vmdl` |

六种对象均有 `m_flThrowVelocity = 750`、`m_flMaxSpeed = [245,245]`、`m_flDeployDuration = 1`、`m_flCycleTime = [0.15,0.3]`。按本项目既有 `0.0254` 单位换算，基础投掷速度为 `19.05 m/s`，持有移动速度为 `6.223 m/s`。**基础投掷速度不等于任何姿态下的最终离手速度**：抛掷力度、抬手角修正、继承人物速度和跳投时机仍需要单独实现和标定。[原始最终对象，起始于 16247 行](../local-assets/weapons/data/scripts/weapons.vdata#L16247)

不能把模板字段直接解释成完整伤害结果。尤其闪光/烟雾的 `m_nDamage=50` 不证明它们应像 HE 一样造成 50 点范围伤害；火焰的 40 也不是每帧扣血量。HE 的 350 同样应保存为原始字段，不应在缺少引擎公式时声称它证明精确的爆炸截止半径。伤害衰减、护甲运算、火焰连续接触累计、闪光白屏曲线都不在这份武器数据中。

燃烧瓶和燃烧弹的 `m_nPrimaryAmmoType` 都是 `AMMO_TYPE_MOLOTOV`，因此实现时应把两者放进同一携带类别，防止同时携带两种火雷。Flash、HE、Smoke、Decoy 各有自己的 ammo type。[原始数据](../local-assets/weapons/data/scripts/weapons.vdata)

携带上限已进一步核对独立文件 `game/csgo/cfg/gamemode_competitive.cfg`（4465 字节，不在 VPK）。本机下载文件的 SHA-1 `8214f02e882326f92e4382363923c204e37cc70c` 与固定版本清单一致；第 88–89 行明确设置 `ammo_grenade_limit_flashbang 2`、`ammo_grenade_limit_total 4`。其他类别各 1 的默认值没有在这份覆盖配置中显式写出，仍需保留为兼容目标，不冒充从武器表读取。Valve 的历史官方说明还指出竞技模式的每回合购买上限与携带上限关联，上一回合保留下来的投掷物计入购买限制；仅在投掷后减少库存而无限次允许再买，会遗漏这一规则。[竞技配置](../local-assets/cs2/game/csgo/cfg/gamemode_competitive.cfg)、[Depot 清单](../local-assets/cs2/manifest_2347770_5009084625236407721.txt)、[Valve 2019-04-22 更新](https://blog.counter-strike.net/zh-hans/2019/04/23874/)

同一份当前竞技配置还明确 `mp_friendlyfire 1`、`ff_damage_reduction_grenade 0.85`、`ff_damage_reduction_grenade_self 1`、`ff_damage_reduction_other 0.4`，以及 `mp_death_drop_grenade 2`（原注释为 current or best）。这些是可靠的规则输入，但火焰/诱饵在引擎内部怎样划分 damage 类别不能仅凭配置名推导；实现若保留本项目的友伤策略，应说明差异，不应声称完全采用原版竞技伤害。

## 2. 动作、材质和音效素材

`local-assets/references/vpk-index.json` 是原始 VPK 索引；它是巨大的单行 JSON，读取时应通过 JSON 过滤路径，不要全文输出。

原始第一人称动作位于 `animation/anims/viewmodel/grenade/`，共找到 60 个 `vnmclip_c`。默认、HE、Flash、Smoke、Molotov、Incendiary 六组，每组都有 draw、idle、两个 inspect、pullpin、high/mid/low charge、overhand 和 underhand。它们在 archive `473`。这些是上手、拉环、持雷、三档力度、出手的直接视觉依据；诱饵未找到独立同级动作组，可复用合适的默认动作，但需明确这是适配。

| 类别 | 资源入口 | 用法 |
| --- | --- | --- |
| 默认投掷动作 | `animation/anims/viewmodel/grenade/_default_grenade/` | `draw_grenade`、`pullpin_grenade`、`throwcharge_high/mid/low_grenade`、`throw_overhand/underhand_grenade` |
| 各雷动作 | `grenade_hegrenade/`、`grenade_flashbang/`、`grenade_smokegrenade/`、`grenade_molotov/`、`grenade_incendiary/` | 将动画时间、释放节点、声音事件与输入状态绑定 |
| 爆炸 | `particles/explosions_fx/explosion_hegrenade*.vpcf_c` | 主体在 archive 20 / 392；包含尘土、烟芯、碎片、火星等层 |
| 闪光 | `particles/explosions_fx/explosion_flashbang.vpcf_c` | archive 366；外部闪光与本地白屏分开处理 |
| 烟雾 | `particles/explosions_fx/explosion_smokegrenade*.vpcf_c` | archive 368；资源包含 fallback，不代表其粒子图就是 CS2 完整体积模拟器 |
| 火焰 | `particles/inferno_fx/molotov_groundfire*`、`incendiary_groundfire*` | Molotov 常见 archive 269 / 315 / 335；Incendiary 常见 251 / 202 / 224 |
| 灭火 | `particles/inferno_fx/extinguish_fire*` | archive 269；蒸汽、烟、熄灭火星独立层 |

以上路径与分卷来自本机固定版本 VPK 索引。VPCF 描述可以提供贴图、颜色和粒子组织参照，无法直接在 Three.js 执行；Source 2 特有算子和体积烟雾仍需适配。

音效定义已在 [game_sounds_weapons.vsndevts](../local-assets/weapons/data/soundevents/game_sounds_weapons.vsndevts) 中转换成文本 KV3。应读取当前事件映射和动画音效事件，不能只按熟悉的旧文件名挑素材。Valve 在 2025-09-16 更新了各类雷的 draw / inspect / pin-pull / throw 声音；当前 VPK 同时保留旧 `pinpull.vsnd` 与新 `HEGrenade.PullPin`、`SmokeGrenade.PullPin` 等事件，旧文件存在不等于当前动作使用它。[Valve 2025-09-16 更新](https://store.steampowered.com/news/posts/?appids=730&enddate=1758150954&feed=steam_community_announcements)

已核对的声音例子：

- `HEGrenade.Draw` → `hegrenade_draw_06.vsnd`；`HEGrenade.PullPin` → `hegrenade_pinpull_08.vsnd`。
- `SmokeGrenade.Draw` → 多个 `smoke_grenade_draw_exp_*`；`SmokeGrenade.PullPin` → `smoke_pinpull_06.vsnd`；`SmokeGrenade.Clear`、`SmokeGrenade.Bounce_Can` 有独立素材。
- `Flashbang.Explode`、`Flashbang.ExplodeDistant` 分近远；`Flashbang.Ring.Long/Medium/Short` 提供耳鸣事件。
- `Molotov.Bounce` 使用玻璃瓶碰撞声；`Molotov.Start`、`StartFailed`、`Smash`、`Loop`、`Extinguish` 分别区分落地燃烧、空中失败、碎裂、循环和灭火。
- `Decoy.Draw`、`Decoy.PullPin`、`Decoy.Throw`、Inspect 系列均有当前映射。假枪声可以复用现有原版枪声库，但选择持有武器、间隔、持续时长和末次小爆炸仍需游戏逻辑实现，不能从 `m_nDamage=50` 推导。

烟雾弹壳不要继续使用统一绿色圆筒材质：Valve 在 2023 年明确把 smoke canister 改为 chrome；本项目应优先保留导出的原始金属/粗糙度材质。[Valve 更新记录](https://store.steampowered.com/news/posts/?appids=730&enddate=1699920625&feed=steam_community_announcements)

## 3. 行为证据与需要近似的部分

| 项目 | 已能确认的依据 | 网页版实现与边界 |
| --- | --- | --- |
| 投掷力度 | 当前原始动作有 high/mid/low 与 overhand/underhand；历史官方更新加入副键近距离下手抛 | 左键高抛、右键低抛、双键中抛；松手后在动作释放点生成弹体。力度系数与离手角不是武器表里的原始常量，需要独立标定 |
| 飞行和弹跳 | 原始 Dust II 有 `csgo_grenadeclip`；官方持续修复屋顶、栏杆、道具反弹 | 使用有限半径 sweep、表面法线反弹、摩擦、静止状态和剩余时间多次接触；不要每帧仅检测单点或一条未考虑体积的射线 |
| HE | 原始模型/声音、Damage99/Armor1.2/Range350；官方要求 HE 不隔墙清烟 | 计时引爆、遮挡伤害、爆炸清烟。计时器、衰减函数、护甲转换、台阶绕障等标为近似 |
| 闪光 | 原始外部爆炸/耳鸣、官方历史记录存在视线遮挡修复；CS2 官方更新要求人物捂眼动作反映实际致盲程度 | 爆点到眼位可见性、视角朝向、距离共同控制白屏与耳鸣；背身不能简单等同正面，也不应只因为超出视锥就完全无效。精确角度/距离曲线未由当前原始数据确认 |
| 烟雾 | CS2 官方明确：动态体积、受光、填充门窗/楼梯/长廊、融合、响应子弹及 HE | 建立受实体墙限制的烟密度；枪弹形成短暂通道，HE 形成更大清空区域，随后恢复。CPU 机器人遮挡必须使用同一烟密度/孔洞状态 |
| 燃烧瓶与燃烧弹 | Valve 2024-05-23：两者火柱高度随时间降低，CT 燃烧弹缩短时长和范围；2025-07-15：CT 燃烧弹扩散更快 | 两种火雷使用不同扩散速度/总范围/寿命；不能把两种火焰完全共用参数。地面接触、斜面和空爆失败分别处理。准确秒数、点火坡度、扩散半径和伤害曲线仍需标定 |
| 烟雾灭火 | 官方修复过烟雾与火焰追地、重叠烟云过早灭火；原始素材有 Extinguish | 按烟云到燃烧单元的实际接触熄灭，添加气流/蒸汽和原音效；避免一个烟弹因中心距离接近而隔墙清掉另一房间全部火焰 |
| 诱饵 | 原始模型/声音/字幕；CS2 更新说明诱饵可在烟中产生视觉交互 | 小型声源在原地播假枪声、制造声源感知和烟内轻微扰动；不发真实弹丸，不沿假枪声打击人物。精确假声策略与终止爆炸参数作为适配逻辑 |

依据：[Valve CS2 展示](https://www.counter-strike.net/cs2)、[Valve 2014 下手抛更新](https://store.steampowered.com/news/posts/?appids=730&enddate=1391781599)、[Valve 2023-03-30：HE 不隔墙清烟](https://store.steampowered.com/news/posts/?appids=730&enddate=1682382746&feed=steam_community_announcements)、[Valve 2024-05-23：火焰差异](https://store.steampowered.com/news/posts/?appids=730&enddate=1717536833&feed=steam_community_announcements)、[Valve 2025-07-15：CT 火焰加快展开](https://store.steampowered.com/news/posts/?appids=730&enddate=1753835380&feed=steam_community_announcements)、[Valve 2024-11-13：致盲动作](https://store.steampowered.com/news/posts/?appids=730&enddate=1733866481&feed=steam_announce/1000)、[Valve 2025-08-26：重叠烟雾灭火修复](https://store.steampowered.com/news/posts/?appids=730&enddate=1757373438&feed=steam_community_announcements)。表内没有得到当前精确值的部分是实现建议，不声称已复制 Valve 引擎公式。

闪光与 HE 的遮挡不能完全混用一个“眼睛到眼睛”检测：HE 至少考虑爆点到受击胶囊多个样点，减少台阶挡住单条射线就完全免伤的假象；闪光重点在眼位。Valve 历史更新确认 HE 曾针对小障碍/楼梯做修复，闪光追踪也专门排除了人质遮挡。但这是行为方向参考，不是证明 CS2 当前完整追踪算法。[Valve 2020-05-11 更新](https://blog.counter-strike.net/it/2020/05/30080/)

**尚未取得当前引擎原始公式的参数**：HE/闪光引信、烟/诱饵低速引爆门限及延时、投掷重力倍率、弹性/摩擦、释放点偏移及角度修正、人物速度继承系数、烟雾寿命及密度扩张函数、枪弹/HE 孔洞半径及恢复时间、闪光强度曲线、火焰伤害/扩散/空爆门限。实现时把它们集中为可测试参数并标注近似来源，避免“听说是 1.5 秒/18 秒/22 秒”变成伪造的原始数据。

当前性能策略统一见 [LOCAL_GRENADES.md](LOCAL_GRENADES.md#性能设计) 和 [PERFORMANCE.md](PERFORMANCE.md)，验收入口见 [VALIDATION.md](VALIDATION.md)。
