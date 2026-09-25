# Codex 可执行队列

状态：READY=可开始；WAIT_DEPENDENCY=等待前置；BLOCKED_EXTERNAL=需外部资料/能力；DONE=证据完成。下面是未执行的开发计划，不能一次性改成DONE。

| 编号 | 阶段/优先级 | 状态 | 依赖 | 工作与具体产物 | 验收 |
|---|---|---|---|---|---|
| T01 | G0/P0 | READY | 无 | 下载源视频，校验哈希，重建长片，记录缺件 | A01 |
| T02 | G0/P0 | WAIT_DEPENDENCY | T01 | 用PTS建立0–15秒数字/兵流观察表 | A02 |
| T03 | G0/P0 | WAIT_DEPENDENCY | T01 | 标注全部节点、轮廓、圈、标签锚点 | A03 |
| T04 | G0/P0 | WAIT_DEPENDENCY | T02 | U01–U08竞争假设和最小验证计划，选临时规则 | MECHANICS记录 |
| T05 | G0/P0 | READY | 无 | 核对旧原型与任务书，列可复用/必须重写模块 | DIFFERENCES |
| T06 | G0/P0 | READY | 无 | 确定引擎、目录、锁文件、启动构建命令 | 新环境可启动 |
| T07 | G1/P0 | WAIT_DEPENDENCY | T03,T06 | 单场地图和顶部/底部HUD，开发对照工具 | A04–A07 |
| T08 | G1/P0 | WAIT_DEPENDENCY | T04,T06 | tick、状态机、整数兵力与生产累积 | C07,C12 |
| T09 | G1/P0 | WAIT_DEPENDENCY | T07,T08 | 指针输入、目标预览、取消、标准命令 | B01,B02,B12 |
| T10 | G1/P0 | WAIT_DEPENDENCY | T08,T04 | 预留预算、逐批发射、取消、源易主 | B03–B06 |
| T11 | G1/P0 | WAIT_DEPENDENCY | T10,T07 | 沿路径的小包移动、队列渲染、首尾兵 | B07,B10,B11 |
| T12 | G1/P0 | WAIT_DEPENDENCY | T11 | 单路出兵对照视频与手机操作样例 | G1局部验收 |
| T13 | G2/P0 | WAIT_DEPENDENCY | T10,T11 | 逐包战斗、改色、增援、平局 | B08,B09,C01–C04 |
| T14 | G2/P0 | WAIT_DEPENDENCY | T08,T13 | 软上限与占领后产兵 | C05,C06,C11 |
| T15 | G2/P0 | WAIT_DEPENDENCY | T13,T14 | 三阵营AI，目标预算与行动日志 | D01,D02 |
| T16 | G2/P0 | WAIT_DEPENDENCY | T15 | 胜负、暂停、重试与干净生命周期 | C10,D03–D06 |
| T17 | G2/P1 | WAIT_DEPENDENCY | T07,T13 | 特殊图标/圈视觉，候选效果隔离，技能适配 | C08,C09 |
| T18 | G2/P0 | WAIT_DEPENDENCY | T08,T13 | 命令回放、seed、配置hash、debug快照 | C11,C12 |
| T19 | G3/P0 | WAIT_DEPENDENCY | T12,T16,T18 | 五组录屏对照，局部产率/速度/队宽拟合 | E视觉报告 |
| T20 | G3/P0 | WAIT_DEPENDENCY | T19 | 安卓与桌面输入、后台恢复、密集战斗性能 | D04,D05,F |
| T21 | G3/P0 | WAIT_DEPENDENCY | T20 | 单场候选包、运行说明、差异和检查点 | D08及交接 |
| T22 | G4/P1 | WAIT_DEPENDENCY | T21 | 短视频另一地图、四人栏与AI演示 | 不冒充真人 |
| T23 | G4/P1 | BLOCKED_EXTERNAL | T21,旧录像原件 | 首页升级/任务/转盘/皮肤准确复核 | 逐页有来源 |
| T24 | G4/P1 | WAIT_DEPENDENCY | T23 | 配置化成长、奖励账本、本机存档 | D06,D07 |
| T25 | G4/P2 | WAIT_DEPENDENCY | T21 | 核实录屏器来源，回放/录制导出原型 | 导出可播放 |
| T26 | G5/P2 | BLOCKED_EXTERNAL | T21,平台确认 | 平台SDK与真机适配 | 实际端运行 |
| T27 | G5/P2 | BLOCKED_EXTERNAL | T26,广告能力 | 真实广告回调/频控/错误处理 | 成功才发奖 |
| T28 | G5/P2 | BLOCKED_EXTERNAL | T22,联机范围确认 | 真人联机技术方案与独立实现 | 不用假在线 |
| T29 | G5/P2 | BLOCKED_EXTERNAL | 发布条件 | 素材/隐私/平台审核与发布 | 实际审核结果 |

执行节奏：先领取 READY；完成前置后才能提升依赖任务。用户这次委托的是交接任务书，后续 Codex 接手时可按本队列实现。每个检查点附真实证据，不为了填满功能表跨过核心验收。
