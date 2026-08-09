# Lab Projects Publishing Execution Plan

Status: approved outline only; implementation has not started.

Source scope:

`/Users/edwin/Documents/Obsidian/ZJU Notes/学术科研/raw/notes/Lab_Projects`

Website scope:

`/Users/edwin/Documents/edwinjing-blog-website`

## 1. Non-negotiable rules

- Publish 16 non-empty notes. Skip the zero-byte `Project：Handwriting Recognition来初步学习神经网络.md` entirely: no page, navigation item, search result, or Archive card.
- Treat the newly moved `Diffusion-policy-training中global steps和epoch的区分实例.md` as an in-scope source note and restore two-way links with `Diffusion Policy数据训练流程.md`.
- The user's current source edits are authoritative:
  - Hand-eye calibration line 33 is already corrected; do not rewrite it again.
  - Hand-eye calibration lines 58 and 71–73 must remain unchanged.
  - Hand-eye calibration line 74 has already been rewritten by the user; do not change it.
  - The MDP `_loco_mani_scale` explanation has already been rewritten by the user; do not change it.
  - The detailed MDP step-order explanation remains in place; add only a warning that it is strongly tied to the repository version and implementation.
- Original Obsidian notes may be edited only for explicitly approved basic corrections: spelling, punctuation, Markdown structure, broken formatting, and unambiguously invalid command syntax. Preserve a before/after hash list and a per-file source changelog.
- Approved higher-order editorial changes, public redactions, experiment-number removal, warning cards, site metadata, and Obsidian-to-MkDocs syntax conversion belong to the website publishing copies unless the user separately authorizes source rewrites.
- Do not run any imported shell, Python, training, installation, Docker, SSH, `sudo`, deletion, or deployment command from the notes. Static linting only.
- Do not commit, push, or deploy without a separate explicit user instruction.

## 2. Publication manifest

### ENotes / Embodied AI — 5 pages

1. `【Hand-Eye Calibration】 手眼标定理论与实践.md`
2. `【MDP】奖励函数解构学习.md`
3. `仿真框架RFM的初步学习.md`
4. `如何确定\`_init_.py\`中特定task选取的robot asset.md`
   - Correct `_init_.py` to `__init__.py` in the source filename/body as an approved basic correction.
   - Update the inbound source wikilink from the RFM note.
5. `Diffusion-policy-training中global steps和epoch的区分实例.md`

Target root: `docs/OsdNotes/Embodied AI/`

### More Experiences / Phi Lab — 11 pages

Phi Lab root:

1. `Bash命令与服务器训练操作查表指南.md`
2. `补充插件：Tensorboard & WandB.md`

Phi Lab / Diffusion Policy:

3. `Diffusion Policy checkpoint 数值与可视化评估流程.md`
4. `Diffusion Policy 真机部署流程.md`
   - The published page title/filename becomes `Diffusion Policy 真机部署概念架构`.
   - Keep the approved original conceptual body except for basic corrections, redaction, link conversion, and the warning card.
5. `Diffusion Policy数据训练流程.md`
6. `基于Ubuntu+4090GPU服务器的UMI-diffusion-training框架搭建指南.md`
7. `基于Ubuntu+RTX50系列的UMI-diffusion-training框架搭建指南.md`
8. `🦾UMI_Matrix-Studio配置架构.md`

Phi Lab / WBC:

9. `Sim2Sim配置与训练.md`
10. `UMI-on-Tron 仿真训练流程.md`
11. `基于Ubuntu+RTX50系列的Isaac Lab仿真框架搭建指南.md`

Target root: `docs/经验分享/Phi Lab/`

Do not reclassify pages from their source directory names. In particular, Bash belongs to Phi Lab and robot asset belongs to ENotes/Embodied AI.

## 3. User-approved higher-order policy

### Hand-eye calibration

- Use the user's notation convention as authoritative: `{}^A_B T` means transforming A to B / expressing B in coordinate frame A, as stated by the user. Do not reinterpret the convention during publication.
- Preserve the already-corrected line 33.
- Preserve lines 58 and 71–74.
- Revise only the sampling claim: explain that solvability requires diverse, non-degenerate poses; 15–20 poses is an engineering heuristic, and more poses do not guarantee monotonically better accuracy.
- Correct the homogeneous-matrix explanation to the explicit final row `[0, 0, 0, 1]` as a basic mathematical/format correction.

