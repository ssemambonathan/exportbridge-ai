import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { ContainerFinishPreset, createSceneMaterials } from './materials.ts';
import {
  buildCoffeePalletAssembly,
  buildGantryCraneAssembly,
  buildHarborEnvironment,
  buildReeferContainerAssembly,
  ExplodableAssembly,
} from './builders.ts';

export type CameraPresetId = 'overview' | 'coffee_lot' | 'reefer_container' | 'gantry_crane';
export type LightingPresetId = 'golden_quay' | 'overcast_inspection';

export interface AssemblyInspectionInfo {
  id: string;
  title: string;
  subtitle: string;
  metrics: Array<{ label: string; value: string }>;
}

export interface SceneControllerCallbacks {
  onSelectAssembly: (info: AssemblyInspectionInfo | null) => void;
  onContextLost: (lost: boolean) => void;
}

// Module-scope reusable math helpers (zero GC inside animation loop)
const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();

export function detectSoftwareWebGL(): boolean {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export class ExportPortSceneController {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private envMap: THREE.Texture;
  private materials: ReturnType<typeof createSceneMaterials>;
  private harborEnv: ReturnType<typeof buildHarborEnvironment>;
  private assemblies: ExplodableAssembly[];
  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private isSoftwareGl: boolean;
  private frameId = 0;
  private renderBusy = false;
  private renderDirty = false;
  private lastTickMs = performance.now();
  private lastHoverMs = 0;
  private targetExplode = 0;
  private currentExplode = 0;
  private cameraTransitionActive = false;
  private disposed = false;
  private callbacks: SceneControllerCallbacks;

  constructor(container: HTMLElement, callbacks: SceneControllerCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 320);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const horizonHex = 0xeae4d3;
    this.scene.background = new THREE.Color(horizonHex);
    this.scene.fog = new THREE.FogExp2(horizonHex, 0.014);

    // Mandatory studio environment reflection via RoomEnvironment on every device
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    pmremGenerator.dispose();

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 220);
    this.camera.position.set(8.6, 5.2, 10.6);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.minDistance = 2.8;
    this.controls.maxDistance = 28;
    this.controls.target.set(-0.2, 1.3, -0.5);

    // Three-point warm/cool studio & outdoor daylight rig (<= 3 shadow casters)
    this.keyLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    this.keyLight.position.set(11, 16, 9);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 45;
    const d = 11;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    this.hemiLight = new THREE.HemisphereLight(0xd7e7f5, 0x625849, 0.85);
    this.scene.add(this.hemiLight);

    this.rimLight = new THREE.DirectionalLight(0xcbe2f0, 0.75);
    this.rimLight.position.set(-10, 7, -12);
    this.scene.add(this.rimLight);

    if (!this.isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const softbox = new THREE.RectAreaLight(0xfff8ea, 2.0, 6, 3);
      softbox.position.set(-3, 5.5, 5.5);
      softbox.lookAt(-1.2, 0.9, 1.0);
      this.scene.add(softbox);
    }

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.materials = createSceneMaterials(maxAniso, this.isSoftwareGl);
    this.harborEnv = buildHarborEnvironment(this.materials);
    this.scene.add(this.harborEnv.group);

    this.assemblies = [
      buildCoffeePalletAssembly(this.materials),
      buildReeferContainerAssembly(this.materials),
      buildGantryCraneAssembly(this.materials),
    ];
    this.assemblies.forEach((a) => this.scene.add(a.group));

    _raycaster.layers.set(1);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.setCameraPreset('overview', false);
    this.callbacks.onSelectAssembly({
      id: this.assemblies[0].id,
      title: this.assemblies[0].title,
      subtitle: this.assemblies[0].subtitle,
      metrics: this.assemblies[0].metrics,
    });
    this.requestRender();
  }

  private onControlsStart = () => {
    this.cameraTransitionActive = false;
  };

  private onControlsChange = () => {
    this.requestRender();
  };

  private onResize = () => {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 320);
    const height = Math.max(this.container.clientHeight, 320);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.requestRender();
  };

  private onPointerMove = (e: PointerEvent) => {
    const now = performance.now();
    if (now - this.lastHoverMs < 60) return;
    this.lastHoverMs = now;

    const rect = this.renderer.domElement.getBoundingClientRect();
    _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_pointer, this.camera);
    const hits = _raycaster.intersectObjects(
      this.assemblies.map((a) => a.group),
      true
    );
    this.renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
  };

  private onPointerClick = (e: MouseEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_pointer, this.camera);
    const hits = _raycaster.intersectObjects(
      this.assemblies.map((a) => a.group),
      true
    );
    if (hits.length > 0) {
      const id = hits[0].object.userData.assemblyId as CameraPresetId | undefined;
      const found = this.assemblies.find((a) => a.id === id);
      if (found) {
        this.callbacks.onSelectAssembly({
          id: found.id,
          title: found.title,
          subtitle: found.subtitle,
          metrics: found.metrics,
        });
        this.setCameraPreset(found.id, true);
      }
    }
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private onContextRestored = () => {
    this.callbacks.onContextLost(false);
    this.requestRender();
  };

  private bindEvents() {
    this.controls.addEventListener('start', this.onControlsStart);
    this.controls.addEventListener('change', this.onControlsChange);
    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('click', this.onPointerClick);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  public setExplode(value: number) {
    this.targetExplode = THREE.MathUtils.clamp(value, 0, 1);
    this.requestRender();
  }

  public setContainerFinish(preset: ContainerFinishPreset) {
    this.materials.setContainerFinish(preset);
    this.requestRender();
  }

  public setLightingPreset(preset: LightingPresetId) {
    if (preset === 'golden_quay') {
      this.keyLight.color.setHex(0xfff1d6);
      this.keyLight.intensity = 2.2;
      this.hemiLight.intensity = 0.85;
      this.scene.background = new THREE.Color(0xeae4d3);
      if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.setHex(0xeae4d3);
    } else {
      this.keyLight.color.setHex(0xeaf2fa);
      this.keyLight.intensity = 1.65;
      this.hemiLight.intensity = 1.15;
      this.scene.background = new THREE.Color(0xdbe2e6);
      if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.setHex(0xdbe2e6);
    }
    this.requestRender();
  }

  public setCameraPreset(preset: CameraPresetId, animate = true) {
    if (preset === 'overview') {
      _targetCamPos.set(8.6, 5.2, 10.6);
      _targetLookAt.set(-0.2, 1.3, -0.5);
    } else {
      const target = this.assemblies.find((a) => a.id === preset);
      if (!target) return;
      _targetCamPos.copy(target.cameraOffset);
      _targetLookAt.copy(target.focusPoint);
      this.callbacks.onSelectAssembly({
        id: target.id,
        title: target.title,
        subtitle: target.subtitle,
        metrics: target.metrics,
      });
    }

    if (!animate || this.isSoftwareGl) {
      this.camera.position.copy(_targetCamPos);
      this.controls.target.copy(_targetLookAt);
      this.controls.update();
      this.cameraTransitionActive = false;
      this.requestRender();
    } else {
      this.cameraTransitionActive = true;
      this.requestRender();
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public requestRender() {
    if (this.disposed) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;

    this.frameId = requestAnimationFrame(() => {
      if (this.disposed) return;
      this.renderDirty = false;
      const now = performance.now();
      const delta = Math.min((now - this.lastTickMs) / 1000, 0.1);
      this.lastTickMs = now;

      // Smooth explode separation damping
      if (Math.abs(this.currentExplode - this.targetExplode) > 0.002) {
        this.currentExplode = this.isSoftwareGl
          ? this.targetExplode
          : THREE.MathUtils.damp(this.currentExplode, this.targetExplode, 7.5, delta);
        this.assemblies.forEach((a) => a.applyExplode(this.currentExplode));
        if (!this.isSoftwareGl) this.renderDirty = true;
      } else if (this.currentExplode !== this.targetExplode) {
        this.currentExplode = this.targetExplode;
        this.assemblies.forEach((a) => a.applyExplode(this.currentExplode));
      }

      // Smooth camera preset glide
      if (this.cameraTransitionActive) {
        const lambda = 6.5;
        this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _targetCamPos.x, lambda, delta);
        this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _targetCamPos.y, lambda, delta);
        this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _targetCamPos.z, lambda, delta);
        this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, _targetLookAt.x, lambda, delta);
        this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, _targetLookAt.y, lambda, delta);
        this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, _targetLookAt.z, lambda, delta);
        if (
          this.camera.position.distanceToSquared(_targetCamPos) < 0.002 &&
          this.controls.target.distanceToSquared(_targetLookAt) < 0.002
        ) {
          this.camera.position.copy(_targetCamPos);
          this.controls.target.copy(_targetLookAt);
          this.cameraTransitionActive = false;
        } else {
          this.renderDirty = true;
        }
      }

      this.materials.waterTimeUniform.value += delta;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);

      const done = () => {
        this.renderBusy = false;
        if (this.renderDirty && !this.disposed) this.requestRender();
      };

      if (this.isSoftwareGl) this.afterDraw(done);
      else done();
    });
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    this.controls.removeEventListener('start', this.onControlsStart);
    this.controls.removeEventListener('change', this.onControlsChange);
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('click', this.onPointerClick);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);

    this.controls.dispose();
    this.assemblies.forEach((a) => a.disposeGeometries());
    this.harborEnv.disposeGeometries();
    this.materials.dispose();
    this.envMap.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
