---
title: "【组会分享】RFM/调参"
hide:
  - toc
---

> [!abstract] 组会分享
> 本页展示笔者于 2026 年 7 月 25 日进行的组会分享，内容围绕 Tron1 全身控制策略的训练、部署与实际调参经验展开。

本页从仓库结构、训练部署链路与实际调参经验出发，复盘 RFM 的工程实现。若希望进一步理解奖励函数、阶段门控与奖励融合机制，可对照阅读 [【MDP】奖励函数解构学习](%E3%80%90MDP%E3%80%91%E5%A5%96%E5%8A%B1%E5%87%BD%E6%95%B0%E8%A7%A3%E6%9E%84%E5%AD%A6%E4%B9%A0.md)；后者从公式与代码层面对关键 reward terms 及其组合逻辑进行拆解。两篇笔记分别对应工程实践与机制分析，可以结合阅读。

> [!warning] 阅读说明
> PDF 中的实验设置、参数与结论对应当时使用的特定代码、硬件和实验环境，仅作为研究过程记录与经验参考。复现实验前请结合当前仓库版本和设备状态独立核验。

<div class="pdf-viewer-shell" data-pdf-viewer>
  <div class="pdf-viewer-loading" role="status" aria-live="polite">
    <img
      class="pdf-viewer-preview off-glb"
      src="/assets/documents/rfm-practical-tuning-meeting-share-preview.webp"
      alt=""
      width="1600"
      height="900"
      decoding="async"
      fetchpriority="high"
      aria-hidden="true"
    >
    <span class="pdf-viewer-loading-status">
      <span class="pdf-viewer-spinner" aria-hidden="true"></span>
      正在载入可滑动的 PDF…
    </span>
  </div>
  <iframe
    class="pdf-viewer-frame"
    src="/assets/documents/rfm-practical-tuning-meeting-share.pdf?v=20260809a#page=1&amp;view=FitH&amp;navpanes=0"
    title="【组会分享】RFM/调参 PDF"
    width="100%"
    height="720"
    loading="eager"
    fetchpriority="high"
    onload="this.closest('[data-pdf-viewer]').classList.add('is-pdf-ready')"
  ></iframe>
</div>

<div class="pdf-viewer-actions">
  <a href="/assets/documents/rfm-practical-tuning-meeting-share.pdf?v=20260809a" target="_blank" rel="noopener">在新窗口中打开 PDF</a>
  <span aria-hidden="true"> · </span>
  <a href="/assets/documents/rfm-practical-tuning-meeting-share.pdf?v=20260809a" download>下载 PDF</a>
</div>

若浏览器没有显示内嵌阅读器，请使用上方的“在新窗口中打开 PDF”或“下载 PDF”。
