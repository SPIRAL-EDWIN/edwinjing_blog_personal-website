# EdwinOS 首次加载审查

记录日期：2026-10-09。修改尚在工作树，未推送或发布。

## 已落实的加载顺序

1. HTML/CSS 直接显示正文、导航和完整搜索玻璃胶囊；运行时复用同一外壳。
2. Material 读取轻量搜索 manifest，用于分词及正文高亮。完整 corpus 不再由主线程下载、JSON.parse、structured clone。
3. 搜索聚焦、点击、输入、快捷键或 `q/query` 深链接立即启动 Worker 加载；没有搜索意图时，在 load、两帧、2 秒和 idle 后预热。Save-Data/2G 只按用户意图启动。
4. Worker 并行请求搜索库与完整 corpus，完成后才发 READY；加载期间保存最新查询，失败后新输入可重试。`h` 高亮链接无需等待完整 corpus。
5. 仓库、友链数量、部署时间请求在首屏之后启动。仓库统计只保留 EdwinOS 一套请求路径，顶部和手机抽屉共享数据。
6. 初始 UI 生命周期按 content/header 对去重。关闭状态的搜索光学表面只刷新静态帧，交互动效继续追踪帧；字体加载完再校正几何。
7. 头像 eager/high；访客图和后续论文配图 lazy/low。2026-10-12 已取消首页正文和区块的叠加入场位移，刷新时直接采用最终几何；校徽、首张论文配图和 Workshop 海报的资源提示随后调整，见下方图片刷新复查。

搜索索引仍预建，搜索范围、排序、IME 处理和数学渲染沿用当前实现。没有增加框架、第三方服务、网络请求拦截或额外样式文件。

## 资源证据

| 项目 | 观测 |
| --- | --- |
| 发布中的首页 | 18,346 B，gzip，`Cache-Control: max-age=600` |
| 发布中的搜索 JSON | 868,609 B，gzip，同样 600 秒缓存 |
| 当前生产配置构建的首阶段 manifest | 261 B 未压缩，927 记录均移出主线程 |
| 当前完整 corpus + 预建索引 | 3,182,136 B 未压缩，本地 gzip 估算 828,896 B；延后在 Worker 下载/解析 |

