# 实施记录

## 2026-10-15 提交与 GitHub Pages 发布
- 用户明确授权提交、推送与发布项目页。已核对 origin/main=c26ec9a、账号 fogradio、Pages workflow 模式和最近成功部署。
- 已发布 plan4d-teaser-20261015 Release，上传 50,074,683 字节的增量视频资源包与 SHA-256 文件，远端 digest 与本地一致。
- 工作流新增下载 teaser、SHA-256 校验和解压步骤；原定性媒体 Release 与变量保留。组内 16.2 秒独立短片不在媒体包、Git 或公开站点内。
- /plan4d-project/ 正式构建、五视口 teaser 播放验证、九视口论文页面回归、格式检查和 git diff --check 通过，浏览器错误为零。
- 构建保留原模板未使用字段提示与 Three.js 大包提示；实际页面和媒体均可用。
- 发布提交 52ce6f8 已推送 main，Actions 38671318990 的 Build 与 Deploy 均成功，线上地址 https://fogradio.github.io/plan4d-project/。
- GitHub 构建日志确认 teaser 压缩包 SHA-256 校验 OK，远端 Release digest 与本地一致。一次本机 Release 全包下载因速度慢超时，没有将空流哈希作为验证通过依据。
- 线上 smoke 确认 54 秒 VP9 实际解码、播放进度推进、画面非空，1440/390px 无溢出，6 个逐帧对比、3 个聚合对比、17 场景 Gallery 均存在，浏览器错误为零。
- 公开 MP4/WebM/1080p 的首 256 KiB 分段内容与本地逐字节一致；抽查输入图像、首尾 PLY、聚合 PLY 与场景流完整文件 SHA-256 均一致，1080p 下载返回 200 且大小匹配。
- 两个完整线上浏览器回归因当前服务器到 GitHub Pages 下载速度慢而超时；正式子路径完整回归已在发布前通过，线上改用实际播放和针对性资源检查。报告位于 artifacts/teaser-published-smoke-20261015 与 artifacts/teaser-published-assets-20261015.json。
- gh 日志命令默认缓存目录只读，指定工作区 XDG_CACHE_HOME 后成功读取。独立 group publication 视频未上传公开 Release 或加入页面，原本地预览和下载服务保留。

## 2026-10-14 NeurIPS 2026 BibTeX
- 按用户要求将页面引用从 `@misc` 改为 `@inproceedings`，会议为 Advances in Neural Information Processing Systems (NeurIPS)，年份 2026；保留论文标题和作者顺序，用花括号保护 Plan4D、4D 大小写。
- 格式和类型检查、生产构建通过；4321 已切换到新版构建，经本机 HTTPS 端口代理验证引用为 NeurIPS 2026 会议论文，复制到剪贴板的内容与页面完全一致。旧构建归档保留。

## 2026-10-14 第五点最终更正
- 用户明确要求保留原来全部定性展示，去掉原来的定量表格；前轮新版标题、摘要、作者、资源入口与方法图继续保留。
- 已恢复原 teaser、六场景逐帧对比、三场景聚合点云、17 场景五模态 Gallery，移除定量表格 HTML、导入、导航和事件逻辑。原数据和媒体未删除。
- 已恢复构建媒体完整性检查，并同步页面检查预期，开始生产构建及浏览器交互验证。
- 独立转发构建已完成；Astro 检查 0 错误、0 警告，保留原模板未使用字段与 Three.js 大包提示。目标 ESLint、Prettier 和 git diff --check 通过。
- 新版论文内容和 320–1920px 单行标题检查通过。完整逐帧/聚合浏览器回归通过：24 个逐帧、12 个聚合查看器像素非空，播放暂停、首尾帧、旋转、联动、重试、放大和手机操作正常，定量表格不存在，页面错误为 0。
- Gallery 全量验证通过：17×5 模态全部渲染，51 个视频实际解码播放，首尾帧变化、旋转、播放暂停、重试、快速切换、单框放大和 390/320px 手机布局均正常，页面错误为 0。
- 已将验证好的构建切换至 `artifacts/forwarded-preview`，旧构建归档到 `artifacts/preview-before-qualitative-restoration-2026-10-14T07-47-15.613Z`，4321 无需重启即可提供新版。经本机 code-server HTTPS 代理复验内容、所有定性区块、定量表格缺席及 320–1920px 布局，0 错误；临时 4322 服务已停止。
- 本轮报告：`artifacts/qualitative-restored-paper-browser/`、`artifacts/qualitative-restored-comparison-browser/`、`artifacts/qualitative-restored-gallery-browser/`、`artifacts/qualitative-restored-proxy-browser/`。原组件、数据清单及定量数据文件未改动，未删除任何文件。

