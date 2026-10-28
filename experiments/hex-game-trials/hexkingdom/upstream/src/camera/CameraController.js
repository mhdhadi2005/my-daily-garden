// ============================================================
// CameraController — smooth isometric orbit camera.
//
//   LMB drag              → pan (with release inertia)
//   RMB drag              → rotate (yaw) + slight pitch
//   MMB drag              → rotate (yaw)
//   Wheel / pinch         → zoom TOWARD the cursor point
//   Q / E                 → rotate 60° steps
//   WASD / arrows         → keyboard pan
//
// Click-vs-drag separation uses a pixel threshold per button so a
// tiny hand jitter never blocks tile placement, and an RMB drag
// never triggers tile rotation.
// All motion is exponentially smoothed — no instant jumps.
// ============================================================
import * as THREE from 'three';

const MIN_ZOOM = 5;
const MAX_ZOOM = 34;
const BASE_PITCH = THREE.MathUtils.degToRad(50); // isometric-ish elevation
const MIN_PITCH = THREE.MathUtils.degToRad(32);
const MAX_PITCH = THREE.MathUtils.degToRad(68);
const DRAG_THRESHOLD_PX = 5;    // movement below this still counts as a click
const KEY_PAN_SPEED = 14;       // world units per second at zoom≈14

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export class CameraController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;

    // logical state (goals) vs displayed (smoothed)
    this.target = new THREE.Vector3(0, 0, 0);
    this.targetGoal = new THREE.Vector3(0, 0, 0);
    this.zoom = 14;
    this.zoomGoal = 14;
    this.yaw = Math.PI / 4;
    this.yawGoal = Math.PI / 4;
    this.pitch = BASE_PITCH;
    this.pitchGoal = BASE_PITCH;

    // gesture state
    this._mode = null;          // null | 'pan' | 'rotate'
    this._button = -1;
    this._downX = 0;
    this._downY = 0;
    this._lastX = 0;
    this._lastY = 0;
    this._pinchDist = 0;
    this._keys = new Set();

    // pan inertia
    this._vel = new THREE.Vector3();
    this._lastMoveT = 0;

    /** true if the pointer travelled past the drag threshold during the
     *  current/last LMB press → suppresses click-to-place */
    this.moved = false;
    /** same, but for the RMB press → suppresses context-menu tile rotate */
    this.rmbMoved = false;

    this._bind();
    this._apply(1);
  }

  // ---------------- event wiring ----------------

  _bind() {
    const d = this.dom;
    d.addEventListener('pointerdown', (e) => this._onDown(e));
    window.addEventListener('pointermove', (e) => this._onMove(e));
    window.addEventListener('pointerup', (e) => this._onUp(e));
    window.addEventListener('blur', () => this._cancel());
    d.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._keys.delete(e.code));

    // touch pinch zoom
    d.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) this._pinchDist = this._touchDist(e);
    }, { passive: true });
    d.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const nd = this._touchDist(e);
        if (this._pinchDist > 0) {
          this.zoomGoal = THREE.MathUtils.clamp(
            this.zoomGoal * (this._pinchDist / nd), MIN_ZOOM, MAX_ZOOM);
        }
        this._pinchDist = nd;
      }
    }, { passive: true });
  }

  _touchDist(e) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  // ---------------- pointer gestures ----------------

  _onDown(e) {
    this._button = e.button;
    this._downX = this._lastX = e.clientX;
    this._downY = this._lastY = e.clientY;

    if (e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey)) {
      this._mode = 'rotate';
    } else if (e.button === 0) {
      this._mode = 'pan';
      this._vel.set(0, 0, 0); // stop inertia when grabbing
    } else {
      this._mode = null;
    }

    if (e.button === 0) this.moved = false;
    if (e.button === 2) this.rmbMoved = false;
    this.dom.classList.add('dragging');
  }

  _onMove(e) {
    if (!this._mode) return;
    const dx = e.clientX - this._lastX;
    const dy = e.clientY - this._lastY;

    // total travel from press point decides click vs drag
    const travel = Math.hypot(e.clientX - this._downX, e.clientY - this._downY);
    if (travel > DRAG_THRESHOLD_PX) {
      if (this._button === 0) this.moved = true;
      if (this._button === 2) this.rmbMoved = true;
    }

    if (this._mode === 'rotate' && (this.rmbMoved || this._button !== 2)) {
      this.yawGoal -= dx * 0.007;
      this.pitchGoal = THREE.MathUtils.clamp(
        this.pitchGoal + dy * 0.004, MIN_PITCH, MAX_PITCH);
    } else if (this._mode === 'pan' && this.moved) {
      const move = this._screenToGround(dx, dy);
      this.targetGoal.sub(move); // drag world with the cursor
      // record velocity for inertia
      const now = performance.now();
      const dt = Math.max((now - this._lastMoveT) / 1000, 1 / 240);
      this._vel.copy(move).multiplyScalar(-1 / dt);
      this._lastMoveT = now;
    }

    this._lastX = e.clientX;
    this._lastY = e.clientY;
  }

  _onUp(e) {
    if (this._mode === 'pan' && this.moved) {
      // keep inertia only for a fresh flick (released while still moving)
      if (performance.now() - this._lastMoveT > 90) this._vel.set(0, 0, 0);
      // cap fling speed
      const cap = this.zoom * 2.2;
      if (this._vel.length() > cap) this._vel.setLength(cap);
    } else {
      this._vel.set(0, 0, 0);
    }
    this._mode = null;
    this._button = -1;
    this.dom.classList.remove('dragging');
  }

  _cancel() {
    this._mode = null;
    this._button = -1;
    this._keys.clear();
    this.dom.classList.remove('dragging');
  }

  /** convert a screen-space pixel delta to a ground-plane world delta */
  _screenToGround(dxPx, dyPx) {
    // world units visible per pixel at the focus depth
    const fovY = THREE.MathUtils.degToRad(this.camera.fov);
    const worldPerPx = (2 * Math.tan(fovY / 2) * this.zoom) / window.innerHeight;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // screen right → ground (-sin, cos)... derive from yaw basis:
    // camera forward on ground plane points from camera to target
    const fx = -cos, fz = -sin;          // forward
    const rxAxis = -fz, rzAxis = fx;     // right = forward × up
    const out = new THREE.Vector3();
    out.x = (rxAxis * dxPx - fx * dyPx / Math.sin(this.pitch)) * worldPerPx;
    out.z = (rzAxis * dxPx - fz * dyPx / Math.sin(this.pitch)) * worldPerPx;
    return out;
  }

  // ---------------- zoom to cursor ----------------

  _onWheel(e) {
    e.preventDefault();
    const oldZoom = this.zoomGoal;
    const f = Math.exp(e.deltaY * 0.0012);
    const newZoom = THREE.MathUtils.clamp(oldZoom * f, MIN_ZOOM, MAX_ZOOM);
    if (newZoom === oldZoom) return;

    // world point under cursor (ray vs ground plane)
    _ndc.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    _ray.setFromCamera(_ndc, this.camera);
    if (_ray.ray.intersectPlane(_plane, _hit)) {
      // keep the point under the cursor visually stationary:
      // target moves toward/away from it proportionally to zoom ratio
      const k = newZoom / oldZoom;
      this.targetGoal.x = _hit.x + (this.targetGoal.x - _hit.x) * k;
      this.targetGoal.z = _hit.z + (this.targetGoal.z - _hit.z) * k;
    }
    this.zoomGoal = newZoom;
  }

  // ---------------- keyboard ----------------

  _onKeyDown(e) {
    // ignore when typing in inputs
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    this._keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyQ') this.yawGoal += Math.PI / 3;
    if (e.code === 'KeyE') this.yawGoal -= Math.PI / 3;
  }

  _keyPan(dt) {
    let x = 0, y = 0;
    if (this._keys.has('KeyW') || this._keys.has('ArrowUp')) y -= 1;
    if (this._keys.has('KeyS') || this._keys.has('ArrowDown')) y += 1;
    if (this._keys.has('KeyA') || this._keys.has('ArrowLeft')) x -= 1;
    if (this._keys.has('KeyD') || this._keys.has('ArrowRight')) x += 1;
    if (!x && !y) return;
    const speed = KEY_PAN_SPEED * (this.zoom / 14) * dt;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const fx = -cos, fz = -sin;
    const rx = -fz, rz = fx;
    this.targetGoal.x += (rx * x - fx * y) * speed;
    this.targetGoal.z += (rz * x - fz * y) * speed;
  }

  // ---------------- public API ----------------

  /** smoothly move focus to a world point (e.g. after restart) */
  focusOn(x, z) {
    this.targetGoal.set(x, 0, z);
    this._vel.set(0, 0, 0);
  }

  update(dt) {
    this._keyPan(dt);

    // pan inertia (only while not actively dragging)
    if (this._mode !== 'pan' && this._vel.lengthSq() > 0.0001) {
      this.targetGoal.addScaledVector(this._vel, dt);
      this._vel.multiplyScalar(Math.exp(-dt * 5.5)); // exponential decay
    }

    this._apply(Math.min(dt * 8, 1));
  }

  _apply(k) {
    this.target.lerp(this.targetGoal, k);
    this.zoom += (this.zoomGoal - this.zoom) * k;
    this.yaw += (this.yawGoal - this.yaw) * k;
    this.pitch += (this.pitchGoal - this.pitch) * k;

    const cy = Math.cos(this.pitch) * this.zoom;
    const sy = Math.sin(this.pitch) * this.zoom;
    this.camera.position.set(
      this.target.x + Math.cos(this.yaw) * cy,
      this.target.y + sy,
      this.target.z + Math.sin(this.yaw) * cy
    );
    this.camera.lookAt(this.target);
  }
}
