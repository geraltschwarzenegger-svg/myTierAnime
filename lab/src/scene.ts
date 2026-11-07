import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { disposeObject, makeSculpture, type Sculpture } from "./models";
import { TIER_META, type TierId } from "./data";
import { inspectGlb } from "./glb";
export type Quality = "auto" | "low" | "high";
export type Atmosphere = "astral" | "dawn" | "garden" | "moon";
export interface Settings {
  quality: Quality;
  motion: boolean;
  rotate: boolean;
  followTier: boolean;
  atmosphere: Atmosphere;
  exposure: number;
}
export const DEFAULTS: Settings = {
  quality: "auto",
  motion: true,
  rotate: false,
  followTier: true,
  atmosphere: "astral",
  exposure: 1.25,
};
export interface SceneStats {
  calls: number;
  triangles: number;
  fps: number | null;
  frames: number;
  geometries: number;
  textures: number;
  quality: string;
  paused: boolean;
  reason: string;
  model: string;
}
const worlds: Record<
  Atmosphere,
  { background: number; fog: number; key: number; rim: number }
> = {
  astral: { background: 0x101724, fog: 0x1c263a, key: 0xffe2b6, rim: 0x91cfe4 },
  dawn: { background: 0x35222d, fog: 0x533346, key: 0xffd4a3, rim: 0xe99cbb },
  garden: { background: 0x102b29, fog: 0x183f3b, key: 0xd0ffe9, rim: 0x56bda5 },
  moon: { background: 0x211b34, fog: 0x33264c, key: 0xe3d6ff, rim: 0xa293ef },
};
export class AtelierScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  readonly controls: OrbitControls;
  private object = new THREE.Group();
  private sculpture: Sculpture | null = null;
  private resize: ResizeObserver;
  private key = new THREE.DirectionalLight(0xffe2b6, 5);
  private rim = new THREE.DirectionalLight(0x91cfe4, 4);
  private particles: THREE.Points;
  private shader: THREE.ShaderMaterial;
  private env!: THREE.WebGLRenderTarget;
  private fitDistance = 7.6;
  private floor: THREE.Mesh;
  private animation = 0;
  private frames = 0;
  private stamp = 0;
  private time = 0;
  private statStamp = 0;
  private sample: number[] = [];
  private composer: EffectComposer | null = null;
  private passes: { dispose: () => void }[] = [];
  private visible = true;
  private context = true;
  private inView = true;
  private intersection: IntersectionObserver;
  private overlay = false;
  private dead = false;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)");
  private custom = false;
  private callback: (stats: SceneStats) => void;
  private onWorld: (world: Atmosphere) => void;
  private importGeneration = 0;
  private modelName = "Солнечный венец";
  settings: Settings;
  constructor(
    private host: HTMLElement,
    settings: Settings,
    callback: (stats: SceneStats) => void,
    onWorld: (world: Atmosphere) => void,
  ) {
    this.settings = { ...settings };
    this.callback = callback;
    this.onWorld = onWorld;
    this.renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: "default",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = settings.exposure;
    this.renderer.setClearColor(0x101724);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Интерактивная объёмная эмблема тира. Вращай перетаскиванием; клавиши стрелок меняют ракурс.",
    );
    this.renderer.domElement.tabIndex = 0;
    host.append(this.renderer.domElement);
    this.camera.position.set(0, 1, 7.6);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enablePan = false;
    this.controls.minDistance = 4.2;
    this.controls.maxDistance = 10;
    this.controls.enableDamping = false;
    this.controls.enableZoom = false;
    this.controls.addEventListener("change", this.request);
    this.scene.add(new THREE.HemisphereLight(0xc5e1ff, 0x33283b, 3));
    this.key.position.set(3, 5, 4);
    this.rim.position.set(-3, 2, -3);
    this.scene.add(this.key, this.rim);
    this.rebuildEnvironment();
    this.floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 48),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader:
          "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader:
          "varying vec2 vUv;void main(){float a=1.-smoothstep(.05,.5,distance(vUv,vec2(.5)));gl_FragColor=vec4(0.,0.,0.,a*.32);}",
      }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -1.8;
    this.scene.add(this.floor);
    this.shader = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(TIER_META.S.color) },
        uSize: { value: 2.5 },
      },
      vertexShader:
        "uniform float uTime;uniform float uSize;attribute float aPhase;varying float vFade;void main(){vec3 p=position;p.y+=sin(uTime*.24+aPhase)*.12;p.x+=cos(uTime*.13+aPhase)*.06;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(uSize*8./max(1.,-mv.z),1.,9.);vFade=.24+.5*(.5+.5*sin(aPhase+uTime*.4));}",
      fragmentShader:
        "uniform vec3 uColor;varying float vFade;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,.05,d)*vFade;gl_FragColor=vec4(uColor,a);}",
    });
    const g = new THREE.BufferGeometry(),
      positions = new Float32Array(240 * 3),
      phase = new Float32Array(240);
    let seed = 777;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 240; i++) {
      positions[i * 3] = (rand() - 0.5) * 8;
      positions[i * 3 + 1] = (rand() - 0.5) * 5;
      positions[i * 3 + 2] = -1 - rand() * 3;
      phase[i] = rand() * Math.PI * 2;
    }
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    this.particles = new THREE.Points(g, this.shader);
    this.scene.add(this.particles);
    this.scene.add(this.object);
    this.resize = new ResizeObserver(() => this.size());
    this.resize.observe(host);
    this.intersection = new IntersectionObserver(
      (entries) => {
        this.inView = entries[0].isIntersecting;
        this.refresh();
      },
      { threshold: 0 },
    );
    this.intersection.observe(host);
    document.addEventListener("visibilitychange", this.visibility);
    this.reduced.addEventListener("change", this.media);
    this.renderer.domElement.addEventListener("webglcontextlost", this.lost);
    this.renderer.domElement.addEventListener(
      "webglcontextrestored",
      this.restored,
    );
    this.renderer.domElement.addEventListener("keydown", this.keys);
    this.setTier("S");
    this.apply(settings);
    this.size();
  }
  private visibility = () => {
    this.visible = !document.hidden;
    this.refresh();
  };
  private media = () => this.refresh();
  private lost = (e: Event) => {
    e.preventDefault();
    this.context = false;
    this.refresh();
    this.host.dataset.context = "lost";
  };
  private rebuildEnvironment() {
    this.env?.dispose();
    const pmrem = new THREE.PMREMGenerator(this.renderer),
      room = new RoomEnvironment();
    this.env = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.env.texture;
    room.dispose();
    pmrem.dispose();
  }
  private restored = () => {
    this.context = true;
    this.rebuildEnvironment();
    this.post();
    delete this.host.dataset.context;
    this.refresh();
  };
  private keys = (event: KeyboardEvent) => {
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "+",
        "-",
      ].includes(event.key)
    ) {
      event.preventDefault();
      if (event.key === "Home") this.reset();
      else if (event.key === "+" || event.key === "-")
        this.zoom(event.key === "+" ? 0.88 : 1.12);
      else {
        const x =
            event.key === "ArrowLeft"
              ? -0.15
              : event.key === "ArrowRight"
                ? 0.15
                : 0,
          y =
            event.key === "ArrowUp"
              ? -0.1
              : event.key === "ArrowDown"
                ? 0.1
                : 0;
        const spherical = new THREE.Spherical().setFromVector3(
          this.camera.position,
        );
        spherical.theta += x;
        spherical.phi = THREE.MathUtils.clamp(
          spherical.phi + y,
          0.15,
          Math.PI - 0.15,
        );
        this.camera.position.setFromSpherical(spherical);
        this.controls.update();
        this.request();
      }
    }
  };
  get paused() {
    return (
      !this.settings.motion ||
      this.reduced.matches ||
      !this.visible ||
      !this.inView ||
      this.overlay ||
      !this.context
    );
  }
  private get reason() {
    return !this.context
      ? "Контекст восстанавливается"
      : !this.visible
        ? "Вкладка скрыта"
        : !this.inView
          ? "Сцена вне экрана"
          : this.overlay
            ? "Окно поверх сцены"
            : this.reduced.matches
              ? "Системное уменьшение движения"
              : !this.settings.motion
                ? "Пауза"
                : "Активна";
  }
  private isHigh() {
    return this.settings.quality === "high" && innerWidth >= 700;
  }
  private size() {
    const width = this.host.clientWidth,
      height = this.host.clientHeight;
    if (!width || !height || this.dead) return;
    if (Boolean(this.composer) !== this.isHigh()) this.post();
    const ratio = Math.min(
      devicePixelRatio || 1,
      this.settings.quality === "low" ? 1 : this.isHigh() ? 1.75 : 1.35,
    );
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    const nextFit = 7.6 * Math.max(1, 0.9 / this.camera.aspect);
    this.camera.position.multiplyScalar(nextFit / this.fitDistance);
    this.fitDistance = nextFit;
    this.controls.minDistance = nextFit * 0.55;
    this.controls.maxDistance = nextFit * 1.4;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    if (this.composer) {
      this.composer.setPixelRatio(ratio);
      this.composer.setSize(width, height);
    }
    this.request();
  }
  private post() {
    this.composer?.dispose();
    this.passes.forEach((p) => p.dispose());
    this.passes = [];
    this.composer = null;
    if (this.isHigh()) {
      const c = new EffectComposer(this.renderer),
        r = new RenderPass(this.scene, this.camera),
        b = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.22, 0.45, 1.15),
        o = new OutputPass();
      c.addPass(r);
      c.addPass(b);
      c.addPass(o);
      this.composer = c;
      this.passes = [b, o];
    }
  }
  apply(settings: Settings) {
    const qualityChanged = this.settings.quality !== settings.quality;
    this.settings = { ...settings };
    if (qualityChanged) this.sample = [];
    this.renderer.toneMappingExposure = settings.exposure;
    this.particles.visible = settings.quality !== "low";
    if (qualityChanged || (this.composer === null && this.isHigh()))
      this.post();
    this.setWorld(settings.atmosphere);
    this.size();
    this.refresh();
  }
  setWorld(world: Atmosphere) {
    this.settings.atmosphere = world;
    const w = worlds[world];
    this.scene.background = new THREE.Color(w.background);
    this.scene.fog = new THREE.FogExp2(w.fog, 0.055);
    this.key.color.setHex(w.key);
    this.rim.color.setHex(w.rim);
    this.onWorld(world);
    this.request();
  }
  setTier(tier: TierId) {
    this.importGeneration++;
    this.sculpture?.dispose();
    if (this.custom) disposeObject(this.object);
    else this.object.removeFromParent();
    this.sculpture = makeSculpture(tier);
    this.object = this.sculpture.root;
    this.scene.add(this.object);
    this.custom = false;
    this.modelName = this.sculpture.name;
    this.shader.uniforms.uColor.value.set(TIER_META[tier].color);
    this.reset();
    if (this.settings.followTier) {
      const map: Record<TierId, Atmosphere> = {
        S: "dawn",
        A: "garden",
        B: "moon",
        C: "astral",
      };
      this.setWorld(map[tier]);
    }
    this.request();
  }
  reset() {
    this.object.rotation.set(0.12, -0.22, 0);
    this.camera.position.set(0, 0.65, this.fitDistance);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.request();
  }
  zoom(factor: number) {
    this.camera.position.multiplyScalar(factor);
    const l = this.camera.position.length();
    this.camera.position.multiplyScalar(
      THREE.MathUtils.clamp(
        l,
        this.controls.minDistance,
        this.controls.maxDistance,
      ) / l,
    );
    this.controls.update();
    this.request();
  }
  setOverlay(value: boolean) {
    this.overlay = value;
    this.refresh();
  }
  private refresh() {
    cancelAnimationFrame(this.animation);
    this.animation = 0;
    this.stamp = 0;
    this.request();
  }
  private request = () => {
    if (!this.animation && !this.dead && this.context && this.visible)
      this.animation = requestAnimationFrame(this.frame);
  };
  private frame = (stamp: number) => {
    this.animation = 0;
    if (this.dead || !this.context || !this.visible) return;
    const elapsed = this.stamp ? (stamp - this.stamp) / 1000 : 0,
      dt = Math.min(elapsed, 0.1);
    this.stamp = stamp;
    if (!this.paused) {
      this.time += dt;
      if (this.settings.rotate) this.object.rotation.y += dt * 0.12;
      this.shader.uniforms.uTime.value = this.time;
      this.sample.push(elapsed);
      if (this.sample.length > 90) this.sample.shift();
    }
    this.renderer.info.reset();
    this.renderer.info.autoReset = false;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (stamp - this.statStamp > 600 || this.paused) {
      this.statStamp = stamp;
      this.callback(this.stats());
    }
    if (!this.paused) this.request();
  };
  stats(): SceneStats {
    const positive = this.sample.filter((n) => n > 0);
    const avg = positive.reduce((n, v) => n + v, 0) / positive.length;
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      fps: positive.length > 10 ? Math.round(1 / avg) : null,
      frames: this.frames,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      quality:
        this.settings.quality === "low"
          ? "Лёгкий"
          : this.isHigh()
            ? "Детальный"
            : "Баланс",
      paused: this.paused,
      reason: this.reason,
      model: this.modelName,
    };
  }
  async importGlb(file: File) {
    if (file.size > 20 * 1024 * 1024) throw new Error("GLB больше 20 МБ.");
    const buffer = await file.arrayBuffer();
    inspectGlb(buffer);
    const generation = ++this.importGeneration;
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(buffer, "");
    if (this.dead || generation !== this.importGeneration) {
      disposeObject(gltf.scene);
      return false;
    }
    const bounds = new THREE.Box3().setFromObject(gltf.scene),
      size = bounds.getSize(new THREE.Vector3()),
      extent = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(extent) || extent < 0.0001) {
      disposeObject(gltf.scene);
      throw new Error("В GLB нет видимой геометрии.");
    }
    let meshes = 0,
      vertices = 0,
      largeTexture = false;
    gltf.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        meshes++;
        vertices += o.geometry.attributes.position?.count ?? 0;
        for (const material of Array.isArray(o.material)
          ? o.material
          : [o.material])
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) {
              const image = value.image;
              if (image && (image.width > 4096 || image.height > 4096))
                largeTexture = true;
            }
          }
      }
    });
    if (vertices > 1500000 || largeTexture) {
      disposeObject(gltf.scene);
      throw new Error(
        "Слишком тяжёлая модель: предел 1,5 млн вершин и текстуры до 4096 пикселей.",
      );
    }
    if (meshes > 300) {
      disposeObject(gltf.scene);
      throw new Error(
        "Слишком много отдельных мешей: объедини модель до 300 объектов.",
      );
    }
    this.sculpture?.dispose();
    this.sculpture = null;
    if (this.custom) disposeObject(this.object);
    else this.object.removeFromParent();
    const wrapper = new THREE.Group();
    gltf.scene.position.sub(bounds.getCenter(new THREE.Vector3()));
    wrapper.add(gltf.scene);
    wrapper.scale.setScalar(3.2 / extent);
    this.object = wrapper;
    this.scene.add(wrapper);
    this.custom = true;
    this.modelName = file.name;
    this.reset();
    return true;
  }
  async exportGlb(): Promise<ArrayBuffer> {
    const result = await new GLTFExporter().parseAsync(this.object, {
      binary: true,
      onlyVisible: true,
    });
    if (!(result instanceof ArrayBuffer))
      throw new Error("Не удалось экспортировать GLB.");
    return result;
  }
  screenshot(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.context) return reject(new Error("Дождись восстановления 3D."));
      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
      this.renderer.domElement.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Не удалось сохранить кадр.")),
        "image/png",
      );
    });
  }
  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.animation);
    this.resize.disconnect();
    this.intersection.disconnect();
    document.removeEventListener("visibilitychange", this.visibility);
    this.reduced.removeEventListener("change", this.media);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.lost);
    this.renderer.domElement.removeEventListener(
      "webglcontextrestored",
      this.restored,
    );
    this.renderer.domElement.removeEventListener("keydown", this.keys);
    this.controls.dispose();
    this.composer?.dispose();
    this.passes.forEach((p) => p.dispose());
    disposeObject(this.object);
    disposeObject(this.floor);
    disposeObject(this.particles);
    this.env.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
