# 实施记录

## 2026-10-14 Gallery 菜单命名
- 根据 17 个 display prompt 提炼英文动作名称，替换下拉菜单中的文件夹名；保留编号、顺序和原始 ID。
- 同步导出脚本的首次导出及 resume 路径，避免重新生成清单时恢复文件夹名；补充浏览器选项名称断言。
- 17 个 label 与导出规则一致；和既有 case.json 逐字段对比，除 label 外 prompt、ID 及全部媒体元数据均未改变。Python 语法、目标 ESLint、Prettier、git diff --check 通过。
- 普通生产构建完成，静态 HTML 中 17 个选项名称与值均匹配清单；正在刷新转发构建。
- 窄屏测试发现部分长标签会截断，进一步缩短名称并增加实际字体宽度断言；第 15 项超出 320px 选框正文区约 1px，最终改为 Bending Forward。
- 最终名称完整浏览器复验通过：17 个选项与场景 ID 对应，17×5 模态、51 个视频播放、点云交互和错误重试均正常；320px/390px 名称宽度断言通过，页面错误为 0。报告：artifacts/gallery-labels-final-browser/report.json。
- 最新转发构建完成，Astro 检查 0 错误、0 警告，仅有既存模板提示和大包提示；旧构建归档保留。4321 已重启并保持运行，4322 临时验证服务已停止。
- 经本机 code-server HTTPS 代理复验 17 个选项、全部场景切换和 prompt/图片对应，以及 320px/390px 标签完整显示，页面错误为 0；报告：artifacts/gallery-labels-proxy-final/report.json。外部 Nebula 地址需要用户登录，其登录流程未自动验证。

## 2026-10-14 Gallery
- 已盘点全部 17 个场景；指定的 notch14 点云轨迹视频均存在，无需回退来源。
- 用户直接授权新增单框 Gallery，保留现有逐帧/聚合对比及最近 prompt 修改。
- 已导出并验证 17 个场景、1,377 帧、17 个聚合点云、51 组 MP4/WebM；所有帧采样与源坐标/颜色完全一致，Scene Flow 来源哈希逐一匹配指定 notch14 视频。资源约 594 MiB。
- 单框 Gallery 已实现；首轮浏览器遍历 17×5 模态全部成功，51 个视频实际播放通过，移动端 390/320px 无溢出。
- 首次浏览器测试早于 Astro 启动完成而连接失败，等待服务就绪后重试通过全部内容验证。
- 类型检查发现条件 tuple 展开不符合 Vector3.set 参数签名，已改为显式坐标；CSS 独立文件 lint 无法解析主样式变量，已补等价 fallback，未更改全局颜色。
- 放大关闭事件的异步暂停断言出现竞态，关闭按钮现同步暂停，测试等待暂停状态；完整交互重跑通过。
- Gallery 开发版和生产版均通过全部 17×5 模态、51 个视频播放、首尾帧变化、旋转、播放暂停、加载失败重试、快速切换、单输出框放大、Phu 指定 prompt、390/320px 无溢出及离屏暂停验证，页面错误为 0。生产报告：artifacts/gallery-production-browser/report.json。
- 原逐帧和聚合对比回归通过：6 个逐帧场景、24 个查看器、3 个聚合场景、12 个查看器，以及原方法差异、交互和移动端检查均保留；报告：artifacts/gallery-comparison-regression/report.json。
- 目标 ESLint、Prettier、Python py_compile 和 git diff --check 均通过。普通构建与转发构建完成；Astro 检查 0 错误、0 警告，保留原模板未使用字段提示和 Three.js 大包提示。
- 4321 已重启到最新转发构建，经本机 code-server HTTPS 代理验证 17 个选项、五模态非空、视频实际播放、指定 prompt 及手机布局，0 页面错误；报告：artifacts/gallery-proxy-browser/report.json。桌面 1920px 和手机 390px 截图已保存，4321 预览服务保持运行。

