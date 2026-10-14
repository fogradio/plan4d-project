# Plan4D 项目页实施计划

## 目标
根据论文仓库完成 Plan4D 学术项目页，优先交付 EPIC-KITCHENS 方法对比与真实逐帧 PLY 交互。

## 阶段
- [x] 盘点论文、参考页面、案例与依赖环境。
- [x] 生成可追溯的数据清单和网页资源。
- [x] 实现项目页与同步交互式点云对比。
- [x] 构建、浏览器桌面/移动端验证并启动预览。

## 约束与决定
- 按用户最新更正：Plan4D 仅取 plan4d_final_outputs-best，排除 P28_101_119，展示 6 个独立 EPIC 场景，不做版本切换。
- 列顺序：输入文本、输入图像、Gen3R、TesserAct、VIST3A、Plan4D。
- 六场景对比区域不展示数据集名称，按用户最新要求仅展示输入与各方法结果。
- 原始结果和论文只读，不删除任何文件，不执行训练。
- 用户已直接要求完成页面，按该授权实施。

## 环境记录
- openspec-aone 命令不可用，已读取工作区 OpenSpec 规则和现有变更目录，未发现网页相关变更。
- 使用现成 Node 22.18.0（code-server 内置），项目 npm 依赖和 Playwright 已安装。

## 聚合点云更新（2026-10-14）
- [x] 核对指定三个场景及四种方法的 global_pcd_with_camera_trajectory.ply。
- [x] 导出可追溯的聚合点云和输入图片，保留全部相机轨迹顶点。
- [x] 添加三列聚合对比，第三列包含四种方法；移除 RGB/depth 视频区及其运行逻辑。
- [x] 验证原始数据对应关系、浏览器桌面/移动端交互并更新代理预览。
- 用户已明确授权上述展示调整；已有逐帧六场景及 VIST3A 来源纠正保持不变。

## Gallery（2026-10-14）
- [x] 核对用户指定 17 个场景的五种输出和参考 Gallery。
- [x] 生成独立可复现资源、清单和来源校验。
- [x] 实现场景下拉、单输出框、五模态左右切换和播放器。
- [x] 验证全部场景/模态、桌面/手机与旧区回归，更新转发预览。
- 五模态固定为 INTERACTIVE 4D OUTPUT、RGB Video、Depth Video、Aggregated 4D Point Cloud、Scene Flow。
- Scene Flow 仅用 notch14_pointcloud_trails/pred_scene_flow_raw_notch14_pointcloud_trails_vis.mp4，不使用 raw_vis 或其他版本。
- Phu_HyoQWVU 的展示 prompt 使用用户原文；旧聚合 01/02 文案和全部旧对比保持不变。

## Gallery 菜单命名
- [x] 根据 17 个输入文本提炼动作名称，仅更新菜单 label 和导出规则。
- [x] 验证名称与场景对应关系，构建并刷新 4321 转发预览。