### MDP note

- Preserve the user's revised `_loco_mani_scale` explanation.
- Preserve the step-order body.
- Add a warning immediately before the step-order section stating that the ordering is strongly coupled to the current Isaac Lab/RFM repository version, manager implementation, and commit, and is not a framework-wide invariant.

### RFM note

- Preserve the user's runner/environment/optimizer analogies and responsibility narrative, except for basic errors.
- Apply the approved correction to the `.pt`/checkpoint/ONNX explanation: checkpoint content depends on project serialization; ONNX is primarily a cross-platform inference exchange format; do not promise a specific size or universal resume contents.
- Explain Diffusion Policy as conditional denoising of a future action sequence/chunk rather than only predicting the next action.

### Robot asset note

- Preserve the current task/registry/asset tracing logic except for basic filename/class-name corrections.
- Add a version-dependent warning; do not expand the article into a new runtime-override tutorial.

### Isaac Lab RTX50 guide

- Preserve the approved installation approach, nightly/swap/dependency discussion, and project-specific workaround narrative except for basic syntax/format corrections.
- Revise the approved WBC metric interpretation section: distinguish parallel environments from multiple brains, physical steps from control steps, overlapping termination statistics from mutually exclusive rates, and measured facts from speculative performance conclusions.
- Do not publish the real project training metrics or screenshots containing them.

### UMI-on-Tron guide

- Preserve the approved original operational strategy, including risky operations, except for unambiguously invalid syntax.
- Add a strong warning before destructive/cache/checkpoint operations: they are personal-environment records, require target validation and backup, and must not be copied on a shared machine without administrator approval.

### Diffusion Policy training and evaluation

- Apply the approved method-level corrections in the website copies:
  - separate the historical run example from the reusable parameterized template;
  - make GPU/process/run identity internally consistent;
  - distinguish measured dataset frequency from a universal default;
  - match and pair the intended VIO MCAP files precisely;
  - describe TopK as selection by training loss rather than proof of best generalization;
  - document held-out limitations and avoid mixing run1/run3 evidence.
- Do not publish real experimental result numbers, run identities, task dates, episode counts, MSE/RMSE, video-result statistics, or equivalent screenshots. Preserve formulas, metric definitions, and anonymized examples.

### Diffusion Policy deployment concept page

- Follow option A: publish as `Diffusion Policy 真机部署概念架构`, not as an executed or safety-validated deployment manual.
- Preserve the conceptual body and add an explicit warning that it is not a robot safety procedure.

### Matrix Studio

- Follow option B in the website copy:
  - replace the credential prose with `需要账号密码`;
  - examples use `<USERNAME>` and `<PASSWORD>` only;
  - fix Markdown URLs embedded inside shell blocks;
  - document Docker-group root-equivalent risk;
  - prefer precise ownership/permission guidance over generalized `chmod -R 777`;
  - describe VIO as an estimate/training reference unless external ground-truth validation exists;
  - pin certificate/script/image sources to authoritative immutable identifiers only when they can actually be verified. Never invent a fingerprint, digest, revision, or checksum. If an immutable source cannot be verified, convert that operation into a non-executable explanatory step and flag it in the review report.

## 4. Credential and public-redaction rules

Credential rotation remains a security recommendation, but it is not a website-publication prerequisite for this task. Publication is blocked only until every staged page, copied asset, generated report, built HTML file, navigation/search artifact, and Git diff contains zero original credential values and zero specific laboratory infrastructure identifiers.

The original Obsidian notes remain the user's private source material. Do not copy their concrete credentials into staging, logs, manifests, diffs, screenshots, or the website repository.

Website copies must never contain the original values.

- TensorBoard/W&B: remove both concrete keys and use `<WANDB_API_KEY>`.
- Matrix Studio prose: `需要账号密码`.
- Matrix Studio examples: `<USERNAME>` and `<PASSWORD>`.
- In shell blocks, quote placeholders or assign them to variables so angle brackets are not parsed as shell redirection.

Use an explicit reviewed redaction map, not a broad blind regex:

