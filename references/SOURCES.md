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

## A 旧视频 当前缺件

`1000042460.mp4`此前成功读到约213.14秒、584×1280，出现首页和外围系统。当前工作副本解码失败，未上传为可用素材；不要把损坏文件或历史概述当本轮测量数据。用户原件恢复后更新manifest。L场景开发不依赖该缺件。

## 关键帧和坐标草稿

- [reference-frames.zip](https://drive.google.com/file/d/135bF993NDNbc_tvOii5fFHbzgZtnWk0T/view)：14张原尺寸关键帧及时间索引。
- 下载后在仓库根目录解压，得到 `references/frames/` 和 `references/frame-index.json`。
- L取样时间为0、1、8、10、13、52、104、143、208、247秒；S为0、20、40、55秒。
- 这些是按指定秒数seek得到的附近解码帧，不保证恰好等于游戏逻辑tick。测量时以原片PTS为准。
- `node-observations.csv`是第一秒约12个节点的人工粗标，不是已完成地图文件。

## 游戏分享信息

用户分享文字的名称为《解压来一局》。[原始分享文案和完整链接](https://drive.google.com/file/d/1mzA-pQqqhYWH3dIx0LW6yWwUSILcLt_n/view)保存在Drive。

此前通过网页读取未能进入该链接；不能宣称已经在原版里实操。抖音是分享出口，运行宿主、开发者、版本、平台能力均待核实。

## 源文件和产物关系

`source-manifest.json`记录文件尺寸/哈希/链接；`frame-index.json`记录截图；`TASKBOOK.md`给需求；`MECHANICS.md`给竞争假设；`config/research-candidate.json`给候选初值。若某值与原片不符，以可复查观测为依据修订，不静默改结论。
