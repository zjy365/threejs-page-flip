# Three.js Page Flip

An interactive Three.js book with realistic page curls, double-sided printing, dynamic shadows, and drag-to-turn interaction. Inspired by the magazine on [Paper Mono](https://paper.design/mono).

[Live demo](https://pageflip.zjy365.dev/)

The demo runs independently of the original website. Its scene, controls, animation state, and paper material live in `src/`. This is an unofficial recreation, not the original site's source code or an official Paper project.

## Getting started

Install Node.js 22.12+ (or a newer LTS release), then run:

```sh
git clone https://github.com/zjy365/threejs-page-flip.git
cd threejs-page-flip
npm ci
npm run dev
```

Open the local URL printed by Vite, usually [http://127.0.0.1:5173](http://127.0.0.1:5173).

To build and preview the production version:

```sh
npm run build
npm run preview
```

To run the animation regression tests:

```sh
npm test
```

## Deploying to Cloudflare

The live demo is hosted with Cloudflare Workers Static Assets. `wrangler.jsonc` serves the production build and binds the custom domain.

To deploy your own copy, change the Worker `name` and the `routes` hostname in `wrangler.jsonc` to a domain in your Cloudflare account. Alternatively, remove `routes` and set `workers_dev` to `true` to use a Cloudflare-provided hostname. Then run:

```sh
npx wrangler login
npm run deploy
```

This deploys the build directly; pushes to GitHub do not automatically deploy it. Custom domains use Cloudflare-managed DNS and HTTPS certificates.

## Controls

- Drag the right page to the left to move forward; drag the left page to the right to go back.
- Click a page to turn it. Hold down to flip through several pages.
- Hover over a page to lift it slightly. The upper and lower corners produce different fold directions.
- Release a short drag to return to the same page. Pull farther to complete the turn.
- Use the left and right arrow keys to turn pages, or Home to restore the opening spread.
- Use Autoplay, or open Settings to adjust page curl, turn speed, and wireframe rendering.

## How it works

Each sheet is a subdivided plane. A vertex shader bends it along a cylindrical arc in a rotated fold coordinate system, then rotates it around the spine. Finite differences calculate the deformed normals, and a matching depth shader keeps the shadows aligned with the paper.

Front and back textures stay attached to the same sheet throughout a turn. Resting sheets remain in their pile so an old printed page cannot pass through a newly landed page. Release animations carry the drag velocity into a smooth landing.

This is an analytical surface model, rather than a physics simulation. The same two-page model scales to narrow screens; the original website's separate mobile cone-curl model is not implemented here.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/book.js` | Scene, paper stack, pointer interaction, and turn animations |
| `src/paper-material.js` | Surface deformation, normals, double-sided printing, and shadow deformation |
| `src/main.js` | Texture loading and interface controls |
| `src/style.css` | Responsive layout and styling |
| `tests/page-stack.test.js` | Forward, backward, and consecutive-turn stack regression tests |
| `reference/NOTES.md` | Implementation observations and scope |
| `reference/assets.json` | Source paths for the reference artwork |
| `wrangler.jsonc` | Cloudflare static asset deployment and custom domain configuration |

## Using your own images

Replace `public/assets/page-01.png` through `page-28.png` with images you own or have permission to use. The current demo uses 28 printed sides across 14 sheets; it does not yet support a configurable page count or an upload interface. Portrait images with an aspect ratio near 1 : 1.377 fit the pages best. Crop your images to that ratio before replacing the files to avoid stretching.

## Validation

The production build and four animation regression tests pass. The demo has also been checked in a browser for dragging, click-to-turn, continuous flipping, cover boundaries, reset, wireframe rendering, autoplay, and a 390-pixel-wide layout.

The tests cover a landing regression in which an old page rose through its replacement, making the new image appear to redraw. They run the real animation frame path with only GPU rendering stubbed out.

## Credits and third-party material

Visual inspiration: [Paper Mono by Paper](https://paper.design/mono). Rendering: [Three.js](https://threejs.org/). Development and build tooling: [Vite](https://vite.dev/).

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the provenance of the reference artwork and locally saved website scripts. These materials are not assigned an open-source license by this project.

## License

The project's authored code is available under the [MIT License](LICENSE). The license excludes the Paper Mono page artwork in `public/assets/` and third-party materials. No redistribution license for the reference images has been verified; use your own images for redistribution unless you have permission from their rights holders.
