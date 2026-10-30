---
title: "Chen Jing (经宸) · Notes & Experiments"
hide:
  - toc
  - navigation
  - title
archive: false
description: "Notes on robotics, embodied AI, coursework, and practical experiments by Chen Jing (经宸)."
---

<div class="blog-home" lang="en">
  <section class="blog-home-hero" aria-labelledby="blog-home-title">
    <div class="blog-home-intro">
      <h1 id="blog-home-title">Notes from the lab,<br>and the work between.</h1>
      <p class="blog-home-author">Chen Jing <span lang="zh">(经宸)</span> · Working notebook</p>
      <p>I’m Chen Jing. This notebook follows my work in robotics: coordinate transforms, simulation checks, reward tuning—and the tools I use along the way.</p>
      <nav class="blog-home-actions" aria-label="Explore the notebook">
        <a class="blog-home-action edwinos-glass" href="OsdNotes/">Browse the notes</a>
        <a href="%E7%BB%8F%E9%AA%8C%E5%88%86%E4%BA%AB/">Lab notes &amp; experience</a>
      </nav>
    </div>
    <figure class="blog-home-feature">
      <div class="blog-home-feature__media">
        <video data-blog-home-video data-src="assets/media/blog-home-robot.mp4" poster="assets/images/blog-home-robot.webp" muted loop playsinline preload="metadata" width="480" height="854" aria-label="Autonomous robot demonstration, source footage at five times speed"></video>
      </div>
      <figcaption>
        <span class="blog-home-feature__caption"><span data-blog-home-caption>Autonomous rollout</span><span data-blog-home-speed>Source footage · 5× speed</span></span>
        <button class="edwinos-glass" type="button" data-blog-home-play aria-label="Play robot preview" aria-pressed="false">Play preview</button>
      </figcaption>
      <div class="blog-home-clips" role="group" aria-label="Choose a robot demonstration" hidden>
        <button class="edwinos-glass" type="button" data-blog-home-clip data-src="assets/media/blog-home-robot.mp4" data-poster="assets/images/blog-home-robot.webp" data-caption="Autonomous rollout" data-speed="Source footage · 5× speed" aria-pressed="true">Rollout</button>
        <button class="edwinos-glass" type="button" data-blog-home-clip data-src="assets/media/blog-home-board.mp4" data-poster="assets/images/blog-home-board.webp" data-caption="Board wiping" data-speed="Lab footage · original speed" aria-pressed="false">Board</button>
        <button class="edwinos-glass" type="button" data-blog-home-clip data-src="assets/media/blog-home-banana.mp4" data-poster="assets/images/blog-home-banana.webp" data-caption="Banana grasp" data-speed="Lab footage · original speed" aria-pressed="false">Banana</button>
      </div>
      <noscript><a href="assets/media/blog-home-robot.mp4">Watch the robot demonstration</a></noscript>
    </figure>
  </section>

  <section class="blog-home-section" aria-labelledby="recent-updates">
    <div class="blog-home-section-heading">
      <h2 class="section-title" id="recent-updates"><span class="title-dash"></span>Recent Updates</h2>
      <a class="edwinos-glass blog-home-archive" href="HOME/Archive/">View archive</a>
    </div>
    <!-- BLOG_HOME_UPDATES -->
  </section>

  <section class="blog-home-section" aria-labelledby="start-here">
    <div class="blog-home-section-heading">
      <h2 class="section-title" id="start-here"><span class="title-dash"></span>Start Here</h2>

    </div>
    <div class="blog-home-cards">
      <a class="blog-home-card edwinos-glass" href="OsdNotes/Embodied%20AI/%E3%80%90Hand-Eye%20Calibration%E3%80%91%20%E6%89%8B%E7%9C%BC%E6%A0%87%E5%AE%9A%E7%90%86%E8%AE%BA%E4%B8%8E%E5%AE%9E%E8%B7%B5/">
        <h3>Connecting camera and robot</h3>
        <p>Follow the coordinate frames, solve AX = XB, and check what a calibration actually tells you.</p>
      </a>
      <a class="blog-home-card edwinos-glass" href="%E7%BB%8F%E9%AA%8C%E5%88%86%E4%BA%AB/Phi%20Lab/WBC/Sim2Sim%E9%85%8D%E7%BD%AE%E4%B8%8E%E8%AE%AD%E7%BB%83/">
        <h3>From Isaac Lab to MuJoCo</h3>
        <p>ONNX exports, joint order, and deployment checks for a policy running in a second simulator.</p>
      </a>
      <a class="blog-home-card edwinos-glass" href="OsdNotes/Github%E5%AD%A6%E4%B9%A0%E7%AC%94%E8%AE%B0/Git%20with%20gh/">
        <h3>Git, without losing the thread</h3>
        <p>Branches, forks, and pull requests: a reference for everyday collaboration.</p>
      </a>
    </div>
  </section>


<footer class="visitor-meta-footer" data-visitor-deployment data-deployment-repository="SPIRAL-EDWIN/edwinjing-blog-website" data-deployment-workflow="deploy.yml">
      <div class="visitor-meta-footer__metadata">
        <p class="visitor-meta-footer__license">Content licensed under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a></p>
        <p class="visitor-meta-footer__signature">
          <span>&copy; Chen Jing</span>
          <span class="visitor-meta-footer__separator" aria-hidden="true">&middot;</span>
          <time class="visitor-meta-footer__updated" data-visitor-deployment-time datetime="2026-10">Latest updated Oct. 2026</time>
        </p>
      </div>
      <div class="visitor-container visitor-badge-panel" data-visitor-badge>
        <a class="visitor-badge-link" href="https://visitorbadge.io/status?path=https%3A%2F%2Fedwinjing-blog.com%2F" target="_blank" rel="noopener noreferrer" aria-label="Open Edwin's visitor statistics in a new tab">
          <img class="visitor-badge-image" src="https://api.visitorbadge.io/api/combined?path=https%3A%2F%2Fedwinjing-blog.com%2F&amp;label=Edwin%27s%20VISITORS&amp;labelColor=%232ccce4&amp;countColor=%23003f88" alt="Edwin's visitors" loading="lazy" fetchpriority="low" decoding="async" referrerpolicy="no-referrer">
        </a>
      </div>
    </footer>
</div>
