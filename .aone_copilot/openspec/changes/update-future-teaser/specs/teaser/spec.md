## ADDED Requirements
### Requirement: 单帧与文本输入持续可见
Teaser SHALL 在四个案例上方展示真实单帧条件图与对应动作文本。

#### Scenario: 观看未来输出
- **WHEN** 未来视频、深度、点云或轨迹播放
- **THEN** 输入图保持静止，生成结果与未来时间明确标记。

### Requirement: 连续空间转换
Teaser SHALL 以同一源帧完成 RGB、深度和三维转换。

#### Scenario: 时间冻结时改变模态和视角
- **WHEN** 进行深度擦除、几何显现与相机旋转
- **THEN** 源帧固定且字幕标明时间冻结，随后未来帧按原帧率继续。

### Requirement: 真实跨帧轨迹
Teaser SHALL 仅展示验证有效的跨帧 2D 特征轨迹及其预测 3D 对应。

#### Scenario: 生成未来中的运动追踪
- **WHEN** 显示轨迹
- **THEN** 轨迹通过前后向追踪校验和几何跳变检查，明确来源为生成 RGB 与几何的后处理。
