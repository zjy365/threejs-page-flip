import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PaperBook } from '../src/book.js';

// Run the real animation/frame path with only GPU rendering stubbed out.
// A lower sheet must never overtake the settled sheet above it, otherwise
// its different printed page covers the new page and later disappears.
function fixture() {
  const book = Object.create(PaperBook.prototype);
  Object.assign(book, {
    stage: { dataset: {} }, count: 14, page: 7, curl: 0.83, speed: 1,
    animations: new Map(), dirty: true, group: new THREE.Group(),
    renderer: { shadowMap: {}, render() {} },
    sheets: Array.from({ length: 14 }, (_, i) => ({
      mesh: new THREE.Mesh(),
      uniforms: {
        uProgress: {}, uDirection: {}, uBend: {}, uLift: {},
        uCurl: { value: new THREE.Vector2() }, uFold: { value: new THREE.Vector2() },
        uRotation: { value: new THREE.Vector2() },
      },
      progress: i < 7 ? 1 : 0,
      angle: 0, angleTarget: 0, arc: 0, arcTarget: 0,
      direction: 1, directionTarget: 1,
    })),
  });
  return book;
}

function assertStack(book, elapsed) {
  // Settled left pile, including the sheet currently landing on it.
  for (let i = 0; i + 1 < book.page; i++) {
    assert.ok(book.sheets[i].progress + 1e-8 >= book.sheets[i + 1].progress,
      `Left page overwritten at ${elapsed.toFixed(1)}ms: lower sheet ${i}=${book.sheets[i].progress}, upper ${i + 1}=${book.sheets[i + 1].progress}`);
  }
  // Same physical ordering for right pile when turning backwards.
  for (let i = book.page; i + 1 < book.count; i++) {
    assert.ok(book.sheets[i].progress + 1e-8 >= book.sheets[i + 1].progress,
      `Right page overwritten at ${elapsed.toFixed(1)}ms: upper sheet ${i}=${book.sheets[i].progress}, lower ${i + 1}=${book.sheets[i + 1].progress}`);
  }
}

for (const direction of [1, -1]) {
  test(`${direction > 0 ? 'forward' : 'backward'} turn keeps the landing page above the old print`, () => {
    const book = fixture();
    book.turn(direction);
    const start = [...book.animations.values()][0].start;
    for (let elapsed = 0; elapsed <= 2500; elapsed += 1000 / 60) {
      book.frame(start + elapsed);
      assertStack(book, elapsed);
    }
    assert.equal(book.sheets[direction > 0 ? 7 : 6].progress, direction > 0 ? 1 : 0);
  });

  test(`${direction > 0 ? 'forward' : 'backward'} consecutive turns keep old hover and print underneath`, () => {
    const book = fixture();
    book.hover = direction > 0 ? book.page : book.page - 1;
    book.turn(direction);
    const start = [...book.animations.values()][0].start;
    assert.equal(book.hover, null, 'A hover must not follow a page into the other pile');
    let secondTurn = false;
    for (let elapsed = 0; elapsed <= 3000; elapsed += 1000 / 60) {
      if (!secondTurn && elapsed >= 250) {
        book.turn(direction);
        const index = direction > 0 ? 8 : 5;
        book.animations.get(index).start = start + elapsed;
        secondTurn = true;
      }
      book.frame(start + elapsed);
      assertStack(book, elapsed);
    }
  });
}
