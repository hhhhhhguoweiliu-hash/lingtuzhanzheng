# 领土战争复刻任务包

用户指定仓库：`hhhhhhguoweiliu-hash/lingtuzhanzheng`。

本仓库交接《解压来一局》中录屏所示领土战争玩法的重做任务。v2 的重点是先还原一场战斗；上一版通用据点原型已被用户否定，不能继续当作合格成品。

## Codex 读取顺序

1. [任务总书](TASKBOOK.md)：目标、范围、架构、数值、视觉、平台与交付。
2. [素材入口](references/SOURCES.md)：两段新录屏、原始分片、哈希、关键帧和旧录像缺口。
3. [机制辨识](MECHANICS.md)：18个未知机制、竞争假设和兵力记账契约。
4. [执行队列](QUEUE.md)：29项任务、依赖、状态与验收。
5. [验收用例](ACCEPTANCE.md)：素材、触控、兵流、战斗、生产、AI、回放和性能。
6. [状态](STATE.md)、[阻塞](BLOCKED.md)、[差异](DIFFERENCES.md)。
7. [直接开工提示词](CODEX_START.md)。

附带参数模板 `config/research-candidate.json`、数据接口 `schemas/domain.ts`、源文件索引、节点观察 CSV 和原视频重建脚本。它们是待校准的开发起点，不是原游戏的已知源码或规则。

## 素材

Google Drive 项目目录：
https://drive.google.com/drive/folders/1yWKAB6WcJorO-Hfx2MLLr51zdV77slY2

本 GitHub 仓库公开；任务书及无账号信息的配置在此，用户原始录屏和截图包放在 Drive，保留原有访问权限。视频不直接提交到 Git。无 Drive 权限的执行环境应明确报素材缺口，不能假装已观看。

## 第一个交付

下载 L 长视频原件 → 标地图和据点 → 辨识发兵语义 → 单路分批兵流 → 三方对战 → 录像对照与手机操作。G3之前不以增加关卡和商店替代核心还原。

当前状态：任务包就绪，重做尚未实现。没有任何 v2 游戏测试结果、胜率或性能测量被预先宣称通过。