## 2026-10-14 论文同步与结果展示调整
- 已确认工作区干净，读取新版论文标题、摘要、作者及方法图，并确认用户更正为移除全部定性结果、保留全部现有定量结果。
- 使用 PDF 与 planning-with-files 技能；原始论文和结果数据只读。
- 当前项目无 OpenSpec project.md；沿用已有项目实施授权完成内容与布局调整。
- 页面已改为单行标题，移除首屏标语，逐字采用新版摘要，更新 PVG 单位与两位通讯作者；资源入口为 Paper、Code、Model、BibTeX。
- 新 PDF 已导出为 2447×657 WebP 并目视核对；旧方法图保留。全部定性组件已退出页面，全部定量数据文件未改动。
- 构建检查不再依赖历史定性媒体；新增当前页面的浏览器检查入口，覆盖定量数值、论文内容、单行标题和手机布局。
- 首轮浏览器断言发现开发 HTML 在表格数值周围插入空格，数值本身一致；检查脚本已统一空白后比较，不修改表格数据。
- 开发版检查已通过摘要逐字比对、全部 96 个定量数值、四个数据集切换、BibTeX 复制、方法图及桌面/手机布局，页面错误为 0。
- 最终构建完成前启动的一次代理检查遇到短暂 404；构建完成后已确认 HTTPS 代理和服务直连均返回新版页面，正在独立复验。
- 最终转发生产构建完成，Astro 检查 0 错误、0 警告，仅有原模板未使用字段提示。目标 ESLint、Prettier、Python 语法与 git diff --check 通过，定量数据文件与 HEAD 完全一致。
- 经本机 code-server HTTPS 端口代理验证新版生产页面：摘要原文、作者、四入口、全部定量数值、鼠标/键盘表格切换与引用复制均通过，320–1920px 九种宽度标题单行且无页面溢出，定性媒体请求为 0，页面错误为 0。报告与截图为 `artifacts/paper-update-proxy-final/`。
- 4321 继续提供最新转发构建；4322 临时开发服务已停止。历史组件、原始数据、旧方法图和旧构建均保留。外部 Nebula 登录流程未自动验证。

## 2026-10-14 Gallery 菜单命名
- 根据 17 个 display prompt 提炼英文动作名称，替换下拉菜单中的文件夹名；保留编号、顺序和原始 ID。
- 同步导出脚本的首次导出及 resume 路径，避免重新生成清单时恢复文件夹名；补充浏览器选项名称断言。
- 17 个 label 与导出规则一致；和既有 case.json 逐字段对比，除 label 外 prompt、ID 及全部媒体元数据均未改变。Python 语法、目标 ESLint、Prettier、git diff --check 通过。
- 普通生产构建完成，静态 HTML 中 17 个选项名称与值均匹配清单；正在刷新转发构建。
- 窄屏测试发现部分长标签会截断，进一步缩短名称并增加实际字体宽度断言；第 15 项超出 320px 选框正文区约 1px，最终改为 Bending Forward。
- 最终名称完整浏览器复验通过：17 个选项与场景 ID 对应，17×5 模态、51 个视频播放、点云交互和错误重试均正常；320px/390px 名称宽度断言通过，页面错误为 0。报告：artifacts/gallery-labels-final-browser/report.json。
- 最新转发构建完成，Astro 检查 0 错误、0 警告，仅有既存模板提示和大包提示；旧构建归档保留。4321 已重启并保持运行，4322 临时验证服务已停止。
- 经本机 code-server HTTPS 代理复验 17 个选项、全部场景切换和 prompt/图片对应，以及 320px/390px 标签完整显示，页面错误为 0；报告：artifacts/gallery-labels-proxy-final/report.json。外部 Nebula 地址需要用户登录，其登录流程未自动验证。

## 2026-10-14 GitHub Pages 发布
- 用户明确授权将本次页面更新提交并推送到 main，并上传公开 Release 媒体。
- 已核对 origin、工作流、媒体体积和远端失败记录。阻塞为 Pages 未启用、GitHub 登录失效；沙箱外 dry-run 也失败。
- 正在准备官方 GitHub CLI 设备登录和正式子路径构建，不影响现有 4321 预览。
- 官方 gh 2.102.0 已从 cli/cli 下载，SHA-256 与官方校验清单一致；设备授权流程已启动，等待用户浏览器授权。
- /plan4d-project/ 正式构建通过 Astro 检查。页面、全部逐帧/聚合点云和 17×5 Gallery 浏览器回归通过，51 个视频均实际解码播放，页面错误为 0。
- 媒体包已生成，SHA-256 为 79240366da1e22f100804d54fecb67046c3503ec1cd25168d7202c170547daef。正式报告位于 artifacts/github-pages-release-browser、artifacts/github-pages-release-comparison-browser、artifacts/github-pages-release-gallery-browser。