## 2026-10-14 聚合点云展示
- 已重新检查 TesserAct test_cab 目录，12 份聚合结果现均存在。
- 仅新增网页派生资源，原始结果与旧视频文件均保留；页面不再呈现 RGB/depth 视频区。
- 将共享 WebGL 查看器扩展为同时支持逐帧序列和单份聚合点云。
- 聚合导出与验证已通过：12 个文件均校验来源 SHA-256、全部采样 XYZ/RGB 和完整轨迹，3 个输入图像无损一致；每份默认 200,000 个场景点。
- 新增三列聚合区，移除视频 HTML 与同步逻辑；浏览器回归增加全部聚合点云、重试、联动开关与放大窗口。
- Astro 检查 0 错误、0 警告、1 个原模板提示；新增/修改的 Astro、TS、JS 通过 ESLint，Prettier 和 py_compile 通过。
- CSS lint 有 8 项既有兼容性/important 规则告警；与 HEAD 比较数量和内容一致，本次未新增，不改动无关规则。
- 普通 dist 和 Nebula 转发构建均完成，原构建已归档保留；构建仍有 Three.js 单块超过 500 kB 提示。
- 首轮生产浏览器测试在并行构建期间等待第三个聚合场景超时；独立诊断确认全部资源 HTTP 200，再次完整生产回归通过，未发现页面错误。
- 桌面 1440px、手机 390px 与 320px 验证通过：24 处逐帧与 12 处聚合点云非空、方法差异、旋转、联动开关、重试、模态窗口、逐帧切换、无视频元素、无手机页面横向溢出。报告为 artifacts/aggregated-production-browser-recheck/report.json。
- 原 4321 进程位于沙箱外，首次终止命令不可见；经授权重启成功。通过本机 code-server HTTPS 代理验证最终生产资源，12 份聚合点云 ready、0 视频、0 页面错误。4321 预览保持运行。

## 2026-10-12
- 已检查路径、git 根目录和工作区状态。
- 已读取工作区、VIST3A、论文仓库说明及 OpenSpec 指令。
- 已读取 planning-with-files 和 PDF 技能，准备复用论文图。
- 已核实 9 个 Plan4D 版本对应 7 个 EPIC 场景，以及三个 baseline 的逐帧 PLY。
- OpenSpec CLI 缺失，后续用文档与可执行构建/浏览器检查记录验收。
- 用户随后更正为 best 目录的 6 个场景（排除 P28），已更新导出器；前一批网页派生资源保留到 artifacts，原始结果从未改动。
- 最新要求：六场景对比区不显示数据集名称，已移除该区域名称与标签。
- 已生成 24 组序列、1,944 帧压缩 PLY，约 380 MiB；已实现页面与 Three.js viewer，首次 Astro 检查 0 错误，浏览器点云实际渲染成功。
- 环境问题：Astro 6 CLI 入口为 node_modules/.bin/astro；遥测默认写入不可用配置目录，使用 ASTRO_TELEMETRY_DISABLED=1 后检查成功。
- 一次图标补丁因原始路径内容匹配失败而未应用；已按规则检查 pwd、apply_patch 路径和 git 状态，重新使用 apply_patch 添加独立 Plan4D 图标。
- 数据验证通过：1,944 帧均有效，24 组序列 SHA-256 一致，48 个首尾帧与原始采样坐标/颜色精确匹配。
- 格式化器在 select 内插入 Fragment，导致 Astro 编译错误，已移除非法包装并用 Astro 编译器 + esbuild 直接验证成功。
- 浏览器故障注入发现 OrbitControls 的 pointer capture 拦截重试按钮点击，已阻止该按钮的 pointerdown 冒泡。
- 已通过目标代码 ESLint、git diff --check、Python py_compile；继续浏览器全流程与生产构建验证。
- 桌面 1440x1000 与手机 390x844 浏览器全流程通过：24 处点云像素非空、首尾帧变化、旋转、播放暂停、快速切帧、加载失败重试、放大、表格与场景切换、引用复制、RGB/深度视频同步。
- 手机放大初始视角已适配竖屏，横向对比时播放条固定在可视宽度；手机导航不再裁切。
- 已完成生产静态构建；正在针对 dist 进行最终复验并保持预览服务。
- 系统 FFmpeg 缺少 VP9 编码器，改用 dav3 已有的 imageio-ffmpeg，12 个 WebM 备选已导出并验证。
- 生产 dist 完整浏览器回归通过，0 页面错误；1920x1080 与 320x740 补充截图正常，320px scrollWidth=320，图片无缺失。
- 格式检查通过，预览地址 http://localhost:4321/（机器地址 http://33.78.174.88:4321/）。未发布外网或提交 Git。
- 最后将视频场景菜单改为简短行动名称，输入对比中的原始 prompt 保持完整。
- 最终菜单更新后的生产构建通过：0 错误、0 警告、1 个原模板未使用字段提示；目标 ESLint 与格式检查通过。静态 HTML 已复核六行六列、对比区无数据集名称。预览服务使用最终 dist。