- server IP/hostname: `<SERVER_HOST>` or a quoted `$SERVER_HOST` variable;
- SSH/user account: `<SERVER_USER>` / `<USERNAME>`;
- personal and internal absolute paths: `<LOCAL_PATH>`, `<SERVER_PATH>`, `<REPO_ROOT>`, `<DATA_ROOT>`;
- private repository URL/commit: `<REPOSITORY_URL>`, `<COMMIT_SHA>`;
- W&B entity/project/run/URL: `<WANDB_ENTITY>`, `<WANDB_PROJECT>`, `<WANDB_RUN_ID>`;
- real task/run/date/episode/result identities: descriptive neutral placeholders.

Keep public official documentation and public upstream repository URLs when they are genuinely public and necessary. Do not replace public dependency versions merely because they contain numbers.

Images require the same review as text. Any image showing credentials, hostnames, IPs, usernames, paths, private repository identity, W&B run identity, or unpublished experiment results must use a derived redacted publishing copy. Preserve the original Obsidian image unchanged.

## 5. Standard warning cards

Add the appropriate card near the beginning of every published page, after site metadata/title and before substantive body content.

### Theory/source-dependent variant

Use for the 5 ENotes pages:

```markdown
> [!warning] 阅读说明
> 本文是笔者基于特定课程、项目代码与个人学习过程整理的工作笔记。部分论断可能不完整、过时或依赖特定版本，请结合原始论文、官方文档及实际源码独立核验。
```

### Practical/safety variant

Use for the 11 Phi Lab pages:

```markdown
> [!warning] 经验与安全说明
> 本文部分结论与命令来自笔者在特定软硬件版本、项目代码和实验环境中的个人实践，仅供学习与方案参考，不保证适用于其他环境，也不构成法律、专业或安全建议。执行前请核对官方文档、备份数据，并独立评估权限、设备与实验风险。
```

Add narrower warnings before destructive commands, credentials, system trust changes, Docker permissions, robot actuation, or repository-version-specific step ordering when required. Avoid duplicating the same generic card repeatedly inside one page.

## 6. Source-edit phase — basic corrections only

Before changing the Obsidian source:

1. Generate SHA-256 and file-size inventory for all 17 Markdown sources.
2. Record the current path of every source and inbound/outbound wikilink.
3. Prepare a per-file patch containing only approved basic fixes.
4. Request the required filesystem approval because the Obsidian vault is outside the website writable root.

Apply and log only:

- clear spelling and duplicated-word corrections;
- missing punctuation or unclosed parentheses;
- broken Markdown list/fence/language formatting;
- `_init_.py` to `__init__.py`, including the filename and its inbound link;
- unambiguously invalid command spelling/separators/flags that do not alter the intended strategy;
- approved hand-eye pose-sampling clarification, if applied to source only after confirming it is covered by the user's option B;
- no redaction, warning card, experiment-number deletion, site title, or site metadata in the source unless separately approved.

After source edits, regenerate hashes and produce a source-only diff report. Any unclassified semantic change is a blocker.

## 7. Conversion and staging phase

Do not run the existing converters blindly or in place.

1. Build a manifest containing source path/hash, final destination, title, section, publish/skip state, referenced notes/assets, approved edits, protected spans, and redaction profile.
2. Build a vault-wide note and asset index before converting links.
3. Copy the approved sources to an isolated staging directory.
4. Apply site-only higher-order edits, warning cards, redactions, metadata, and title changes to staged copies.
5. Convert Obsidian wikilinks, heading/block links, image embeds, dimensions, highlights, and callouts without touching code fences, inline code, front matter, HTML comments, or math.
6. Treat ambiguous note/image names, unresolved links, destination collisions, or unsupported anchors as hard failures.
7. Use the site's real MkDocs anchor behavior or explicit stable anchors; do not rely on simplified custom Chinese slug guesses.
8. Preserve image bytes and dimensions unless a derived redacted copy is required. Record source hash and published hash/derivation.
9. Do not copy `.DS_Store`, the unreferenced `Pasted image 20260630002548.png`, environment exports, source-vault duplicates, or unused attachments.
10. A second dry run against staged output must be idempotent with zero unexplained diff.

Historical expectation: 16 published pages and 27 referenced unique images. Recompute these values at execution time; the manifest, not this historical count, is authoritative.

## 8. Site integration

