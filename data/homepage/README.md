# Overview 内容维护说明

首页的 Recent News 与 Publications 会在每次 MkDocs 构建时，从本目录的
两个 YAML 文件生成完整 HTML。日常更新不需要修改 HTML、CSS 或 JavaScript。

## 添加 Publication

1. 将论文或项目预览图放进 `docs/assets/images/publications/`，可以压缩为 `.webp`、
   `.avif`、`.jpg` 或 `.png`。图片必须小于等于 256 KiB、总像素不超过 200 万；
   构建会自动检查文件，并把原始宽高写进 HTML。缩略图建议导出为约 480 px 宽的
   WebP，以兼顾高分屏清晰度和加载速度。前端在各断点保持既有固定宽度，并按图片
   原始长宽比自动计算高度；不应为适配卡片裁切图像。所有 Publication 图片都从站内
   加载，第一张有效图片会提前请求，其余图片按需加载。缩略图仅作预览，不启用全站
   图片灯箱；访客通过卡片中的项目、论文、代码或视频链接进入详细内容。
2. 把下面模板复制到 `publications.yml` 的 `entries` 中，并填写内容：

```yaml
  - id: "short-unique-id"
    title: "Full paper title"
    image: "assets/images/publications/short-unique-id.webp"
    image_alt: "Short description of the paper teaser"
    authors:
      - name: "First Author"
        marks: "*"
      - name: "Chen Jing"
        self: true
        marks: "*"
      - name: "Senior Author"
        marks: "†"
        url: "https://example.com/profile"
    venue:
      name: "ICRA"
      year: "2027"
      status: "Under Review"
      rank: ""
    award: ""
    lead: true
    links:
      - label: "Project Page"
        url: "https://example.com/project"
      - label: "Paper"
        url: "https://arxiv.org/abs/0000.00000"
      - label: "Code"
        url: "https://github.com/example/repository"
```

字段规则：

- `id` 必须唯一，只能使用小写字母、数字、`-` 和 `_`。
- 自己的作者项填写 `self: true`；名字恰好为 `Chen Jing` 时也会自动识别。
- `marks` 可以填写 `*`、`†` 或 `§`，含义在 `settings.author_notes` 中维护。
- 只有确实需要强调第一作者、共同一作等贡献时才填写 `lead: true`。页面不会根据
  姓名顺序猜测贡献关系。
- 作者数超过 `collapse_after` 且名单包含自己时，默认保留首位作者、Chen Jing、
  带贡献符号的作者和末位作者；完整名单可通过 `Detailed author list` 展开。
- 图片还没准备好时，可以把 `image` 留空，并填写 `placeholder: "WIP"`。
- `venue.name/year/status/rank` 分别用于会议或期刊名、年份、投稿状态和分区/评级。
- `links` 可以自由添加 Project Page、Paper、arXiv、Code、Dataset 等平台。

## 可选：机器人动作缩略预览

没有 `preview` 的条目保持静态图片：不生成 video／播放按钮，也不会请求视频。
真实素材准备好后，在对应条目中增加：

```yaml
    preview:
      src: "assets/videos/publications/bipedal-wbc.mp4"
      description: "BipedalWBC performs a complete pick-and-place action"
```

- 文件放在 `docs/assets/videos/publications/`，只接受本地 `.mp4`／`.webm`，上限
  **3 MiB**。构建检查路径、存在性与大小；拒绝外站、参数、路径越界及越界符号链接。
  构建不解码视频，因此添加素材后还需实际浏览器验收。
- 优先 **H.264 MP4、yuv420p、无音轨、faststart**，建议 **4–7 秒、480 px 宽、
  24 fps**，先争取约 0.5–1.5 MiB，再按实际细节调整。MP4 可以复用浏览器视频解码、
  暂停和按需请求；GIF 不进入这条 pipeline。WebM 可用于已确认浏览器支持的素材，
  MP4 是正式素材的推荐格式。
