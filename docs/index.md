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
        <button class="edwinos-glass" type="button" data-blog-home-clip data-src="assets/media/blog-home-robot.mp4" data-poster="assets/images/blog-home-robot.webp" data-caption="Autonomous rollout" data-speed="Source footage · 5× speed" aria-pressed="true">Autonomous rollout</button>
        <button class="edwinos-glass" type="button" data-blog-home-clip data-src="assets/media/blog-home-board.mp4" data-poster="assets/images/blog-home-board.webp" data-caption="Board wiping" data-speed="Lab footage · original speed" aria-pressed="false">Board wiping</button>
        <button class="edwinos-glass" type="button" data-blog-home-clip data-src="assets/media/blog-home-banana.mp4" data-poster="assets/images/blog-home-banana.webp" data-caption="Banana grasp" data-speed="Lab footage · original speed" aria-pressed="false">Banana grasp</button>
      </div>
      <noscript><a href="assets/media/blog-home-robot.mp4">Watch the robot demonstration</a></noscript>
    </figure>
  </section>

  <section class="blog-home-lab" aria-labelledby="lab-paths">
    <div class="blog-home-lab__intro">
      <h2 class="section-title" id="lab-paths"><span class="title-dash"></span>Ideas in motion</h2>
      <p>Follow two ideas through the notebook: a transform inferred from measurements, and a policy checked in another simulator.</p>
    </div>
    <figure class="research-figure" data-figure="calibration">
      <div class="research-figure__header"><h3>Finding the camera in the robot’s frame</h3><a href="OsdNotes/Embodied%20AI/%E3%80%90Hand-Eye%20Calibration%E3%80%91%20%E6%89%8B%E7%9C%BC%E6%A0%87%E5%AE%9A%E7%90%86%E8%AE%BA%E4%B8%8E%E5%AE%9E%E8%B7%B5/">Explore the note →</a></div>
      <div class="research-figure__journey"><div class="research-figure__stage">
        <div class="research-figure__rail" aria-label="Calibration steps"><button type="button" data-step="0">Measurements</button><button type="button" data-step="1">Relative motion</button><button type="button" data-step="2">Solve</button><button type="button" data-step="3">Check</button></div>
        <div class="research-figure__art" aria-hidden="true"><svg viewBox="0 0 720 420" role="presentation"><defs><marker id="cal-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs><g class="research-figure__guides"><path d="M105 112 H273 M105 302 H273 M424 208 H568" marker-end="url(#cal-arrow)"/><path d="M274 112 L356 208 L274 302"/><circle cx="105" cy="112" r="6"/><circle cx="105" cy="302" r="6"/><circle cx="356" cy="208" r="9"/></g><g class="research-figure__glyphs"><path d="M38 158 V99 H95 M38 99 L59 78 M38 99 L18 84 M36 342 H103 V275 H36 Z M36 308 H103 M69 275 V342"/><path d="M566 247 H652 M580 265 H638 M594 282 H624"/></g></svg>
          <div class="research-figure__label research-figure__label--a"><small>ROBOT POSES</small><strong>End effector</strong><span>Measurements from the arm</span></div><div class="research-figure__label research-figure__label--b"><small>CAMERA OBSERVATIONS</small><strong>Calibration board</strong><span>Images at multiple poses</span></div><div class="research-figure__label research-figure__label--c"><small>RELATIVE MOTION</small><strong>A · X = X · B</strong><span>Two views of the same motion</span></div><div class="research-figure__label research-figure__label--d"><small>ESTIMATE</small><strong>Camera ↔ end effector</strong><span>Inspect the transform</span></div>
        </div>
        <div class="research-figure__explanation"><strong data-figure-title>Measurements</strong><p data-figure-copy>Record robot poses and observe the board from multiple positions.</p></div>
      </div></div>
      <ol class="research-figure__accessible"><li>Record robot poses and board observations at multiple positions.</li><li>Construct relative motions from pairs of poses.</li><li>Solve AX = XB for the fixed camera-to-end-effector transform.</li><li>Inspect the result; one relative motion is usually insufficient.</li></ol>
      <figcaption>Figure 1. Hand–eye calibration · Multiple poses constrain the fixed camera-to-end-effector transform.</figcaption>
    </figure>
    <figure class="research-figure" data-figure="simulation">
      <div class="research-figure__header"><h3>One policy, another simulator</h3><a href="%E7%BB%8F%E9%AA%8C%E5%88%86%E4%BA%AB/Phi%20Lab/WBC/Sim2Sim%E9%85%8D%E7%BD%AE%E4%B8%8E%E8%AE%AD%E7%BB%83/">Explore the note →</a></div>
      <div class="research-figure__journey"><div class="research-figure__stage">
        <div class="research-figure__rail" aria-label="Simulation steps"><button type="button" data-step="0">Train</button><button type="button" data-step="1">Export</button><button type="button" data-step="2">Validate</button><button type="button" data-step="3">Inspect</button></div>
        <div class="research-figure__art research-figure__art--sim" aria-hidden="true"><svg viewBox="0 0 720 420" role="presentation"><defs><marker id="sim-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs><g class="research-figure__guides"><path d="M145 134 C220 134 226 210 306 210 S390 286 474 286" marker-end="url(#sim-arrow)"/><path d="M474 286 C561 286 588 196 610 147" marker-end="url(#sim-arrow)"/><circle cx="145" cy="134" r="6"/><circle cx="306" cy="210" r="6"/><circle cx="474" cy="286" r="6"/></g><g class="research-figure__glyphs"><path d="M45 110 l35 -20 35 20 v40 l-35 20 -35 -20 Z M45 110 l35 20 35 -20 M80 130 v40 M540 314 v-35 m18 35 v-57 m18 57 v-22 m18 22 v-73 m18 73 v-43"/></g></svg>
          <div class="research-figure__label research-figure__label--a"><small>TRAINING</small><strong>Isaac Lab</strong><span>Learn the policy</span></div><div class="research-figure__label research-figure__label--b"><small>EXPORT</small><strong>ONNX</strong><span>Inference graphs</span></div><div class="research-figure__label research-figure__label--c"><small>CLOSED LOOP</small><strong>MuJoCo</strong><span>Run without updating parameters</span></div><div class="research-figure__label research-figure__label--d"><small>CHECKS</small><strong>Deployment chain</strong><span>Joint order · stability · errors</span></div>
        </div>
        <div class="research-figure__explanation"><strong data-figure-title>Train</strong><p data-figure-copy>Train the policy in Isaac Lab before testing it elsewhere.</p></div>
      </div></div>
      <ol class="research-figure__accessible"><li>Train a policy in Isaac Lab.</li><li>Export inference graphs to ONNX.</li><li>Run closed-loop validation in MuJoCo without updating parameters.</li><li>Check joint order, stability, errors and deployment consistency.</li></ol>
      <figcaption>Figure 2. Sim2Sim · Check the inference chain and behavior in a second simulator.</figcaption>
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
        <div class="blog-home-card__preview" aria-hidden="true">
          <svg viewBox="0 0 440 132" role="presentation">
            <defs><marker id="preview-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 Z" /></marker></defs>
            <g class="blog-home-card__preview-flow"><path d="M118 40 C157 40 155 66 192 66"/><path d="M118 92 C157 92 155 66 192 66"/><path d="M248 66 H314"/></g>
            <g class="blog-home-card__preview-nodes"><rect x="12" y="22" width="106" height="36" rx="8"/><rect x="12" y="74" width="106" height="36" rx="8"/><rect x="192" y="42" width="56" height="48" rx="10"/><rect x="314" y="42" width="114" height="48" rx="10"/></g>
            <g class="blog-home-card__preview-labels"><text x="65" y="44">ROBOT POSES</text><text x="65" y="96">BOARD VIEWS</text><text x="220" y="70">AX = XB</text><text x="371" y="65">CAMERA</text><text x="371" y="80">TRANSFORM</text></g>
          </svg>
        </div>
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
