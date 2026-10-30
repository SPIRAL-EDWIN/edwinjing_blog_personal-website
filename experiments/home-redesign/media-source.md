# Robot clip provenance

All clips derive from the Drive folder authorized by Edwin. Original files stay
outside the repo in `/Users/edwin/Documents/edwinos-design-research-20261029/media`.

- Rollout: `umi推理真机视频/Diffusion_01.mp4`, file ID `1YgFPTGdHU2FW8POPRgrhVlsd4RRdPW9H`; first 10s. Source already says autonomous/5X; retain its speed label.
- Board: `Clean board/IMG_8889.MOV`, file ID `1Jr9IlRTxD0ixRjBdmEynUZy4CyO2-zCV`; seconds 8–24. Contact sheet inspected to confirm wiping motion.
- Banana: `夹香蕉/IMG_8916.MOV`, file ID `17nZ2Hlc6RTBYQuHsRX-KJbI1r644rVls`; seconds 55–77. Contact sheet inspected to choose the grasp/lift segment.

Derivatives: portrait 480×854, 24fps, H.264 CRF28, faststart, no audio.
Board/banana retain original playback speed; HDR converted to SDR BT.709 using
linear-light zscale and Hable tonemapping. No crop of the robot; frame ratio stays
portrait. Original capture metadata, including location, is stripped. Posters
are local WebP frames. No external media dependency is present at runtime.

| Clip | Bytes | SHA-256 |
|---|---:|---|
| robot | 224,841 | `f0ba1465c3a2a11a619b9d0ed83fd1d0c4872ccfca296d0d2017e2c742fa5230` |
| board | 426,488 | `9930e321a0fe836c9e7e571fdc013e123b75e3ea549e8b54552218a93a8ac77c` |
| banana | 367,111 | `ad0159b0df4d856163209410c3015df2a1d3073b50bba1f719e708c6ee96bb5d` |
