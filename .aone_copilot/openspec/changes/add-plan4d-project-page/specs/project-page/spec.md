## ADDED Requirements

### Requirement: 真实案例对比
页面 SHALL 展示 plan4d_final_outputs-best 中除 P28_101_119 外的 6 个 EPIC 场景，每场景仅一套 Plan4D 结果，以规范场景 ID 匹配 baseline。

#### Scenario: 浏览方法对比
- **WHEN** 用户打开对比区域
- **THEN** 按文本、图像、Gen3R、TesserAct、VIST3A、Plan4D 顺序展示，点云来自实际逐帧 PLY。

### Requirement: 时间与视角交互
页面 SHALL 支持播放暂停、逐帧定位、旋转缩放、复位和放大查看，并在加载失败时显示可重试状态。

#### Scenario: 同步播放
- **WHEN** 用户改变一行时间轴
- **THEN** 该行所有方法显示相同时间帧，异步加载不会用过期请求覆盖当前帧。

### Requirement: 可复现与文件安全
资源生成器 MUST 只读原始结果，保留全部 81 帧，对网页点云采样进行披露，且不删除已有文件。

#### Scenario: 构建页面
- **WHEN** 生成资源并构建项目
- **THEN** 静态产物包含必要图像、视频与 PLY，可通过 HTTP 独立访问。
