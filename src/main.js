import * as THREE from 'three';
import { PaperBook } from './book.js';
import './style.css';

const $ = id => document.getElementById(id);
let book;
let autoTimer;
let automatic = false;
const textures = [];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function stopAuto() {
  automatic = false;
  clearTimeout(autoTimer);
  $('auto').setAttribute('aria-pressed', 'false');
  $('auto').innerHTML = 'Autoplay <span>▷</span>';
}

function play() {
  if (!automatic || !book) return;
  if (book.page === book.count) book.reset();
  book.turn(1);
  autoTimer = setTimeout(play, 1700 / book.speed);
}

function setPage(page, count) {
  $('pages').textContent = page === 0 ? 'Cover / 01' : page === count ? `${count * 2} / Back cover` : `${String(page * 2).padStart(2, '0')} — ${String(page * 2 + 1).padStart(2, '0')}`;
  $('prev').disabled = page === 0;
  $('next').disabled = page === count;
}

async function init() {
  try {
    const loader = new THREE.TextureLoader();
    let loaded = 0;
    // Limit concurrent image decoding; all assets are local after installation.
    let next = 0;
    async function worker() {
      while (next < 28) {
        const i = next++;
        const texture = await loader.loadAsync(`/assets/page-${String(i + 1).padStart(2, '0')}.png`);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        textures[i] = texture;
        $('loaded').textContent = `${++loaded} / 28`;
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker));
    book = new PaperBook($('stage'), textures, setPage);
    book.onManual = stopAuto;
    if (reducedMotion.matches) { book.speed = 2; $('speed').value = '2'; }
    $('loading').hidden = true;
    $('stage').dataset.state = 'ready';
    $('prev').addEventListener('click', () => { stopAuto(); book.turn(-1); });
    $('next').addEventListener('click', () => { stopAuto(); book.turn(1); });
    $('reset').addEventListener('click', () => { stopAuto(); book.reset(); });
    $('auto').addEventListener('click', () => {
      if (automatic) return stopAuto();
      automatic = true;
      $('auto').setAttribute('aria-pressed', 'true');
      $('auto').innerHTML = 'Pause <span>Ⅱ</span>';
      play();
    });
    $('curl').addEventListener('input', e => { book.curl = Number(e.target.value); book.sheets.forEach(s => s.arcTarget = book.curl); book.dirty = true; });
    $('speed').addEventListener('input', e => book.speed = Number(e.target.value));
    $('wireframe').addEventListener('change', e => book.setWireframe(e.target.checked));
    $('settings').addEventListener('click', () => {
      $('tuning').hidden = !$('tuning').hidden;
      $('settings').setAttribute('aria-expanded', String(!$('tuning').hidden));
    });
    window.addEventListener('keydown', e => {
      if (e.target.matches('input') || !['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) return;
      e.preventDefault(); stopAuto();
      if (e.key === 'Home') book.reset();
      else book.turn(e.key === 'ArrowRight' ? 1 : -1);
    });
    document.addEventListener('visibilitychange', () => {
      clearTimeout(autoTimer);
      if (!document.hidden && automatic) autoTimer = setTimeout(play, 1000);
    });
  } catch (error) {
    console.error(error);
    $('loading').hidden = true;
    $('error').hidden = false;
    $('error').textContent = `Unable to load the demo: ${error.message}. Please use a browser with WebGL 2 support and enable hardware acceleration.`;
    $('stage').dataset.state = 'error';
  }
}

init();
if (import.meta.hot) import.meta.hot.dispose(() => {
  stopAuto(); book?.dispose(); textures.forEach(texture => texture.dispose());
});
