# 素材来源与许可

## 本地 CS2 资源

项目使用 Steam 官方内容服务器中的 CS2 资源：app `730`、depot `2347770`、manifest `5009084625236407721`。地图、角色、装备和音频固定使用这一版本。

原始素材属于 Valve 及相应音乐权利人，**不是 CC0**。原始下载位于 `local-assets`，转换产物位于 `public/assets/source2`，工具位于 `.local-tools`；这些目录被 Git 忽略。构建会复制本机原始素材到 `dist`，当前 CI 不发布这些产物。

| 资源 | 原始来源或记录位置 | 转换与适配说明 |
| --- | --- | --- |
| 地图、导航、碰撞、光照和雷达 | `maps/de_dust2.vpk`、`de_dust2_skybox.vpk`；运行 `map.json` | [LOCAL_CS2.md](docs/LOCAL_CS2.md) |
| 武器、手臂、动作、图标和音效 | `weapons/manifest.json`、`data.json`、`audio.json`；第一人称手套包含在 `arms/model.glb` 中 | [LOCAL_WEAPONS.md](docs/LOCAL_WEAPONS.md) |
| SAS / Phoenix 角色与动作 | [source2-characters.json](scripts/source2-characters.json)；运行 `characters/manifest.json` | [LOCAL_CHARACTERS_RADIO.md](docs/LOCAL_CHARACTERS_RADIO.md) |
| 无线电与音乐 | 原始声音事件定义；运行 `media/manifest.json`；共用 [音乐目录](src/game/music-kits.ts) | [LOCAL_CHARACTERS_RADIO.md](docs/LOCAL_CHARACTERS_RADIO.md)、[LOCAL_HIT_AUDIO_MUSIC.md](docs/LOCAL_HIT_AUDIO_MUSIC.md) |
| 投掷物、动作和音效 | [source2-grenades.json](scripts/source2-grenades.json)；运行 `grenades/manifest.json`、`audio.json` | [LOCAL_GRENADES.md](docs/LOCAL_GRENADES.md)、[原始证据](docs/GRENADE_RESEARCH.md) |
| 火焰与爆炸图集 | 原始 `fire_small_sim_b.vtex`、`explosion_fireball_01_flame.vtex`、`explosion_fireball_01_smoke.vtex` 帧序列 | [LOCAL_GRENADES.md](docs/LOCAL_GRENADES.md) |
| 购买界面图标与姿势 | Panorama 原始布局/样式、中文字符串和购买动作；运行 `buy-menu/sources.json`、`poses.json` | [LOCAL_BUY_MENU.md](docs/LOCAL_BUY_MENU.md) |
| 命中音效与命中区域 | 人物/匕首声音事件、角色 MDAT hitbox 集；运行 `hits/sources.json`、`hitboxes.json` | [LOCAL_HIT_AUDIO_MUSIC.md](docs/LOCAL_HIT_AUDIO_MUSIC.md) |
| HUD、脚步与落地 | Panorama HUD、footstep 事件及材质映射；运行 `hud/manifest.json`、`movement/sources.json` | [LOCAL_HUD_MOVEMENT.md](docs/LOCAL_HUD_MOVEMENT.md) |
| C4 与拆弹工具 | 原始 C4/defuser 模型及视模动作；运行 `c4/manifest.json`、`audio.json` | [LOCAL_C4_LOOT.md](docs/LOCAL_C4_LOOT.md) |

表中运行清单路径均相对 `public/assets/source2`，只在准备了本机素材的环境存在。资源数量和体积由 `pnpm check:assets` 检查，当前结果见 [VALIDATION.md](docs/VALIDATION.md)，不在本页重复维护。

模型/声音来源不等于完整移植引擎：体积烟、物理积分、火焰传播、动画分层、音频调度与特效组合由项目实现。各领域文档保留原始数据与浏览器适配的区别。

## 字体 — SIL Open Font License

Barlow / Barlow Condensed 由 Jeremy Tribby 及贡献者制作，通过 `@fontsource/barlow` 和 `@fontsource/barlow-condensed` 本地打包。许可文件随已安装的包保存，许可说明见 [SIL Open Font License](https://openfontlicense.org/)。

## 项目生成内容

网页界面、提示音、弹道/碎屑、物理及部分游戏特效由项目实现；地图、角色和装备使用原始资源。

视觉参考：[Valve CS2](https://www.counter-strike.net/cs2)、[The Return of Dust II](https://www.counter-strike.net/dust2)。本项目是独立本地演练，与 Valve 无关联。
