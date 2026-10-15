# 新增要求

## ADDED Requirements
### Requirement: 真实结果开场视频
项目页 SHALL 展示 45–60 秒、无配音的 Plan4D teaser，素材来自现有 best 定性结果，并记录来源与分镜。

#### Scenario: 观看成片
- **WHEN** 用户观看 teaser
- **THEN** 看到观测图像与动作条件对应的生成 RGB、深度、动态点云、场景流与聚合几何，保持原始动作时间对应关系。

### Requirement: 网页播放
网页 SHALL 提供 MP4/WebM、封面与 1080p 下载；尊重减少动态效果偏好，并在离屏或隐藏页面时暂停。

#### Scenario: 首屏播放与暂停
- **WHEN** 视频进入可见区且未启用减少动态效果，用户未主动暂停
- **THEN** 视频静音播放；离开可见区后暂停，手动暂停选择得到保留。
