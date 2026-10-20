# 陈天行个人网页：源码、实站与 REA 对照学习

核查日期：2026-10-13（北京时间）。目标：[实际网页](https://tianxingchen.github.io/)、[GitHub 仓库](https://github.com/TianxingChen/tianxingchen.github.io)。

源码定位固定到本次核查的 [b92ce6cd](https://github.com/TianxingChen/tianxingchen.github.io/commit/b92ce6cd97835ce5a63028a37b0edc27eef02cfd)，避免后续更新导致行号漂移。浏览器检查的是当时线上页面；结构、脚本长度和关键样式与快照吻合，但未对部署响应做逐字节校验。

## 结论与阅读入口

这个首页适合直接拆解：它是原生 HTML/CSS/JavaScript 单页，核心交互只有一个约 15KB 的内联脚本。REA 可以辅助整理函数与静态关系；读原始源码、测量实际网页，才容易理解布局与交互状态。本次确实安装并运行了 REA，而非仅依据宣传判断。

**首先打开 `index.html`，不要从 `style.css` 开始。** 当前首页只加载 Google Outfit 字体的外部 CSS；自身 CSS 在 HTML 的 19–1658 行，JavaScript 在 3527–3957 行。`style.css` 是另一套旧版纸张／手写设计，使用 `.site-nav` 等不同结构，当前首页没有引用它。`index_backup.html` 同样不能当作当前首页入口。仓库里能看到的文件不等于网页实际加载的文件。

阅读顺序：全局变量与 `.wrap` → 导航玻璃 → 首屏 grid → 响应式覆盖 → 页面原始结构 → 末尾内联 JS。运行时 DOM 已经过作者压缩、滚动显示和 `inert` 设置，不能直接把它当作原始结构。

## 页面效果与源码对应

以下行号全部属于固定提交的 [index.html](https://github.com/TianxingChen/tianxingchen.github.io/blob/b92ce6cd97835ce5a63028a37b0edc27eef02cfd/index.html)。表中 HTML/CSS/JS 为源码阅读证据；浏览器测试另列在后面。

| 可见模块 | HTML 起始行 | CSS 起始行 | 要学习的机制 |
| --- | ---: | ---: | --- |
| 固定导航 | 1663 | 71 | 透明固定层、渐进 blur 与 mask |
| 首屏介绍 | 1689 | 187 | 两栏 grid、照片遮罩背景、手机头像置顶 |
| News | 1807 | 390 | 日期／内容网格，前八条与展开历史 |
| Education | 1987 | 415、488 | 基础规则再由 `.edu-list--rows` 定向扩展 |
| Entrepreneurship | 2022 | 545 | Logo、角色、日期的横向结构 |
| Research Experience | 2056 | 433 | 经历条目有独立布局 owner |
| Publications 概览 | 2090 | 631 | 统计卡片与媒体展示，随后按七类分组 |
| 论文侧边目录 | 2091 | 728 | 桌面固定目录，仅在论文区附近显示 |
| Others 预览 | 2903 | 816 | 220px 裁切、72px 渐隐、不可交互的隐藏条目 |
| Honors | 3057 | 968 | 图片网格、补充荣誉折叠 |
| Competitions | 3208 | 1000 | Flex 卡片与图片比例 |
| Open Source | 3298 | 1073 | 项目图标和文字网格 |
| Talks | 3345 | 1162 | 主题与演讲条目分组 |
| Services | 3430 | 1119 | 服务卡片与文字列表 |

## 值得复现的机制

### 1. 导航的渐进模糊

[CSS 第 72 行](https://github.com/TianxingChen/tianxingchen.github.io/blob/b92ce6cd97835ce5a63028a37b0edc27eef02cfd/index.html#L72) 将导航内容与背景光学层分开。导航本体透明、固定在顶部，`isolation: isolate` 限定层叠上下文；背后的光学层延伸到导航下方 52px，不能接收点击。

五层 `backdrop-filter` 分别为 3、6、10、16、22px，每层的垂直渐变 mask 不同；上部更模糊，下部逐渐让原始内容显露。另有一层白色渐变，从顶部 alpha .9 退到 78% 高度时的 0。因此文章滚入顶部时逐步淡出，没有硬边界。

这是 CSS 渐进模糊。当前源码没有 SVG displacement、WebGL shader 或液体折射运行时；不要与 EdwinOS 当前导航胶囊的光学算法混为同一个实现。

### 2. 滚动决定导航选中项

[`initNavActive` 第 3656 行](https://github.com/TianxingChen/tianxingchen.github.io/blob/b92ce6cd97835ce5a63028a37b0edc27eef02cfd/index.html#L3656) 用 `scrollY + 导航高度 + 28px` 作探测线，选取页面位置在它上方的最后一个目标。目标按页面真实位置排序，不能只按导航标签顺序。到文档底部 8px 范围内强制选择末项。

点击仍由原生 hash 锚点负责，CSS 提供 smooth scroll；JS 只更新 class。`passive` 不等于无需消耗：原版 scroll handler 仍会重复测量和排序。学习示例将这些更新合并到一次 animation frame。

原站根节点使用 scroll-padding；**不要直接把这条移植到 EdwinOS**。EdwinOS 的 sticky search 输入曾因此出现文档移动，现有 Fragment owner 有自己的约束。

### 3. 响应式不只是缩小字号

≤960px 先收紧横向留白、调整卡片列数；≤860px 桌面导航变菜单；≤680px 首屏变一栏并把头像移动到正文前，经历、创业和演讲重新排布；≤420px 再缩小论文缩略图。论文侧边目录只在 ≥1280px 出现。

| 浏览器宽度 | 导航高 | 容器左右 padding | 首屏内容宽 | 首屏列宽 | 标题字号 |
| ---: | ---: | ---: | ---: | --- | ---: |
| 1440 | 56px | 28px | 1064px | 670.242 / 361.758px | 56px |
| 768 | 56px | 22px | 724px | 468.32 / 231.68px | 42.24px |
| 390 | 52px | 16px | 358px | 358px 单列 | 35.1px |

这三种宽度均实测无横向文档溢出。它们是抽样结果，不能替代所有临界宽度和所有浏览器的测试。

### 4. 内容密度与交互状态

- 简介使用原生 `details/summary`，无需自制折叠引擎。
- News 初始八条，点击展开时实际显示 42 条；原按钮只更新文字和 class，没有更新 `aria-expanded`。
- 作者压缩先识别自己、共同一作／通讯等标记，再保存完整作者 HTML；论文主导高亮必须先于压缩运行，否则原始作者位置已经改变。
- Others 折叠会把后续论文设为 `inert`，防止键盘进入被裁掉的链接。点目录里的 Others 会先展开，再导航。
- [`initPubFeaturedLightbox` 第 3820 行](https://github.com/TianxingChen/tianxingchen.github.io/blob/b92ce6cd97835ce5a63028a37b0edc27eef02cfd/index.html#L3820) 按需创建媒体；关闭时暂停视频并移除节点。原版没有完整的焦点陷阱和焦点返回机制。
- Reveal 用 IntersectionObserver，threshold .06、底部 rootMargin -30px，第一次显示后取消观察。CSS 的初始隐藏没有普通 no-JS fallback，学习示例保留默认可读内容。
- `initVideoPingPong` 虽在源码中，但当前 HTML 没有 `video-pingpong` 元素，属于未启用的能力，不能当作实站正在运行的动画。

## REA 实测：有价值，也有明显边界

版本：`rea-agents@6.4.0`；运行时：Node v24.19.0。临时安装在 `/private/tmp/tianxingchen-study/rea`，使用 `--ignore-scripts`；未执行 setup，未改 Codex MCP 配置。

| 输入 | 解析 JS 文件 | AST 节点 | 语义图 | 结论 |
| --- | ---: | ---: | --- | --- |
| 原始 HTML 目录 | 0 | 0 | 无首页 JS 语义图 | CLI 成功不代表理解了内联脚本 |
| 原样提取内联脚本 | 1 | 2345 | 1687 节点、1192 关系、76 函数 | 可以辅助定位函数和静态关系 |

REA 明确报告 **588 个 unknown，整体 coverage 为 unknown，各分析 family 为 partial**。零 app-level `findings/modules` 与非零 semantic graph 是不同指标，不能只看第一项就判定全失败，也不能把生成的图当作完整调用链。

函数行号能准确回溯：`initMobileNav`→3630、`initNavActive`→3656、`initResearchToc`→3754、`initPubFeaturedLightbox`→3820、`initVideoPingPong`→3898。提取原样保存脚本内容；[provenance](evidence/inline-provenance.json) 记录 offset、哈希与行号公式。

完整成功结果约 2.6MB，保存在临时目录，仓库仅保留 [精简实测结果](evidence/rea-pilot.json)。第一次沙箱运行被 macOS Swift 辅助程序的编译缓存权限阻断，允许该缓存访问后完成；这次静态分析没有执行目标网页脚本，也没有进行 REA 浏览器采集。

对这个无框架 bundle 的小型首页，直接源码阅读最容易解释 CSS、DOM 和浏览器事件。REA 更适合作为函数／数据关系的补充证据。将来遇到压缩 bundle 或难追踪的网络行为，再使用它的 [网页观察](https://github.com/morluto/rea/blob/main/docs/browser-observation.md) 与 [交互采集](https://github.com/morluto/rea/blob/main/docs/browser-scenario-contract.md) 工作流。

## 如何复跑 REA

先把固定提交的 `index.html` 下载到独立目录，执行本目录的 `extract_inline.py`。它只读取 HTML 并生成 JS 与 provenance，不执行代码。提取结果行号以保留的首个换行为准，不能手动加 banner 后继续沿用旧 offset。

```sh
python3 extract_inline.py /absolute/path/index.html /absolute/path/derived
npx -y rea-agents@6.4.0 analyze-javascript-application /absolute/path/derived --format json --full-output
```

本机普通 shell 没有 `node/npm` 在 PATH 上，因此本次使用 Codex 的 bundled Node 与临时 pnpm 安装。临时实测包入口位于 `/private/tmp/tianxingchen-study/rea/node_modules/rea-agents/scripts/rea.mjs`。这些临时文件后续可能被系统清理；持久笔记和提取工具已保留在仓库。

## 实站检查与学习示例

实站实际验证了：三种宽度的布局；手机菜单展开后链接变 flex、body 滚动锁定；Escape 收起；News 八条→42条；Publications 活动导航与侧边目录；RMBench 图片灯箱打开与 Escape 关闭后媒体清空；Others 目录链接自动展开并解除隐藏条目的 inert。没有穷举所有论文、视频、hover 状态与浏览器；媒体播放差异不属于已完成验证。

学习示例位于仓库根目录 `experiments/tianxingchen-lab/`。它重现渐进玻璃、响应式首屏、原生折叠、News 展开和滚动导航，使用样例文字与 CSS 图形。它不是完整站点镜像，也没有复制学长的个人资料或照片。

建议按“关掉一层 blur 看差异 → 调整 grid 的百分比 → 改变导航探测线 → 改折叠状态与 aria”顺序实验。先理解每一层为什么存在，再考虑迁入 EdwinOS 的对应 owner。本次学习代码独立于生产站入口；研究目录被 MkDocs 排除，不会进入公开文章与搜索语料。
