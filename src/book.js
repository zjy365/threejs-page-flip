import * as THREE from 'three';
import { createPaperMaterial } from './paper-material.js';

const clamp = THREE.MathUtils.clamp;
const smooth = t => (t = clamp(t, 0, 1), t * t * (3 - 2 * t));
const damp = (a, b, dt, seconds) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-dt / seconds));

export class PaperBook {
  constructor(stage, textures, onChange) {
    this.stage = stage;
    this.onChange = onChange;
    this.count = Math.ceil(textures.length / 2);
    this.page = 7;
    this.curl = 0.83;
    this.speed = 1;
    this.animations = new Map();
    this.abort = new AbortController();
    this.dirty = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
    this.camera.position.set(0, 0, 3.1);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.canvas = this.renderer.domElement;
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', '3D magazine. Drag left or right to turn a page, or use the arrow keys.');
    stage.append(this.canvas);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9ca79b, 2.0));
    const light = new THREE.DirectionalLight(0xffffff, 2.6);
    light.position.set(-3.5, 1.3, 4.1);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, { left: -1.65, right: 1.65, top: 1.05, bottom: -1.05, near: 1, far: 8 });
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.001;
    light.shadow.radius = 3;
    this.scene.add(light);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.11 }));
    floor.position.z = -0.015;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.sheets = Array.from({ length: this.count }, (_, i) => {
      const { material, depth, uniforms } = createPaperMaterial(textures[i * 2], textures[i * 2 + 1] ?? textures[i * 2]);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.377, 64, 88), material);
      mesh.customDepthMaterial = depth;
      mesh.frustumCulled = false; // Vertex shader moves the page across the spine.
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return { mesh, uniforms, progress: i < this.page ? 1 : 0, angle: 0, angleTarget: 0, arc: 0, arcTarget: 0, direction: 1, directionTarget: 1 };
    });
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.hit = new THREE.Vector3();
    this.pointerNdc = new THREE.Vector2();
    this.bindPointer();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(stage);
    this.resize();
    this.visible = true;
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.updateLoop();
    });
    this.intersectionObserver.observe(stage);
    document.addEventListener('visibilitychange', () => this.updateLoop(), { signal: this.abort.signal });
    this.canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.renderer.setAnimationLoop(null);
      this.stopHold();
      this.gesture = null;
      stage.dataset.state = 'recovering';
    }, { signal: this.abort.signal });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.dirty = true;
      stage.dataset.state = 'ready';
      this.updateLoop();
    }, { signal: this.abort.signal });
    this.updateLoop();
    this.emit();
  }

  resize() {
    const { width, height } = this.stage.getBoundingClientRect();
    this.camera.aspect = width / height;
    this.viewHeight = Math.max(1.377 / 0.8, 2.3 / this.camera.aspect);
    this.camera.fov = 2 * Math.atan(this.viewHeight / 2 / 3.1) * 180 / Math.PI;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.dirty = true;
  }

  updateLoop() {
    this.previousTime = 0;
    this.dirty = true;
    this.renderer.setAnimationLoop(!document.hidden && this.visible && !this.renderer.getContext().isContextLost() ? time => this.frame(time) : null);
  }

  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerNdc.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.ray.setFromCamera(this.pointerNdc, this.camera);
    this.ray.ray.intersectPlane(this.plane, this.hit);
    return { x: this.hit.x - this.group.position.x, y: this.hit.y };
  }

  curve(sheet, point) {
    // Pulling the upper/lower corner changes the fold axis continuously.
    const angle = clamp(-Math.atan2(point.y, Math.abs(point.x) + 0.15) * 0.48, -0.68, 0.68);
    sheet.angleTarget = angle;
    sheet.arcTarget = this.curl * (0.94 + Math.abs(point.y) * 0.08);
  }

  bindPointer() {
    const listen = (type, handler, options = {}) => this.canvas.addEventListener(type, handler, { ...options, signal: this.abort.signal });
    listen('pointerdown', event => {
      if (event.button !== 0 || this.gesture) return;
      const point = this.point(event);
      if (Math.abs(point.x) > 1.08 || Math.abs(point.y) > 0.75) return;
      const forward = point.x >= 0;
      const index = forward ? this.page : this.page - 1;
      const sheet = this.sheets[index];
      if (!sheet) return;
      this.onManual?.();
      this.hover = null;
      this.animations.delete(index);
      this.curve(sheet, point);
      sheet.directionTarget = forward ? 1 : -1;
      this.gesture = { index, forward, startX: event.clientX, startY: event.clientY, base: sheet.progress, target: sheet.progress, moved: false, speed: 0, held: false, pointerId: event.pointerId };
      this.canvas.setPointerCapture(event.pointerId);
      this.holdTimer = setTimeout(() => this.repeatHold(), 230);
      this.dirty = true;
    });
    listen('pointermove', event => {
      const gesture = this.gesture;
      if (!gesture) {
        const point = this.point(event);
        const index = point.x >= 0 ? this.page : this.page - 1;
        this.hover = Math.abs(point.x) < 1.04 && Math.abs(point.y) < 0.71 && !this.animations.has(index) ? index : null;
        if (this.hover !== null && this.sheets[index]) this.curve(this.sheets[index], point);
        return;
      }
      if (gesture.pointerId !== event.pointerId) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (Math.hypot(dx, dy) > 6) {
        gesture.moved = true;
        this.stopHold();
      }
      if (gesture.held) return;
      const rect = this.canvas.getBoundingClientRect();
      const sheetPixels = rect.height / this.viewHeight;
      gesture.target = clamp(gesture.base - dx / (sheetPixels * 1.4), 0, 1);
      this.curve(this.sheets[gesture.index], this.point(event));
      this.dirty = true;
    });
    const release = event => {
      const gesture = this.gesture;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      this.stopHold();
      this.gesture = null;
      this.hover = null;
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      if (gesture.held) return;
      const sheet = this.sheets[gesture.index];
      const displacement = gesture.forward ? gesture.target - gesture.base : gesture.base - gesture.target;
      const launch = gesture.forward ? gesture.speed : -gesture.speed;
      const commit = event.type !== 'pointercancel' && (!gesture.moved || displacement > 0.18 || launch > 0.7);
      const target = commit ? Number(gesture.forward) : Number(!gesture.forward);
      if (commit) this.page += gesture.forward ? 1 : -1;
      this.animate(gesture.index, target, gesture.speed);
      this.emit();
    };
    listen('pointerup', release);
    listen('pointercancel', release);
    listen('pointerleave', () => { this.hover = null; });
    listen('lostpointercapture', () => {
      if (!this.gesture) return;
      const gesture = this.gesture;
      this.gesture = null;
      this.stopHold();
      if (!gesture.held) this.animate(gesture.index, Number(!gesture.forward), 0);
    });
  }

  repeatHold() {
    const gesture = this.gesture;
    if (!gesture || gesture.moved) return;
    gesture.held = true;
    this.turn(gesture.forward ? 1 : -1, true);
    if ((gesture.forward && this.page < this.count) || (!gesture.forward && this.page > 0)) {
      this.holdTimer = setTimeout(() => this.repeatHold(), Math.max(115, 240 / this.speed));
    }
  }

  stopHold() { clearTimeout(this.holdTimer); }

  animate(index, target, velocity = 0) {
    const sheet = this.sheets[index];
    const distance = Math.abs(target - sheet.progress);
    const duration = Math.max(0.22, 1.05 * Math.sqrt(distance)) / this.speed;
    // Cubic Hermite interpolation carries drag velocity into the release,
    // then reaches the exact landing position without an end-frame snap.
    const launch = distance < 0.001 ? 0 : clamp(velocity * duration / (target - sheet.progress), 0, 2.3);
    this.animations.set(index, { from: sheet.progress, to: target, start: performance.now(), duration: duration * 1000, launch });
    this.dirty = true;
  }

  turn(direction, holding = false) {
    if (this.gesture && !holding) return false;
    const forward = direction > 0;
    const index = forward ? this.page : this.page - 1;
    const sheet = this.sheets[index];
    if (!sheet) return false;
    this.hover = null;
    sheet.directionTarget = forward ? 1 : -1;
    if (!holding) this.curve(sheet, { x: 0.9, y: -0.25 });
    else this.curve(sheet, { x: 0.9, y: this.sheets[this.gesture.index].angleTarget * -1.5 });
    this.page += forward ? 1 : -1;
    this.animate(index, Number(forward));
    this.emit();
    return true;
  }

  reset() {
    this.stopHold();
    const pointer = this.gesture?.pointerId;
    this.gesture = null;
    if (pointer !== undefined && this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer);
    this.animations.clear();
    this.page = 7;
    this.hover = null;
    this.group.position.x = 0;
    this.sheets.forEach((s, i) => { s.progress = i < 7 ? 1 : 0; s.arc = s.arcTarget = 0; s.angle = s.angleTarget = 0; });
    this.dirty = true;
    this.emit();
  }

  emit() {
    this.stage.dataset.page = String(this.page);
    this.onChange?.(this.page, this.count);
  }

  frame(time) {
    const dt = this.previousTime ? Math.min((time - this.previousTime) / 1000, 0.05) : 1 / 60;
    this.previousTime = time;
    let moving = this.animations.size > 0 || Boolean(this.gesture);
    for (const [i, animation] of this.animations) {
      const t = clamp((time - animation.start) / animation.duration, 0, 1);
      const curve = (t ** 3 - 2 * t ** 2 + t) * animation.launch + smooth(t);
      this.sheets[i].progress = THREE.MathUtils.lerp(animation.from, animation.to, curve);
      if (t >= 1) { this.animations.delete(i); this.dirty = true; }
    }
    if (this.gesture && !this.gesture.held) {
      const sheet = this.sheets[this.gesture.index];
      const next = damp(sheet.progress, this.gesture.target, dt, 0.12);
      this.gesture.speed = (next - sheet.progress) / dt;
      sheet.progress = next;
    }
    for (let i = 0; i < this.count; i++) {
      const sheet = this.sheets[i];
      if (!this.animations.has(i) && this.gesture?.index !== i) {
        let rest = i < this.page ? 1 : 0;
        if (i === this.hover) rest += (i < this.page ? -1 : 1) * 0.025;
        // Keep resting sheets in their pile. Lifting the previous page while
        // its replacement lands lets the old print pierce the new surface.
        if (Math.abs(sheet.progress - rest) > 0.00005) { sheet.progress = damp(sheet.progress, rest, dt, 0.28); moving = true; }
        else sheet.progress = rest;
      }
      for (const [key, seconds] of [['angle', 0.09], ['arc', 0.1], ['direction', 0.13]]) {
        if (Math.abs(sheet[key] - sheet[key + 'Target']) > 0.00005) {
          sheet[key] = damp(sheet[key], sheet[key + 'Target'], dt, seconds);
          moving = true;
        } else sheet[key] = sheet[key + 'Target'];
      }
      const p = sheet.progress;
      const angle = sheet.angle;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const curlLength = 1 - 0.6885 * Math.sin(Math.abs(angle));
      const curlStart = 1 - curlLength;
      const bend = Math.sin(p * Math.PI) * Math.PI * sheet.arc;
      const edgeDistance = Math.max(0, cos + sin * (0.6885 * Math.sign(sin)) - curlStart);
      const cornerAngle = edgeDistance / curlLength * bend;
      const rotation = p * Math.PI + sheet.direction * edgeDistance * (Math.abs(cornerAngle) < 0.0001 ? 0 : (1 - Math.cos(cornerAngle)) / cornerAngle) * 0.5;
      const u = sheet.uniforms;
      u.uProgress.value = p;
      u.uDirection.value = sheet.direction;
      u.uBend.value = bend;
      u.uLift.value = 0.31 + 0.69 * THREE.MathUtils.lerp((this.count - 1 - i) / (this.count - 1), i / (this.count - 1), p);
      u.uCurl.value.set(curlStart, curlLength);
      u.uFold.value.set(cos, sin);
      u.uRotation.value.set(Math.cos(rotation), Math.sin(rotation));
      sheet.mesh.position.z = THREE.MathUtils.lerp(this.count - 1 - i, i, p) * 0.00015;
      const depth = i < this.page ? this.page - 1 - i : i - this.page;
      sheet.mesh.castShadow = depth < 3 || this.animations.has(i);
      sheet.mesh.renderOrder = depth;
    }
    const targetX = this.page === 0 ? -0.5 : this.page === this.count ? 0.5 : 0;
    if (Math.abs(this.group.position.x - targetX) > 0.0001) { this.group.position.x = damp(this.group.position.x, targetX, dt, 0.25); moving = true; }
    this.stage.dataset.animating = String(moving);
    if (moving || this.dirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
  }

  setWireframe(enabled) {
    this.sheets.forEach(s => { s.mesh.material.wireframe = enabled; });
    this.dirty = true;
  }

  dispose() {
    this.stopHold();
    this.abort.abort();
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.renderer.setAnimationLoop(null);
    this.scene.traverse(object => {
      object.geometry?.dispose();
      object.material?.dispose();
      object.customDepthMaterial?.dispose();
    });
    this.renderer.dispose();
    this.canvas.remove();
  }
}
