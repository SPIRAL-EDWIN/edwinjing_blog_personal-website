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
    </div>
    <!-- BLOG_HOME_COLLECTIONS -->
  </section>

  <section class="blog-home-lab" aria-labelledby="projects-ideas">
    <div class="blog-home-lab__intro">
      <h2 class="section-title" id="projects-ideas"><span class="title-dash"></span>Projects &amp; Ideas</h2>
      <p>BipedalWBC, a project I contributed to: one learned controller turns a single 6-DoF end-effector target into coordinated arm and leg motion on a bipedal manipulator.</p>
    </div>
    <figure class="project-figure" data-project-figure="bipedalwbc" aria-labelledby="bwbc-figure-title" aria-describedby="bwbc-figure-caption">
      <div class="project-figure__header"><h3 id="bwbc-figure-title">BipedalWBC framework</h3><span class="project-figure__links"><a href="https://wholebodyrobotics.github.io/BipedalWBC/" target="_blank" rel="noopener">Project page ↗</a><a href="https://arxiv.org/abs/2609.18930" target="_blank" rel="noopener">arXiv ↗</a></span></div>
      <!-- PROJECT_FIGURE:bipedalwbc -->
      <figcaption id="bwbc-figure-caption">Adapted from Fig. 2 of Chen, Nai et al., <cite>Learning Holistic Whole-Body Loco-Manipulation with a Bipedal Mobile Manipulator</cite> (2026); Chen Jing is a co-author.</figcaption>
    </figure>
    <section class="blog-home-clips" aria-labelledby="home-clips-title" data-home-clips>
      <div class="blog-home-clips__heading"><h3 id="home-clips-title">In motion</h3><p>Simulation and lab footage · muted loops</p><button type="button" class="edwinos-glass" data-home-clips-toggle aria-pressed="false" hidden><span data-home-clips-toggle-label>Pause clips</span></button></div>
      <ul class="blog-home-clips__grid">
      <li><figure class="home-clip" data-home-clip data-src="assets/media/home-clip-z-workspace.mp4" data-focus="0.5,0.5" style="--ground:var(--home-clip-ground-1)" tabindex="0" aria-label="Z workspace, simulation, original speed. Press space or enter to pause or play.">
        <div class="home-clip__media" style="background-image:url(data:image/webp;base64,UklGRmwAAABXRUJQVlA4IGAAAABQBACdASocACMAPwF0r1ErJyQiqqoBYCAJaQDKeBZnsNA8WWSMiqnrv7AAAP6ufk3o8GXVhawUJ/G6nZNoRIcXl5nD4/yar4rc4hdvSHlOdcA/0/TDTlO1UskvoklIAAA=)"><img class="home-clip__poster off-glb" src="assets/media/home-clip-z-workspace.webp" alt="" width="640" height="800" loading="lazy" decoding="async"><canvas aria-hidden="true"></canvas><img class="home-clip__clear off-glb" src="assets/media/home-clip-z-workspace.webp" alt="" width="640" height="800" loading="lazy" decoding="async"><video muted loop playsinline preload="none" aria-hidden="true" tabindex="-1"></video></div>
        <figcaption class="home-clip__chip"><span>Z workspace</span><span>Simulation · original speed</span></figcaption>
        <button class="home-clip__play" type="button" data-home-clip-play aria-label="Play Z workspace">Play clip</button><noscript><a class="home-clip__download" href="assets/media/home-clip-z-workspace.mp4">Open video</a></noscript></figure></li>
      <li><figure class="home-clip" data-home-clip data-src="assets/media/home-clip-orientation.mp4" data-focus="0.5,0.5" style="--ground:var(--home-clip-ground-2)" tabindex="0" aria-label="Orientation, simulation, original speed. Press space or enter to pause or play.">
        <div class="home-clip__media" style="background-image:url(data:image/webp;base64,UklGRmgAAABXRUJQVlA4IFwAAABwBACdASocACMAPu1gpk6ppaOiNUgBMB2JZwAAegBlZYXzeOcZJJr/lSkAAAD+rn6lucJeHJ8playd3L3Kas391iOf45MQ1eHPqZixteKM5unSmp4Yro4cN1QAAA==)"><img class="home-clip__poster off-glb" src="assets/media/home-clip-orientation.webp" alt="" width="640" height="800" loading="lazy" decoding="async"><canvas aria-hidden="true"></canvas><img class="home-clip__clear off-glb" src="assets/media/home-clip-orientation.webp" alt="" width="640" height="800" loading="lazy" decoding="async"><video muted loop playsinline preload="none" aria-hidden="true" tabindex="-1"></video></div>
        <figcaption class="home-clip__chip"><span>Orientation</span><span>Simulation · original speed</span></figcaption>
        <button class="home-clip__play" type="button" data-home-clip-play aria-label="Play Orientation">Play clip</button><noscript><a class="home-clip__download" href="assets/media/home-clip-orientation.mp4">Open video</a></noscript></figure></li>
      <li><figure class="home-clip" data-home-clip data-src="assets/media/home-clip-lower.mp4" data-focus="0.5,0.5" style="--ground:var(--home-clip-ground-3)" tabindex="0" aria-label="Lower placement, lab footage, original speed. Press space or enter to pause or play.">
        <div class="home-clip__media" style="background-image:url(data:image/webp;base64,UklGRuIAAABXRUJQVlA4INYAAAAwBgCdASocACMAPvlqqE6qpiOiNVgIAVAfCUAYmwG98A6oy7g/U5HUdE1TMNyJLOMhjXTJgMJ/lGAAAP5g54BPPRCJCcI2PQP2LPj5MEFcSyj6rEyyIOLYJSiQJORdNsZNlvI3sYDLe9TP9Ne7tjNiU8go74l7g/5HdQo1faQLBXEuD26JN4XNOZXLjpNWxHaAI+ONGFWqAnG0gQLh2uazbUn+YuK2WpR/wIP9Z7XKw1A0Sj+gKX5rP0POXeCjm1V76uM7h0xJz42sIsBUz6xzImGgAAAA)"><img class="home-clip__poster off-glb" src="assets/media/home-clip-lower.webp" alt="" width="640" height="800" loading="lazy" decoding="async"><canvas aria-hidden="true"></canvas><img class="home-clip__clear off-glb" src="assets/media/home-clip-lower.webp" alt="" width="640" height="800" loading="lazy" decoding="async"><video muted loop playsinline preload="none" aria-hidden="true" tabindex="-1"></video></div>
        <figcaption class="home-clip__chip"><span>Lower placement</span><span>Lab footage · original speed</span></figcaption>
        <button class="home-clip__play" type="button" data-home-clip-play aria-label="Play Lower placement">Play clip</button><noscript><a class="home-clip__download" href="assets/media/home-clip-lower.mp4">Open video</a></noscript></figure></li>
      <li><figure class="home-clip" data-home-clip data-src="assets/media/home-clip-board.mp4" data-focus="0.5,0.5" style="--ground:var(--home-clip-ground-4)" tabindex="0" aria-label="Board wiping, lab footage, original speed. Press space or enter to pause or play.">
        <div class="home-clip__media" style="background-image:url(data:image/webp;base64,UklGRsAAAABXRUJQVlA4ILQAAACQBgCdASocACMAPwFmrE8rJSQiMBqqqWAgCWUAygASQwDzNC5ULUCIexozaGvOHiA7gOLVHt0obNj7ufsAAPkIF1e0DokioIh6u8NGgamzTve1uDOnotqLUpvJHYCgdQzDQm67bG0xtFiiNk8JQqmOf00mo70iO/y86fvH5LWI9CrRTCWxQnFeWr2mO41NJg0IS33zPke6DPmgqndG50nlm8tL8XYcALI+XU37i+tdgmU8AAA=)"><img class="home-clip__poster off-glb" src="assets/media/home-clip-board.webp" alt="" width="640" height="800" loading="lazy" decoding="async"><canvas aria-hidden="true"></canvas><img class="home-clip__clear off-glb" src="assets/media/home-clip-board.webp" alt="" width="640" height="800" loading="lazy" decoding="async"><video muted loop playsinline preload="none" aria-hidden="true" tabindex="-1"></video></div>
        <figcaption class="home-clip__chip"><span>Board wiping</span><span>Lab footage · original speed</span></figcaption>
        <button class="home-clip__play" type="button" data-home-clip-play aria-label="Play Board wiping">Play clip</button><noscript><a class="home-clip__download" href="assets/media/home-clip-board.mp4">Open video</a></noscript></figure></li>
      </ul>
    </section>
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
        <div class="blog-home-card__preview research-figure__art" data-figure-preview="calibration" data-layout="calibration" aria-hidden="true"><svg class="research-figure__edges"></svg><span>Robot poses → Relative motion → Estimate</span></div>
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