线上数据来自对 [官网首页](https://edwinjing-blog.com/) 和 [搜索 JSON](https://edwinjing-blog.com/search/search_index.json) 的一次并行只读 HTTP 检查，分别用时 1.37s、7.309s。这只是本次网络样本，不能代表所有地区或实际浏览器首屏时间。本地 gzip 是压缩估算。

总语料没有凭空减少；收益来自移出首屏资源竞争和主线程处理。GitHub Pages 已启用 gzip/cache，当前不需要另加托管层。字体已同源并使用 swap；MathJax 已按页面需求加载；文章图片和 Archive 缩略图已有优化，本次保留。

## 浏览器验证

通过仅本机测试服务器人为控制响应延迟，使用独立 URL 路径区分请求：

- 主 bundle 延迟 20s：运行时尚未初始化，搜索 shell 已在静态 DOM，输入和 shell 的矩形完全一致；测试页面 FCP 80ms。该数字来自无带宽限速的本机测试，不是线上提速承诺。
- 同一页面运行时初始化前后：桌面搜索 input/shell 均为 x391.59375、y14、宽681.0078125、高42；Header 高70，Profile 宽260。运行时没有再创建第二外壳。
- 未搜索的首次加载：manifest 随 Material 请求；完整 corpus 在 bundle 返回、load 后约2.1s才请求。统计请求在约1.1s后启动。
- corpus 延迟5s：等待期间输入 `global steps`，加载后返回正确结果。
- corpus 首次503：显示失败提示，改为 `global steps epoch` 触发重试并返回结果。
- 主 bundle 返回前直接输入：输入保留，UI 初始化后打开并查询。
- 桌面1280及手机375×812：Header高70、单一shell；手机查询窗口x8.5、宽358、底279，位于视口内；关闭清空查询。
- Overview、Friends、Archive、ENotes、More；浅色/深色；即时导航及历史返回通过。
- 搜索跳转到 global steps 笔记：17/17 公式完成，0错误、0公式内搜索 mark。
- 静止搜索 `data-edwinos-search-idle=1`，初始约3绘制帧，之后停止刷新。

截图与请求日志临时保存在 `/private/tmp/edwinos-*`。预览仍为 `http://127.0.0.1:8000/`。

## 自动验证和边界

`mkdocs build --strict`、116项Python测试以及搜索引擎53项、Worker生命周期7项、loader、IME/交互、搜索数学和正文数学测试均通过。部署工作流已加入这些Node检查。

没有把本机FCP当作线上Lighthouse分数，也没有更改内容或整体设计。首次立即搜索仍可能等待未下载的 corpus；空闲预热、加载提示、最新查询缓冲和失败重试负责这段等待。HOME子页的Profile仍由现有运行时生成，这是后续单独构建期迁移的候选。CSS全量重排、Service Worker和更换CDN此次未引入。

资源优先级选择参考 [web.dev Fetch Priority](https://web.dev/articles/fetch-priority) 和 [LCP 优化文档](https://web.dev/articles/optimize-lcp)；Material协议核对了当前安装版本的bundle source map。

## 搜索跳转与 Overview 胶囊复查（2026-10-10）

搜索 `jing` 的索引结果正确，目标是 Python 的 `#lec6-files`。缺陷在导航和高亮时序：Material 先发布带 `h` 的目标地址，再等待 HTML，正文高亮订阅立即遍历尚未替换的 Overview；其即时导航 XHR 没有超时，慢请求会让错页停留。关闭搜索时还会清空查询并更新结果，因此点击处理一并加固为先保存完整目标 URL，再关闭搜索，避免依赖可能已更新的结果 DOM。

`ui-perf.js` 的 window capture 现在先捕获目标，再关闭搜索。跨文档或高亮词变化走浏览器原生文档导航，保留完整 `h` 和 fragment；阻止 Material 提前发布地址。相同文档、相同高亮词的 fragment 继续由 `block-links.js` 处理。修改键、中键、新标签和下载保持原生行为。原生导航会重新初始化页面运行时，这是有意的可靠性取舍；同源静态资源继续使用浏览器缓存，重语料仍在首屏后或搜索意图时加载。

本机慢加载服务将 Python 响应延迟 8 秒，并把测试站点地图改为本机地址，确保修复前确实启用即时导航。修复前，Python 地址下仍显示 Overview，出现 7 处 Jing 搜索高亮；修复后，离开 Overview 的 pagehide 记录仍是 Overview 地址、0 处搜索高亮，随后进入 Python 并保留 `?h=jing#lec6-files`。没有把服务端人为延迟当作代码能够消除的网络时间。

Overview 的选中背景现由 `::before` 使用 `--edwinos-header-active-tab-background` 绘制，旧 HOME 子页规则只清空 link 背景和 `::after`，漏掉这层胶囊。现有 Header 规则直接将该变量设为 transparent，深浅色都生效；模板在初始 Header 绘制前设置 Archive/Friends body class，运行时仍负责即时导航后的路线状态。

验证包括：

- 桌面进入 Archive/Friends，深浅色胶囊 computed background 均为透明；回到 Overview 后正常恢复选中背景。
- 手机 375×812 直接打开 Archive/Friends；Header 高70，Overview 胶囊透明；搜索 jing 点击到达正确章节，搜索关闭并清空。
- 鼠标、键盘 Enter、同页重复查询、后退和前进；返回 Overview 时无残留搜索 mark。
- 搜索交互 harness 覆盖关闭时结果 href 被改写、不同高亮词、index.html、部署子路径、Unicode、修改键和新标签语义。
- `mkdocs build --strict`、117 项 Python 测试、53 项搜索引擎检查、7 项 Worker 检查及 loader/交互/搜索数学/正文数学测试通过。

临时慢加载服务用于复现，正常本地预览仍为 `http://127.0.0.1:8000/`。修改未发布。

## 刷新首帧稳定性修复（2026-10-12）

浏览器逐帧记录证实，刷新跳动包含真实的初始/最终状态差异：

- 首页 body 的 `is-homepage` 原先由末尾运行时设置；部分字体/字号规则延后生效。本机1440px样本正文高度随后减少约100px，375px样本约276px。
- article 的 `pageFadeIn` 从下移15px开始；内部区块再下移7px，侧栏与正文叠加运动。
- Header最终去边框规则优先级不足；computed border-bottom仍是1px。渐变玻璃也在运行时才插入。
- GitHub事实行运行时插入，仓库文字区从约13px增高至30px。
- Friends/Archive在运行时包裹正文、生成侧栏，其首帧没有完整Profile布局。

修复在已有组件和模板内完成：首页路线类提前设置、Header玻璃和Source事实行静态输出、匹配原边框规则的优先级、取消HOME入场位移。`home_sections.py`在构建时复制首页 authored aside 并校正URL，移除运行时两份Profile生成代码；复制侧栏排除搜索。Header使用Material现有控制结构，搜索和即时导航仍复用同一节点。Inter/JetBrains Mono及Archive阅读字体使用同源preload，没有新增样式入口或字体来源。

最终验证使用本机Edge/Chromium，1440×900与375×900、深浅色，Overview/Friends/Archive/ENotes/More共20组。主bundle在人为延迟800ms时，Header始终0px边框、单一玻璃，GitHub事实行和HOME侧栏已在初始DOM。侧栏和正文起点保持稳定；32次首页刷新（每个宽度/主题在顶部和650px处各4次）分别保留0和650，没有累计偏移。原始版本的这组普通无hash刷新也没有复现用户所见的自动下滑，因此不将该现象归因于一个未经证实的显式scroll调用；本次移除了已证实的初始化几何变化，保留浏览器正常滚动恢复和片段导航。

首帧/运行时后的截图与几何还核对了搜索query/close、Overview→Friends→Archive→Overview，以及禁用JavaScript的HOME页面。桌面Profile矩形均为x40/y92.3125/260×564.359375；手机均为x17/y86/341×296.078125。125项Python、搜索交互与Back to Top光学生命周期检查、strict build通过；927条搜索记录仍正常预建。

测量边界：这是本机响应条件下的启动审查，不是线上所有设备/网络的零CLS承诺。字体继续采用swap；远程Friends头像、访客统计或字体失败/迟到仍可能改变局部高度。检测到的首屏CLS首页为0，Friends深色样本约0.00031；少量底部/列表高度变化不移动HOME首屏起点。没有强制把刷新滚动位置归零，也没有隐藏Back to Top掩盖滚动。

原始/修复逐帧数据、20组记录及首帧/后续截图保存在本次临时文件 `/private/tmp/edwinos-startup-*.json`、`/private/tmp/edwinos-refresh-*.json`、`/private/tmp/edwinos-first-frame-*.png` 和 `/private/tmp/edwinos-settled-frame-*.png`。预览服务器已重启以加载新的Python hook，地址仍为 `http://127.0.0.1:8000/`。本次修复未推送。

## 首页图片刷新复查（2026-10-12）

校徽与 Workshop 原先先以 opacity 0 隐藏原图，等待末尾 UI 初始化和 decode 后再进行 180ms 淡入。图片即使已经下载完成也会重复这段显示变化；首张 Publications 配图的 lazy/low/async 又延后了绘制。这与布局是否在初始 HTML 中完整呈现是两个问题。

现有图片组件取消原图透明度门控和淡入，保留固有尺寸及内联模糊占位。`partials/image-previews.html` 在 head 注册唯一的加载/decode owner，图片就绪便撤下预览；`ui-perf.js` 的即时导航刷新复用这个 owner。透明校徽的占位也提前撤下，避免模糊图从透明区域透出重影。首页只对校徽、第一张真实论文配图、第一张 Workshop 图输出同源 preload，并保留 srcset/sizes；这三张采用 eager/auto/sync，后续论文配图仍 lazy/low/async。原始图片和展示比例均未替换。

本机 Edge/Chromium 逐帧测试将主 bundle 延迟 650ms：旧实现记录到 16 个变化状态，其中 15 个状态含已加载但隐藏或半透明的图片；修改后记录到 1 个稳定状态，0 个已加载图片被隐藏的状态。另将主 bundle 延迟 1800ms，校徽在主 UI 启动前/后的裁剪截图差异为 0 像素。

1440/375px、DPR 1/2、深浅色共 8 组验证，每次首页加载仅请求匹配当前 DPR 的三张目标图片，没有重复下载备用缩略图；每组在 scrollY 1000 连续刷新三次均保持 1000。目标图片的 opacity 为 1、无淡入 transition，无页面脚本错误。图片响应延迟 1600ms 时，校徽占位在等待中可见，成功后撤下，前后矩形均为 200×65.75。禁用 JavaScript 时原图正常可见。

首页→Friends→Archive→首页及搜索打开/查询/关闭回归通过，桌面与手机首屏 Profile 几何前后一致。127 项 Python 测试、导航/媒体生命周期检查和 strict build 通过。记录保存在 `/private/tmp/edwinos-images-{before,after}.json`、`/private/tmp/edwinos-image-regression.json` 及对应截图。本机测试人为延迟脚本或图片并隔离第三方统计，不代表所有线上网络都能首帧收到图片；慢网仍会有从预览到清晰图的正常加载过程。修改未推送，预览仍为 `http://127.0.0.1:8000/`。
