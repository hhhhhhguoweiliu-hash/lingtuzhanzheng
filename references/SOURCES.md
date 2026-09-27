# 蓝本和素材入口

任务包使用用户提供的原录屏。原片和截图仅作为研究参考，未混入游戏静态资产。GitHub存任务文本，素材留在Google Drive并维持访问权限。

## L 长视频 主蓝本

- 原文件：`1000042572.mp4`，720×1372，257.034434秒，110360599字节。
- SHA-256：`22177a9ff18e8cc72162a47891caa90f5eb2bf18dbb89ed9fe7c724ac680e350`。
- [可直接观看的540p审阅副本](https://drive.google.com/file/d/1i7jT82we9Ug5ZAw-dNv7HDdDvQ-Hby9p/view)。正式读数用下面的原始文件。
- [原片分片01](https://drive.google.com/file/d/15sI_2IIuAzfwBjXcUuH11TZnw4BfuTS8/view)
- [原片分片02](https://drive.google.com/file/d/1ZPHnW1lOfU1wbrOk_xaNIBdU9LJKY4jY/view)

原视频略大于上传通道的单文件上限，已按字节切为两片。下载时保留名字，将两片放到同一目录，再运行：

```sh
python tools/reconstruct_media.py /path/to/downloads --output /path/to/1000042572.mp4
```

脚本不重编码且不覆盖现有文件，校验原始SHA-256。已在本次交接中实际重建并通过校验，重建视频可解码。分片不能单独当成完整视频播放。

## S 短视频 模式差异参考

- [1000042571.mp4原件](https://drive.google.com/file/d/1zDMKEHJo3m5wqleofHxFAJSQ-yO2URYp/view)
- 720×1372，60.996496秒，9491151字节。
- SHA-256：`60728be8325df6b7025865af601f3a32e86da1e4171ae6f20a1daaf9c7e2941a`。
- 用于玩家栏、另一地图、表情/聊天和字幕来源辨识。不可证明真人联机。

## A 补发可用视频与历史损坏件

- [2026-09-27补发原始录屏](https://drive.google.com/file/d/1CO5Jh8278gh5O7rpctgqadNYhc0p15PE/view)，432×960、140.799667秒、10567625字节。
- SHA-256：`43e12f7976c1b5558abaa9a8c7a1c6e5e90251dc293ae8c41c5bc3ef981741f6`。
- 已用OpenCV连续解码4224帧至PTS140.766667秒；本轮实际观察首页、升级、广告取消、匹配、竞技和胜利结算。未声称音轨全量解码。
- 观察与候选经济规则见 [ECONOMY.md](ECONOMY.md)。补发件消除了“没有可读首页录像”的阻塞，但视频账号在第88关，没有提供新号前期关卡。
- 历史 `1000042460.mp4` 据旧记录约213.14秒、584×1280，当前旧副本损坏。保留manifest里的历史记录；不能把尺寸和长度均不同的补发件当成该文件的完整字节恢复。

## 关键帧和坐标草稿

- [reference-frames.zip](https://drive.google.com/file/d/135bF993NDNbc_tvOii5fFHbzgZtnWk0T/view)：14张原尺寸关键帧及时间索引。
- 下载后在仓库根目录解压，得到 `references/frames/` 和 `references/frame-index.json`。
- L取样时间为0、1、8、10、13、52、104、143、208、247秒；S为0、20、40、55秒。
- 这些是按指定秒数seek得到的附近解码帧，不保证恰好等于游戏逻辑tick。测量时以原片PTS为准。
- `node-observations.csv`是第一秒约12个节点的人工粗标，不是已完成地图文件。

## 游戏分享信息

用户分享文字的名称为《解压来一局》。[原始分享文案和完整链接](https://drive.google.com/file/d/1mzA-pQqqhYWH3dIx0LW6yWwUSILcLt_n/view)保存在Drive。

本轮通过HTTPS读取官方分享页成功，页面字段显示《解压来一局》、appId `tt2c6b5ad6b366620a02`、宿主 `douyin` / 1128。页面仅有打开小游戏入口，没有可控制的网页战场，未在原版内实操。开发者、版本、真实多人能力仍待核实。详见逐帧观察文档。

## 源文件和产物关系

`source-manifest.json`记录文件尺寸/哈希/链接；`frame-index.json`记录截图；`TASKBOOK.md`给需求；`MECHANICS.md`给竞争假设；`config/research-candidate.json`给候选初值。若某值与原片不符，以可复查观测为依据修订，不静默改结论。
