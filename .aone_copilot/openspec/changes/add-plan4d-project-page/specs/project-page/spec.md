## ADDED Requirements

### Requirement: 单框多模态 Gallery
页面 SHALL 在独立 Gallery 栏目中仅显示一个输出框，提供用户指定顺序的 17 个 best 场景下拉菜单和五种模态切换。

#### Scenario: 切换场景和模态
- **WHEN** 用户选择场景或使用左右箭头、模态导航
- **THEN** 同一展示框按 INTERACTIVE 4D OUTPUT、RGB Video、Depth Video、Aggregated 4D Point Cloud、Scene Flow 顺序显示对应资源，同时更新输入图像和文本；旧场景异步请求不能覆盖新场景。

#### Scenario: 指定场景流与文案
- **WHEN** 显示 Scene Flow 或 Phu_HyoQWVU 场景
- **THEN** 场景流必须来自 notch14_pointcloud_trails/pred_scene_flow_raw_notch14_pointcloud_trails_vis.mp4；该场景展示文本为用户指定的四句移液管动作。

#### Scenario: 交互与资源安全
- **WHEN** 播放、拖动点云、逐帧定位、放大或快速切换
- **THEN** 点云为可交互 PLY，视频可播放暂停，离开模态会暂停旧播放器，保留原始文件与已有对比；移动端无页面横向溢出。

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
- **THEN** 静态产物包含必要图像与 PLY，可通过 HTTP 独立访问；历史视频资源保留但不再显示。

### Requirement: 指定聚合点云对比
页面 SHALL 根据用户明确要求展示 iaHNa6cm64k、test_cab_e_3rd 和 ZHwqSpZfPCI 三个指定片段的四种方法聚合点云，来源必须为 global_pcd_with_camera_trajectory.ply。

#### Scenario: 浏览聚合结果
- **WHEN** 用户打开聚合对比区
- **THEN** 三列标题为 Input text、Input image、Aggregated 4D Point Cloud，第三列依次展示 Gen3R、TesserAct、VIST3A、Plan4D；所有 12 个结果可旋转、缩放、放大和重试，无时间轴。

#### Scenario: 保留相机轨迹
- **WHEN** 生成聚合网页派生资源
- **THEN** 场景点采样方式与独立显示尺度被披露，全部相机视锥和轨迹顶点保留，来源哈希和采样坐标颜色可验证，原文件不修改。

#### Scenario: 移除视频展示
- **WHEN** 用户访问项目页
- **THEN** RGB/depth 视频对比及同步事件逻辑不再存在，逐帧六场景仍正常工作，历史视频文件不删除。