## 2026-10-14 会议名称与摘要微调
- 已添加居中的 NeurIPS 2026，删除网页摘要末尾 Project Page 段落。
- 已更新页面校验，覆盖摘要正文、会议行位置与桌面/手机居中及不重叠检查；待构建与浏览器验证。
- 构建完成，Astro 检查 0 错误、0 警告；保留既有模板未使用字段提示及 Three.js 大包提示。目标 ESLint、Prettier 与 git diff --check 通过。
- 临时构建与真实 code-server HTTPS 代理均通过浏览器验证：320–1920px 共 9 种视口标题保持单行，会议行居中且无重叠，摘要正文一致且不含末尾项目链接，引用复制正常，页面错误为 0。报告：artifacts/conference-abstract-proxy-browser/report.json。
- 已将验证后的构建更新到现有 4321 服务，旧构建保存在 artifacts/preview-before-conference-abstract-2026-10-14T08-12-14.144Z，临时 4322 服务已停止。
- 验证过程处理：测试脚本首轮格式检查未通过，Prettier 格式化后通过；沙箱内停止临时进程提示不可见，经授权在沙箱外停止成功。

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

## 2026-10-15：Teaser 视频
- 已完成目标仓库、Git 状态、父目录规则及素材清单的只读检查，Git 起始状态干净。
- 使用 planning-with-files 维护制作过程；已阅读两个参考页的 teaser 结构。
- 已确认本机可用视频解码、图像排版、点云渲染与转码依赖，进入选片与分镜阶段。
- 用户确认 45–60 秒无配音方向，完成 54 秒、10 段、12 场景的英文短字幕成片。
- Three.js 渲染 3 段逐帧原始 PLY 和 1 段聚合 PLY；首版聚合镜头保留，22 度视场 v2 用于成片。
- 成片为 1080p MP4 32,000,777 字节、720p MP4 8,775,027 字节、720p VP9 WebM 9,228,650 字节，另附封面、分镜、来源记录。
- 全量解码验证通过：每份 1,620 帧、30 fps、54 秒，非空且十段都有变化，MP4 moov 位于 mdat 前；24 份输入哈希与清单匹配。
- Playwright 验证通过：静音播放、WebM 实际解码、动态与聚合点云像素变化、离屏暂停/恢复、手动暂停保持、减少动态效果与手动播放；1920/1440/768/390/320 五宽度无溢出，首屏可见。
- 已目视检查桌面和手机页面截图，旧静态图及原始定性结果均保留。
- 初次 Astro 检查出现两处新增脚本类型提示，已局部修正；原模板 Tabs.astro 未使用字段提示保持不变。
- 生产静态构建完成，原论文内容与九种视口回归通过。生产 teaser 首次测试等待 networkidle 超时，改为 DOM 就绪后显式等待视频解码；补丁曾因格式化后的行形不符失败，已检查 pwd、apply_patch 路径和 git 状态后重试。
- 生产 teaser 复验通过，报告位于 artifacts/teaser-20261015/production-browser-verified/report.json，零浏览器错误；最新 Astro 检查零错误、零警告，仅保留原模板一个提示。
- Python 语法、目标 ESLint、Prettier 与 git diff --check 通过。生产构建保留现有 Three.js 大 chunk 提示，无新增构建错误。
- 预览构建位于 artifacts/teaser-preview-20261015，地址 http://localhost:4323/，机器地址 http://33.78.174.88:4323/。原 4321 服务和旧构建保留，未提交或发布远端。

## 2026-10-15：Group publication 短 Demo
- 用户要求独立短片用于组内 publication 展示与下载，不加入公开项目页。
- 已生成 16.2 秒、30 fps、无音轨的四格 demo：移液、搅拌、人物弯腰，包含 RGB、深度、动态点云、场景流。
- 输出仅位于 artifacts/group-publication-demo-20261015：1080p MP4 28,217,568 字节，540p MP4 3,335,666 字节，另附封面与接触表。
- 两份输出各 486 帧全部解码通过，三个场景都有实际运动，12 个来源哈希一致，faststart 正常；已目视检查三场景排版。
- 增加仅监听 127.0.0.1:4324 的独立下载服务，明确文件白名单与 attachment 响应，不暴露项目目录。
- 一次合并补丁因 findings.md 无匹配上下文未执行，已检查 pwd、apply_patch 路径与 git 状态后用正确补丁完成。
- 两个 HTTP 下载均已完整读取，下载字节 SHA-256 与成片一致、attachment 响应正确；Python 语法与 git diff --check 通过。下载服务已保持运行，公开页面未改。
