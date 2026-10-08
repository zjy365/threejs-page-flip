# Reference implementation notes

Observed on October 8, 2026: [Paper Mono](https://paper.design/mono).

## Observed implementation

The website dynamically loads a Three.js magazine scene. The publicly served JavaScript bundles can be inspected through their script URLs. That access does not establish an open-source license for the website or its artwork.

The observed desktop effect was served in [1i4-vcdxd9wyu.js](https://paper.design/mono/_next/static/chunks/1i4-vcdxd9wyu.js); the mobile effect was served in [2nugie3hvt1bv.js](https://paper.design/mono/_next/static/chunks/2nugie3hvt1bv.js). These deployment-specific URLs may change. Locally downloaded copies were used for inspection and are excluded from Git.

Key observations from the desktop version:

- Sheet aspect ratio: 1 : 1.377, with roughly 64 × 88 subdivisions.
- 28 printed sides form 14 sheets; the opening spread is pages 14–15.
- A cylindrical curl is calculated in rotated fold coordinates, followed by a 0–π spine rotation.
- Pointer position affects the fold axis. Curvature peaks during a turn and approaches zero on landing.
- Finite differences recalculate deformed normals. A matching depth material deforms the shadow surface.
- Separate textures represent each printed side, with subtle show-through and paper grain.
- Drag progress is smoothed. Release preserves velocity, and holding triggers successive turns.
- Idle frames avoid repeated shadow rendering, and hidden scenes stop their animation loop.

The original mobile version uses a separate conical curl that wraps a whole sheet around the spine.

## Scope of this demo

This demo recreates the desktop two-page interaction using its own scene and controls: cylindrical surface deformation, pointer-dependent folds, double-sided pages, paper stacking, velocity-aware release, and matching shadows.

Narrow screens use the same two-page model scaled to the viewport. The original mobile cone model, GPU-baked noise, complete fiber texture, and texture-loading scheduler are not reproduced. This demo uses lightweight procedural grain and four concurrent local texture loads.

This is a working visual recreation, not a claim of pixel-for-pixel equivalence with the original website.

API details were checked against the [official Three.js documentation](https://threejs.org/docs/) through Context7, including BufferGeometry, MeshStandardMaterial, double-sided rendering, and deformed surface normals.
