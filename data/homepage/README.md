# Overview 内容维护说明

首页的 Recent News 与 Publications 会在每次 MkDocs 构建时，从本目录的
两个 YAML 文件生成完整 HTML。日常更新不需要修改 HTML、CSS 或 JavaScript。

## 添加 Publication

1. 将论文或项目预览图放进 `docs/assets/images/publications/`。建议使用压缩后的
   横向 `.webp`、`.avif`、`.jpg` 或 `.png` 图片。
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