- 保留原生静态 `image`。最好从预览第一帧导出同长宽比封面，避免播放时跳变；画面
  包含清楚的起始、动作、结果，循环接缝自然。不得为了尺寸直接拉伸机器人。
- `description` 描述动作，供播放／暂停按钮的辅助技术标签使用；论文的独立视频链接
  继续指向完整视频。不要在配置中放入测试片、示意假视频或第三方下载地址。

加载与交互：初始 HTML 仅有 `data-preview-src`、`preload="none"`，不设置视频
`src`，现有第一张封面的 preload/readiness 不变。细指针在当前论文行中距离图片
80 px 内停留 120 ms 时，只预备这一段素材；悬停图片 80 ms 后播放。离开图片恢复
封面并暂停；每次播放从动作起点开始。键盘聚焦按钮可以预备，Enter／Space 明确播放；
手机通过按钮播放／暂停。减少动态效果／Save-Data 时禁用指针预备和自动播放，仍可
主动点击。页面后台、图片离屏、焦点离开或导航替换都会暂停；任何时刻仅一个预览。
已有意图触发的下载可由浏览器缓存，离屏暂停不保证立刻取消传输。

播放请求完成并确认真实帧可呈现后才覆盖静态图；不支持视频帧回调的浏览器等待
`play()`、当前帧数据与两次绘制机会。加载失败／超时恢复封面并提供 Retry preview，
不会自动反复重试。短意图预备只能减轻冷加载延迟；网络慢时仍保留封面与 Loading…。
脚本不运行时静态图片照常可用，按钮保持隐藏。

如本机已有 ffmpeg，可先在站点目录外导出（脚本不会安装 ffmpeg，也不覆盖现有文件）：

```bash
.venv/bin/python tools/prepare_publication_preview.py /absolute/path/source.mov /tmp/bipedal-wbc.mp4 --start 12 --duration 6
```

脚本同时生成匹配的 `.webp` 封面；确认人眼可读、循环、体积和移动端清晰度后再把
素材复制到上述两个目录并填 YAML。没有 ffmpeg 时，在剪辑软件按相同参数导出即可。
接入后运行 `.venv/bin/python -m unittest tools.test_home_sections`、
`mkdocs build --strict` 与 `node tools/test_publication_previews.cjs`（后者需要 Playwright，
可设置 `NODE_PATH`／`BROWSER_EXECUTABLE`；测试视频由浏览器临时生成，不写入站点）。

## 添加 Recent News

在 `news.yml` 的 `entries` 中加入一项即可，构建时会按日期自动倒序：

```yaml
  - date: "2026-08-27"
    text: "A concise description of the update."
    links:
      - label: "Project Page"
        url: "https://example.com/project"
```

最新的 `visible_count` 条会直接显示，更早的条目自动进入 `Show more`。
页面日期统一自动显示为 `MM/YYYY`，原始 `date` 仍填写完整的 `YYYY-MM-DD`，
用于正确排序和机器可读的日期。
如果链接应直接落在句子中的某个短语上，可用 `inline_link`；其 `label` 必须在
`text` 中恰好出现一次：

```yaml
  - date: "2026-09-16"
    text: "Our short paper was accepted at the MoMA.v5 Workshop at IROS 2026."
    inline_link:
      label: "MoMA.v5 Workshop at IROS 2026"
      url: "https://example.com/workshop"
```

## 本地预览、检查和发布

在仓库根目录运行：

```bash
git pull --ff-only origin main
.venv/bin/mkdocs serve -a 127.0.0.1:8000
```

浏览 `http://127.0.0.1:8000/`。确认页面后按 `Ctrl+C` 停止预览，再运行：

```bash
.venv/bin/mkdocs build --strict
git add data/homepage/news.yml data/homepage/publications.yml docs/assets/images/publications/
git commit -m "content: update Overview publications and news"
git push origin main
```

推送到 `main` 后，现有的 **Deploy MkDocs to GitHub Pages** workflow 会自动部署。
如果只改了一个数据文件，可以只 `git add` 那一个文件；不要为了内容更新执行
`git add .`，以免把其他尚未完成的工作一起提交。
