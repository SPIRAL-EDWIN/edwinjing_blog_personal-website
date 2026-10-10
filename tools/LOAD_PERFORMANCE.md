# EdwinOS 首次加载审查

记录日期：2026-10-09。修改尚在工作树，未推送或发布。

## 已落实的加载顺序

1. HTML/CSS 直接显示正文、导航和完整搜索玻璃胶囊；运行时复用同一外壳。
2. Material 读取轻量搜索 manifest，用于分词及正文高亮。完整 corpus 不再由主线程下载、JSON.parse、structured clone。
3. 搜索聚焦、点击、输入、快捷键或 `q/query` 深链接立即启动 Worker 加载；没有搜索意图时，在 load、两帧、2 秒和 idle 后预热。Save-Data/2G 只按用户意图启动。
4. Worker 并行请求搜索库与完整 corpus，完成后才发 READY；加载期间保存最新查询，失败后新输入可重试。`h` 高亮链接无需等待完整 corpus。
5. 仓库、友链数量、部署时间请求在首屏之后启动。仓库统计只保留 EdwinOS 一套请求路径，顶部和手机抽屉共享数据。
6. 初始 UI 生命周期按 content/header 对去重。关闭状态的搜索光学表面只刷新静态帧，交互动效继续追踪帧；字体加载完再校正几何。
7. 头像 eager/high；校徽、论文配图、海报和访客图 lazy/low。正文入场动画初始就可读，时长缩至 350ms、延迟上限 80ms。

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
- Overview、Friends、Archive、ENotes、More Experiences；浅色/深色；即时导航及历史返回通过。
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