- Add the 5 ENotes pages to `ENotes > Embodied AI` in `mkdocs.yml`.
- Add `Phi Lab` under `More Experiences`, after `TECH` and before `年终总结`.
- Under Phi Lab, list the two root pages, then `Diffusion Policy` and `WBC` subgroups.
- Remove `Coming soon` from the Phi Lab card in `docs/经验分享/index.md` and add a working entry link. Choose the final landing article only after the staged pages are reviewed; do not hardcode an arbitrary first page in advance.
- Add Phi Lab Archive categorization in `hooks/archive.py` before the generic Experiences branch so the 11 pages display `Phi Lab` without changing their bodies.
- Do not change `docs/stylesheets/extra.css`.
- Expect no JS/CSS change. If a real regression appears, use a narrow rule in `docs/stylesheets/edwinos-overrides.css` or the existing runtime layer, following EdwinOS governance.
- Existing search scope should include both roots automatically; verify rather than modify unless evidence shows otherwise.

## 9. Dry-run release gates

Before materializing into `docs/`, present a review package containing:

- source → destination manifest;
- per-file source basic-fix diff;
- per-file staged publishing diff classified as conversion, approved higher-order edit, warning, redaction, metadata, or link repair;
- image source → destination map with sensitive-image previews;
- navigation and Introduction preview;
- unresolved/ambiguous link report;
- sensitive-field scan summary that never prints credential values.

Do not apply staged content when any of the following is non-zero:

- unresolved/ambiguous note or image;
- missing referenced asset or block/heading anchor;
- destination collision or silent overwrite;
- unapproved semantic diff;
- original credential, real infrastructure identifier, private repository identity, W&B run URL, or disallowed experiment result remaining in text or image;
- unreviewed sensitive screenshot;
- invalid shell syntax introduced by placeholder conversion.

## 10. Verification after materialization

1. Source integrity: verify the source diff contains only the approved basic fixes and explicitly approved source clarification.
2. Content accounting: 16 unique published pages; the empty note absent everywhere.
3. Asset accounting: every referenced image exists and renders; no unreferenced/original sensitive attachment accidentally copied.
4. Link verification: all cross-page, heading, and block links work, including the two-way global steps/epoch link and ENotes ↔ Phi Lab links.
5. Syntax verification: callouts, highlights, math, tables, nested lists, code fences, image widths, Unicode paths, and long commands render correctly.
6. Static command checks: run language-appropriate syntax/static lint only; never execute note commands.
7. Security scan: scan text and built HTML for credentials, IPv4/host identities, personal paths, private remotes, W&B run URLs, task/run/date/result identities, and secret-like patterns; inspect redacted images manually.
8. Build: `.venv/bin/mkdocs build --strict` must complete with zero warnings/errors.
9. Local preview: keep `http://127.0.0.1:8000/` serving the current working tree.
10. Browser QA: inspect all 16 articles, both Introduction pages, Archive, and search on desktop/mobile and light/dark themes; verify nested Phi Lab navigation, drawer return depth, TOC, code overflow, images, MathJax, and callouts.
11. Regression smoke: homepage and Friends header/profile first screen must not shift.
12. Archive: exactly 5 new Embodied AI cards and 11 new Phi Lab cards; no empty-note card.
13. Search: representative terms such as `global steps`, `手眼标定`, `Diffusion Policy`, `Sim2Sim`, and `WandB` must find the intended pages without exposing redacted values.
14. Idempotence: a repeat generation/dry run produces zero unexplained change.

## 11. Execution order and stop points

1. Freeze this outline and the user decision map.
2. Record credential rotation as a separate recommendation; do not wait for it before preparing fully generalized website copies.
3. Inventory/hashes/manifest.
4. Preview source-only basic-fix patch.
5. Apply approved basic fixes to Obsidian source with filesystem approval.
6. Rehash and audit the source diff.
7. Build the converter/orchestrator safeguards and tests.
8. Generate isolated staged publishing copies.
9. Apply approved site-only higher-order edits, warnings, redactions, metadata, and link conversion.
10. Review staged text diffs and sensitive-image derivatives.
11. Materialize into website files and update nav/Introduction/Archive.
12. Run security, link, strict-build, browser, and regression QA.
13. Deliver the local preview and complete diff report for user review.
14. Stop. Do not commit, push, or deploy until separately authorized.
