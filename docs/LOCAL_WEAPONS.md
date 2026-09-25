# 本地原始枪械与手感修订

当前本地版包含 AK-47、M4A1-S、AWP、Glock-18、USP-S、Desert Eagle 与 M9。主页「枪械训练」可以免费选用全部武器，在 A 大对三个自动恢复的目标试射。B 打开武器库，`[` / `]` 切换，R 换弹，F 检视；AWP 右键切换两段缩放，Glock 右键切换半自动 / 三连发。

CT 出生地面与远景遮挡的说明、回归入口统一见 [地图场景修正](LOCAL_CS2.md#场景与地面对齐)。

## 素材与适配

来源为 Steam 官方内容服务器的 CS2 app 730 / depot 2347770 / manifest `5009084625236407721`，与本地图版本相同。资源与转换产物均留在本机，不随 Git 公开发布。

- 六把枪使用原始 HD body；M9 使用该资源自带的 body。避免把互斥的 legacy / HD 模型同时显示。
- 手臂和手套、拔枪、射击、换弹、空仓和检视动作来自原始 `vmdl` / `vnmclip`。手套包含在 `arms/model.glb` 中，不需要独立手套模型；保留骨骼与动画采样，通过原手臂骨架的 `wpn` 挂点连接枪械。
- 52 份模型与动作导出物、7 个原始武器 SVG 图标。
- 74 个原始声音事件、130 份声音文件；换弹和检视使用原动画内的声音触发时间。进入游戏前预先解码。
- 模型保留原始几何精度；纹理使用原尺寸无损 WebP。通过与原始 AO 对照，修正部分导出 ORM 纹理红 / 蓝通道错位，未靠增亮或删除 AO 掩盖。
- 枪口闪光跟随枪械骨骼上的枪口位置。

原始脚本 `scripts/weapons.vdata_c` 提供射速、弹匣与备用弹量、伤害、护甲与爆头倍率、射程衰减、移动速度、散布、精度恢复、后坐力参数和种子。运行数据在 `public/assets/source2/weapons/data.json`，可回查完整原始字段。

## 手感实现

枪械后坐力与鼠标瞄准角度分开，停火后回正。以武器原始参数和种子生成可重复的后坐力序列；站立、蹲伏、移动、跳跃、连射与开镜使用相应精度。加入地面摩擦、加速与反向急停，按原始武器移动速度限制。

弹药在原换弹动作的 AddAmmo 时刻装入，随后完成剩余动作；插弹匣前取消不增加弹药，插入后不会重复扣除。连续射击保留射击时间余数，避免固定步长每发累计降低射速。Glock 三连发使用 0.05 秒弹间隔和 0.5 秒组间隔。

鼠标按 Source 常用的 0.022 度 / 计数单位乘以灵敏度，浏览器支持时请求原始鼠标输入。鼠标锁定仍需要在前台浏览器中点击开始 / 继续。

## 重建与验证

已有本地原始资源时：

```sh
python3 scripts/export-source2-weapons.py
pnpm exec tsx scripts/prepare-source2-weapon-data.ts
pnpm exec tsx scripts/prepare-source2-weapons.ts
python3 scripts/export-source2-audio.py
pnpm typecheck
pnpm test
pnpm build
```

`local-assets/weapons` 保存原始导出物、声音事件、参考贴图和日志。`public/assets/source2/weapons` 是浏览器资源；两个目录都位于忽略规则中。转换使用已有的 Source 2 Viewer、当前 VRF 库与 .NET 工具。

通过主页枪械训练检查实际持握、换弹、检视和开镜。旧开发验收面板已移除；只读诊断与当前回归入口见 [VALIDATION.md](VALIDATION.md)。

## 实际边界

模型、贴图、动作、声音与上述数据来自原作。Three.js 材质与混音、后坐力和移动求解仍是浏览器重建，不是 Source 2 引擎或其 subtick 实现；不保证逐像素、逐帧一致。当前使用默认外观，M4A1-S / USP-S 固定消音器配置。角色现已升级为原版 SAS / Phoenix，详情见 [LOCAL_CHARACTERS_RADIO.md](LOCAL_CHARACTERS_RADIO.md)。命中体积、指定木材穿透、步声和爆炸混音仍采用本项目实现。

参考：[Valve 工坊资源](https://www.counter-strike.net/workshop/workshopresources)、[Source 2 Viewer 动画与格式支持](https://s2v.app/ValveResourceFormat/guides/format-support.html)。
