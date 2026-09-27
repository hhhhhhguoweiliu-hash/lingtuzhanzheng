# 领土战争 · 录像复刻版

根据用户提供的《解压来一局》三段录像制作的可离线游戏。已实现首页、初始成长、地图战斗和结算闭环；尚未通过“与原版完全一致”的验收。关键差异是发兵持续语义、特殊据点作用、早期关卡及外围经济规则，详见 [差异报告](DIFFERENCES.md)。

## 运行

交付包中的 `领土战争.html` 可直接用 Edge / Chrome 打开，无需联网。进度保存在当前浏览器；更换浏览器、地址或清除浏览数据可能产生新存档。

源码运行：

```sh
npm ci
npm run dev
```

构建：`npm run build`。生成常规网页 `dist/` 和包含全部脚本、样式、向量地图的单文件 `dist/领土战争.html`。游戏不依赖截图背景或在线素材服务。

## 已实现

- 从第1关开始：金币、体力、初始兵力和生产速度升级；完成对局、领取奖励、刷新后保留进度。
- 三幅按录像描摹的战斗地图：L 12据点、S 26据点、补发A 12据点；首页地图另按A描摹。
- 拖动或两次点击派兵、多列连续兵流、逐包战斗、占领改色、友军增援、中立回复、生产软上限、三/四阵营AI。
- 暂停、重开、失败观战、胜利结算；本机任务、转盘、外观和竞技入口。
- 固定步长与独立模拟核心、兵力记账、种子回放、导入/导出回放、Canvas录屏。

普通关卡使用候选新号成长数值，三幅地图循环；首页右下圆环可选择独立的录像参数场景。PVP入口进入本机AI竞技，未连接真人服务器。任务等未被录像展示的内页明确标为本地设定。

## 操作

按住蓝色据点拖到目标松开；也可先点蓝色区域，再点目的地。目标为己方时增援，空白处取消选中。左上角暂停，电脑可用空格暂停/继续。每次指令采用固定兵力预算，部队按速率分批出发；这是可替换候选规则。`F2` 为研究面板，不是正常通关必需功能。

## 核验

```sh
npm test
npm run build
# 另一个终端保持 npm run dev
npx playwright test
python research/map-trace/validate_maps.py
```

Windows浏览器测试默认使用系统Edge，可用 `EDGE_PATH` 指定兼容的Chromium程序路径。地图检查需要Python的OpenCV、NumPy；重描地图还需要Pillow及有权限访问的原始参考帧。

本轮已完成36项单元测试、两批共18项浏览器测试、三幅地图几何检查与300秒桌面压力测试。浏览器脚本读取只读状态选择目标，通过实际指针操作完成第一关、购买升级并刷新验证；不是人工试玩或首胜率统计。具体环境、证据和未达标项见 [VERIFICATION.md](VERIFICATION.md)。

## 研究与素材

- [素材入口](references/SOURCES.md)、[文件清单](references/source-manifest.json)
- [逐帧观察](references/OBSERVATIONS-2026-09-26.md)、[外围经济证据](references/ECONOMY.md)、[地图标注](references/MAP-ANNOTATION.md)
- [机制假设与契约](MECHANICS.md)、[模拟规则](src/sim/README.md)
- [任务总书](TASKBOOK.md)、[执行队列](QUEUE.md)、[原验收清单](ACCEPTANCE.md)、[当前状态](STATE.md)

[Google Drive项目目录](https://drive.google.com/drive/folders/1yWKAB6WcJorO-Hfx2MLLr51zdV77slY2)。原始录屏、截图及包含账号字段的分享页不提交到Git，也不随源码包分发。私人对照报告仅用于本地核对。

实现采用TypeScript与Canvas，没有复制第三方游戏源码；构建和测试依赖见package-lock.json。原录像、美术及游戏设计的权利归原权利人，本仓库不据此宣称拥有原作素材。尚未部署、公开发布或接入广告/支付服务。
