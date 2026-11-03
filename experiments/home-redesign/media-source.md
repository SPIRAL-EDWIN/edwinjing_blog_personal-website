# Robot clip provenance

## v3.9 quilt

Edwin selected these four sources from the previously authorized Drive folder.
The original files and contact sheets remain outside the site, under
`/Users/edwin/Documents/edwinos-design-research-20261029/media-v39-contact/`
(the board original is under the adjacent `media/` directory). The two simulation
files and the two real-world files use neutral labels; project affiliation is
not asserted. All four segments play at original speed.

| Source (Drive ID) | Segment | Visible content | Crop and focus |
|---|---|---|---|
| `simulation/z_workspace` (`15zCK_Wol3coFrxbwkdeHKQxCXTWgx8Tc`) | 4–12 s | A simulated bipedal robot and arm in a checkerboard environment | Centered 4:5; output focus 0.5, 0.5 |
| `simulation/orientation` (`1AExkZ5nRgSevARnNlTt4kb-XCmMBQbLp`) | 2–10 s | A simulated bipedal robot and articulated arm in a checkerboard environment | Centered 4:5; output focus 0.5, 0.5 |
| `z轴高度放置东西视频/lower` (`1BjooE6cIs9-hMbp07xGQk_sRYqIMHoJs`) | 53–61 s | A real robot holds a green object near a shelving unit | Centered 4:5; output focus 0.5, 0.5 |
| `Clean board/IMG_8889.MOV` (`1Jr9IlRTxD0ixRjBdmEynUZy4CyO2-zCV`) | 8–16 s | A real robot moves an eraser against a whiteboard | Centered 4:5; output focus 0.5, 0.5 |

Originals are never overwritten. The portrait derivatives are 640×800,
24 fps, H.264 CRF 28, no audio, faststart, stripped metadata and BT.709;
the HDR iPhone inputs use linear-light zscale and Hable tonemapping. Each
poster is derived from the encoded clip's first frame. First, middle and last
frames were inspected for framing. Source and derivative contact sheets are
private working files and are not published.

| Derivative | Bytes | SHA-256 |
|---|---:|---|
| `home-clip-z-workspace.mp4` | 205981 | `08478f0d5c52dba6f6d381139374aed1c805d0301e75c936a1c9dcaf90c3dfb7` |
| `home-clip-z-workspace.webp` | 22682 | `bd7de016f0ed787ac7e7ddc06bbd05510b3624d0893fec02de3a23a3036ce652` |
| `home-clip-orientation.mp4` | 143166 | `fae91c7fd3defb36fb37f6ce75b9f14621bdc8aa58a803762692ad78729dcdd0` |
| `home-clip-orientation.webp` | 21626 | `49717050b2c6650159f387fcd2b1119156a71a97b361780313d74f15bb8e86c8` |
| `home-clip-lower.mp4` | 199810 | `47d2279735074396e608d858edf095cbae4abb30c1c7bade24afdb59b19da645` |
| `home-clip-lower.webp` | 33228 | `0adb8739bbefca6067a80226be3a5e43c71f0baa4c21f5f998180a3809877fe6` |
| `home-clip-board.mp4` | 234561 | `980eedaaaa205543139f519a2bc0c0af63bfc05ebb825027598a5fff179ea633` |
| `home-clip-board.webp` | 33658 | `16e2147c665f119ba832f02caab6a32d3636167eb3cd8a94b74fc8589c524746` |

## Earlier hero clips

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
