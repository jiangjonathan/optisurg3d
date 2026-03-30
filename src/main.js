import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const app = document.querySelector("#app");
app.innerHTML = `
  <div class="viewer-shell">
    <canvas class="viewer"></canvas>
    <button class="focus-back" type="button">Back</button>
  </div>
`;

const viewerShell = document.querySelector(".viewer-shell");
const canvas = document.querySelector(".viewer");
const focusBackButton = document.querySelector(".focus-back");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x4f4f4f);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(3, 2, 5);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(2);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const composer = new EffectComposer(renderer);
composer.setPixelRatio(2);
composer.setSize(window.innerWidth, window.innerHeight);

const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.28,
  0.18,
  0.95,
);
composer.addPass(bloomPass);

const outlinePass = new OutlinePass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  scene,
  camera,
);
outlinePass.edgeStrength = 12;
outlinePass.edgeGlow = 0.6;
outlinePass.edgeThickness = 3.75;
outlinePass.pulsePeriod = 0;
outlinePass.visibleEdgeColor.set("#ffffff");
outlinePass.hiddenEdgeColor.set("#ffffff");
composer.addPass(outlinePass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

const laserMaterials = [];
const meshVisibilityState = {};
const laserAnimationTargets = new Map();
let laserAnimationState = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const hoverableMeshes = [];
const hoverBounds = new Map();
let hoveredSelectionId = null;
let hoveredSelectionObjects = [];
let hoveredSelectionLabel = "";
let hoveredSelectionCameraKey = null;
let loadedModel = null;
let isPointerOverCanvas = false;
let isFocusLocked = false;
let groupedHoverObjects = [];
const hoverLabels = new Map();
let activeHoverLabel = null;
const hoverPixelLeeway = 2;
const hoverRadiusScale = 0.28;
const hoverLabelBounds = new THREE.Box3();
const hoverLabelAnchor = new THREE.Vector3();
const hoverLabelProjection = new THREE.Vector3();
const focusBounds = new THREE.Box3();
const focusSize = new THREE.Vector3();
const focusCenter = new THREE.Vector3();
const focusTarget = new THREE.Vector3();
const focusPosition = new THREE.Vector3();
const previousCameraPosition = new THREE.Vector3();
const previousCameraTarget = new THREE.Vector3();
const hoverLabelNameRules = [
  { pattern: /dmd[\s_-]*1/i, label: "DMD 1" },
  { pattern: /dmd[\s_-]*2/i, label: "DMD 2" },
  { pattern: /(flens|fourierlens)[\s_-]*1/i, label: "Fourier Lens 1" },
  { pattern: /(flens|fourierlens)[\s_-]*2/i, label: "Fourier Lens 2" },
  { pattern: /camera/i, label: "Camera" },
];
const groupedHoverEntityNames = new Set([
  "beamex",
  "lh2a",
  "apertuer",
  "aperture",
  "laser",
  "laserfoundation",
]);
const entityCameraViews = {
  "laser-assembly": {
    positionOffset: [0.42, 0, 0.52],
    targetOffset: [0, 0, 0],
    fitMultiplier: 1.1,
    position: { x: 9, y: 27, z: null },
    focusTarget: { x: -9, y: 19, z: null },
  },
  "dmd-1": {
    positionOffset: [0.32, 0, 0],
    targetOffset: [0, 0, 0],
    fitMultiplier: 0.95,
    position: { x: null, y: 21, z: null },
    focusTarget: { x: null, y: 20, z: null },
  },
  "fourier-lens-1": {
    positionOffset: [-0.28, 0, 0],
    targetOffset: [0, 0, 0],
    fitMultiplier: 0.95,
    position: {
      x: -20,
      y: 22,
      z: -0.5,
    },
    focusTarget: { x: 0, y: 21, z: null },
  },
  "dmd-2": {
    positionOffset: [-0.32, 0, 0],
    targetOffset: [0, 0, 0],
    fitMultiplier: 0.95,
    position: { x: null, y: 21, z: -13 },
    focusTarget: { x: null, y: 20, z: -13 },
  },
  "fourier-lens-2": {
    positionOffset: [0.16, 0, 0.22],
    targetOffset: [0, 0, 0],
    fitMultiplier: 0.95,
    position: { x: null, y: 21, z: -18.15 },
    focusTarget: { x: null, y: 20, z: -19 },
  },
  camera: {
    positionOffset: [0.22, 0, 0.28],
    targetOffset: [0, 0, 0],
    fitMultiplier: 1,
    position: { x: 10, y: 21, z: null },
    focusTarget: { x: null, y: 19, z: null },
  },
};

const isMeaningfulNodeName = (name) => {
  if (!name) {
    return false;
  }

  return !/(plane|circle)/i.test(name);
};

const toCameraKey = (label) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const formatHoverLabel = (name) => {
  if (!name) {
    return "Object";
  }

  for (const rule of hoverLabelNameRules) {
    if (rule.pattern.test(name)) {
      return rule.label;
    }
  }

  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
};

const isOutlineExcluded = (object, materials) => {
  const name = object.name?.toLowerCase() ?? "";

  if (name.includes("found")) {
    return true;
  }

  return materials.some(isLaserMaterial);
};

const belongsToGroupedHoverEntity = (object) => {
  let current = object;

  while (current && current !== loadedModel) {
    const name = current.name?.toLowerCase() ?? "";

    if (groupedHoverEntityNames.has(name)) {
      return true;
    }

    current = current.parent;
  }

  return false;
};

const getHoverSelection = (object) => {
  let current = object;

  while (current && current !== loadedModel) {
    const name = current.name?.toLowerCase() ?? "";

    if (groupedHoverEntityNames.has(name)) {
      return {
        id: "laser-assembly",
        objects: groupedHoverObjects,
        label: "Laser Assembly",
        cameraKey: "laser-assembly",
      };
    }

    if (isMeaningfulNodeName(current.name)) {
      const label = formatHoverLabel(current.name);
      return {
        id: current.uuid,
        objects: [current],
        label,
        cameraKey: toCameraKey(label),
      };
    }

    current = current.parent;
  }

  const label = formatHoverLabel(object.name);
  return {
    id: object.uuid,
    objects: [object],
    label,
    cameraKey: toCameraKey(label),
  };
};

const getLeewayHoverObject = () => {
  if (!loadedModel) {
    return null;
  }

  const canvasWidth = renderer.domElement.clientWidth;
  const canvasHeight = renderer.domElement.clientHeight;
  let bestObject = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const object of hoverableMeshes) {
    const bounds = hoverBounds.get(object);

    if (!bounds || !object.visible) {
      continue;
    }

    const worldCenter = bounds.center.clone().applyMatrix4(object.matrixWorld);
    const projectedCenter = worldCenter.project(camera);

    if (projectedCenter.z < -1 || projectedCenter.z > 1) {
      continue;
    }

    const centerX = (projectedCenter.x + 1) * 0.5 * canvasWidth;
    const centerY = (1 - projectedCenter.y) * 0.5 * canvasHeight;
    const radiusPoint = worldCenter
      .clone()
      .add(
        new THREE.Vector3(bounds.radius, 0, 0).applyQuaternion(
          object.getWorldQuaternion(new THREE.Quaternion()),
        ),
      );
    const projectedRadiusPoint = radiusPoint.project(camera);
    const radiusPx =
      Math.max(
        Math.hypot(
          (projectedRadiusPoint.x + 1) * 0.5 * canvasWidth - centerX,
          (1 - projectedRadiusPoint.y) * 0.5 * canvasHeight - centerY,
        ),
        6,
      ) * hoverRadiusScale;
    const pointerX = (pointer.x + 1) * 0.5 * canvasWidth;
    const pointerY = (1 - pointer.y) * 0.5 * canvasHeight;
    const distance = Math.hypot(pointerX - centerX, pointerY - centerY);

    if (distance <= radiusPx + hoverPixelLeeway && distance < bestDistance) {
      bestObject = object;
      bestDistance = distance;
    }
  }

  return bestObject;
};

const syncHoveredOutline = () => {
  outlinePass.selectedObjects = hoveredSelectionObjects;
};

const syncFocusBackButton = () => {
  focusBackButton.classList.toggle("is-visible", isFocusLocked);
};

const focusCameraOnSelection = () => {
  if (
    isFocusLocked ||
    !hoveredSelectionObjects.length ||
    !hoveredSelectionCameraKey
  ) {
    return;
  }

  previousCameraPosition.copy(camera.position);
  previousCameraTarget.copy(controls.target);

  focusBounds.makeEmpty();

  for (const object of hoveredSelectionObjects) {
    focusBounds.expandByObject(object);
  }

  if (focusBounds.isEmpty()) {
    return;
  }

  focusBounds.getSize(focusSize);
  focusBounds.getCenter(focusCenter);

  const preset = entityCameraViews[hoveredSelectionCameraKey] ?? {
    positionOffset: [0.3, 0.14, 0.38],
    targetOffset: [0, 0, 0],
    fitMultiplier: 1,
    position: { x: null, y: 25, z: null },
    focusTarget: { x: null, y: 19, z: null },
  };
  const fitScale = Math.max(
    Math.max(focusSize.x, focusSize.y, focusSize.z),
    0.12,
  );

  focusTarget
    .copy(focusCenter)
    .add(new THREE.Vector3(...preset.targetOffset).multiplyScalar(fitScale));
  focusPosition
    .copy(focusCenter)
    .add(
      new THREE.Vector3(...preset.positionOffset).multiplyScalar(
        fitScale * preset.fitMultiplier,
      ),
    );
  focusTarget.set(
    preset.focusTarget.x ?? focusTarget.x,
    preset.focusTarget.y ?? focusTarget.y,
    preset.focusTarget.z ?? focusTarget.z,
  );
  focusPosition.set(
    preset.position.x ?? focusPosition.x,
    preset.position.y ?? focusPosition.y,
    preset.position.z ?? focusPosition.z,
  );

  camera.position.copy(focusPosition);
  controls.target.copy(focusTarget);
  controls.update();
  isFocusLocked = true;
  syncFocusBackButton();
};

const exitFocusedSelection = () => {
  if (!isFocusLocked) {
    return;
  }

  camera.position.copy(previousCameraPosition);
  controls.target.copy(previousCameraTarget);
  controls.update();

  isFocusLocked = false;
  hoveredSelectionId = null;
  hoveredSelectionObjects = [];
  hoveredSelectionLabel = "";
  hoveredSelectionCameraKey = null;
  syncHoveredOutline();
  updateHoverLabel();
  syncFocusBackButton();
};

const getHoverLabelElement = (selectionId, label) => {
  let element = hoverLabels.get(selectionId);

  if (element) {
    return element;
  }

  element = document.createElement("div");
  element.className = "hover-label";
  element.setAttribute("aria-hidden", "true");
  element.textContent = label;
  viewerShell.append(element);
  hoverLabels.set(selectionId, element);
  return element;
};

const updateHoverLabel = () => {
  if (!hoveredSelectionObjects.length) {
    if (activeHoverLabel) {
      activeHoverLabel.classList.remove("is-visible");
      activeHoverLabel = null;
    }

    return;
  }

  hoverLabelBounds.makeEmpty();

  for (const object of hoveredSelectionObjects) {
    hoverLabelBounds.expandByObject(object);
  }

  if (hoverLabelBounds.isEmpty()) {
    if (activeHoverLabel) {
      activeHoverLabel.classList.remove("is-visible");
      activeHoverLabel = null;
    }

    return;
  }

  const hoverLabel = getHoverLabelElement(
    hoveredSelectionId,
    hoveredSelectionLabel,
  );

  if (activeHoverLabel && activeHoverLabel !== hoverLabel) {
    activeHoverLabel.classList.remove("is-visible");
  }

  hoverLabel.textContent = hoveredSelectionLabel;
  hoverLabelAnchor.set(
    (hoverLabelBounds.min.x + hoverLabelBounds.max.x) * 0.5,
    hoverLabelBounds.max.y +
      Math.max(hoverLabelBounds.getSize(new THREE.Vector3()).y * 0.16, 0.08),
    (hoverLabelBounds.min.z + hoverLabelBounds.max.z) * 0.5,
  );
  hoverLabelProjection.copy(hoverLabelAnchor).project(camera);

  if (
    hoverLabelProjection.z < -1 ||
    hoverLabelProjection.z > 1 ||
    Math.abs(hoverLabelProjection.x) > 1.15 ||
    Math.abs(hoverLabelProjection.y) > 1.15
  ) {
    hoverLabel.classList.remove("is-visible");
    if (activeHoverLabel === hoverLabel) {
      activeHoverLabel = null;
    }
    return;
  }

  const x = (hoverLabelProjection.x + 1) * 0.5 * viewerShell.clientWidth;
  const y = (1 - hoverLabelProjection.y) * 0.5 * viewerShell.clientHeight;

  hoverLabel.style.setProperty("--hover-label-x", `${x}px`);
  hoverLabel.style.setProperty("--hover-label-y", `${y}px`);
  hoverLabel.classList.add("is-visible");
  activeHoverLabel = hoverLabel;
};

const updatePointer = (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
};

const handlePointerMove = (event) => {
  isPointerOverCanvas = true;
  updatePointer(event);
};

const handleCanvasClick = () => {
  focusCameraOnSelection();
};

const handlePointerLeave = () => {
  if (isFocusLocked) {
    return;
  }

  isPointerOverCanvas = false;
  hoveredSelectionId = null;
  hoveredSelectionObjects = [];
  hoveredSelectionLabel = "";
  hoveredSelectionCameraKey = null;
  syncHoveredOutline();
  updateHoverLabel();
};

const updateHoveredObject = () => {
  if (isFocusLocked) {
    return;
  }

  if (!loadedModel || !isPointerOverCanvas || hoverableMeshes.length === 0) {
    if (hoveredSelectionId) {
      hoveredSelectionId = null;
      hoveredSelectionObjects = [];
      hoveredSelectionLabel = "";
      hoveredSelectionCameraKey = null;
      syncHoveredOutline();
      updateHoverLabel();
    }

    return;
  }

  raycaster.setFromCamera(pointer, camera);
  const [intersection] = raycaster.intersectObjects(hoverableMeshes, false);
  const leewayObject = intersection?.object ?? getLeewayHoverObject();
  const nextSelection = leewayObject ? getHoverSelection(leewayObject) : null;

  if (nextSelection?.id === hoveredSelectionId) {
    return;
  }

  hoveredSelectionId = nextSelection?.id ?? null;
  hoveredSelectionObjects = nextSelection?.objects ?? [];
  hoveredSelectionLabel = nextSelection?.label ?? "";
  hoveredSelectionCameraKey = nextSelection?.cameraKey ?? null;
  syncHoveredOutline();
  updateHoverLabel();
};

canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerleave", handlePointerLeave);
canvas.addEventListener("click", handleCanvasClick);
focusBackButton.addEventListener("click", exitFocusedSelection);

const guiState = {
  laserColor: "#ff8080",
  laserGlowColor: "#ff0000",
  laserOpacity: 0,
  laserVisibleOpacity: 0.5,
  laserEmissiveIntensity: 4.5,
  bloomStrength: 0.28,
  bloomRadius: 0.18,
  bloomThreshold: 0.95,
  exposure: 0.5,
  background: "#4f4f4f",
  fillColor: "#d7e3f4",
  fillIntensity: 0.45,
  fillX: -6,
  fillY: 7,
  fillZ: -4,
  fillTargetX: 0,
  fillTargetY: 0,
  fillTargetZ: 0,
  keyColor: "#fff6e8",
  keyIntensity: 4,
  keyX: 8,
  keyY: 14,
  keyZ: 10,
  keyTargetX: 0,
  keyTargetY: 0,
  keyTargetZ: 0,
  shadowOpacity: 0.16,
};

const savedViewDirections = {
  default: new THREE.Vector3(0, 1, 0.75),
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  right: new THREE.Vector3(1, 0, 0),
  left: new THREE.Vector3(-1, 0, 0),
  top: new THREE.Vector3(0, 1, 0),
  isoFrontRight: new THREE.Vector3(1, 0.45, 1),
};

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(
  new RoomEnvironment(),
  0.04,
).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = true;
controls.panSpeed = 1.1;
controls.zoomSpeed = 1.2;

const fillLight = new THREE.DirectionalLight(0xd7e3f4, 0.45);
fillLight.position.set(-6, 7, -4);
scene.add(fillLight);
scene.add(fillLight.target);

const directionalLight = new THREE.DirectionalLight(0xfff6e8, 4);
directionalLight.position.set(8, 14, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(4096, 4096);
directionalLight.shadow.bias = -0.00015;
directionalLight.shadow.normalBias = 0.02;
scene.add(directionalLight);
scene.add(directionalLight.target);

const shadowCatcher = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.16 }),
);
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.position.y = -0.01;
shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);

const loader = new GLTFLoader();
const modelUrl = new URL("../capstone.glb", import.meta.url).href;

const isGlassMaterial = (material) => {
  if (!material) {
    return false;
  }

  const name = material.name?.toLowerCase() ?? "";
  return (
    name.includes("glass") ||
    name.includes("lens") ||
    name.includes("oglaz") ||
    name.includes("flens")
  );
};

const isLaserMaterial = (material) => {
  if (!material) {
    return false;
  }

  return (material.name?.toLowerCase() ?? "").includes("laser");
};

const upgradeGlassMaterial = (material) => {
  const glass = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xb7dcff),
    metalness: 0,
    roughness: 0.006,
    transparent: true,
    opacity: 0.38,
    clearcoat: 1,
    clearcoatRoughness: 0.004,
    reflectivity: 1,
    iridescence: 0.28,
    iridescenceIOR: 1.3,
    envMapIntensity: 3.2,
    specularIntensity: 1.35,
    specularColor: new THREE.Color(0xf4fbff),
    side: material.side ?? THREE.DoubleSide,
  });

  glass.name = material.name;
  return glass;
};

const upgradeLaserMaterial = (material) => {
  const laser = material.clone();
  laser.transparent = true;
  laser.opacity = Math.max(material.opacity ?? 0.3, guiState.laserOpacity);
  laser.depthWrite = false;

  if ("color" in laser && laser.color) {
    laser.color.set(guiState.laserColor);
  }

  if ("emissive" in laser) {
    laser.emissive = new THREE.Color(guiState.laserGlowColor);
    laser.emissiveIntensity = guiState.laserEmissiveIntensity;
  }

  if ("toneMapped" in laser) {
    laser.toneMapped = false;
  }

  return laser;
};

const syncLaserMaterials = () => {
  for (const laser of laserMaterials) {
    if ("color" in laser && laser.color) {
      laser.color.set(guiState.laserColor);
    }

    laser.opacity = guiState.laserOpacity;

    if ("emissive" in laser) {
      laser.emissive.set(guiState.laserGlowColor);
      laser.emissiveIntensity = guiState.laserEmissiveIntensity;
    }
  }
};

const syncLighting = () => {
  renderer.toneMappingExposure = guiState.exposure;
  scene.background.set(guiState.background);
  fillLight.color.set(guiState.fillColor);
  fillLight.intensity = guiState.fillIntensity;
  fillLight.position.set(guiState.fillX, guiState.fillY, guiState.fillZ);
  fillLight.target.position.set(
    guiState.fillTargetX,
    guiState.fillTargetY,
    guiState.fillTargetZ,
  );
  directionalLight.color.set(guiState.keyColor);
  directionalLight.intensity = guiState.keyIntensity;
  directionalLight.position.set(guiState.keyX, guiState.keyY, guiState.keyZ);
  directionalLight.target.position.set(
    guiState.keyTargetX,
    guiState.keyTargetY,
    guiState.keyTargetZ,
  );
  shadowCatcher.material.opacity = guiState.shadowOpacity;
  fillLight.target.updateMatrixWorld();
  directionalLight.target.updateMatrixWorld();
};

const syncBloom = () => {
  bloomPass.strength = guiState.bloomStrength;
  bloomPass.radius = guiState.bloomRadius;
  bloomPass.threshold = guiState.bloomThreshold;
};

const startLaserAnimation = () => {
  const sequence = ["OGLAZ", "OGLAZ2", "DMD1", "DMD2"]
    .map((name) => laserAnimationTargets.get(name))
    .filter(Boolean);

  if (sequence.length === 0) {
    return;
  }

  guiState.laserOpacity = guiState.laserVisibleOpacity;
  syncLaserMaterials();

  for (const entry of sequence) {
    entry.object.visible = false;
    entry.object.scale.set(0, 0, 0);
  }

  laserAnimationState = {
    sequence,
    index: 0,
    elapsed: 0,
  };
};

const updateLaserAnimation = (deltaMs) => {
  if (!laserAnimationState) {
    return;
  }

  const current = laserAnimationState.sequence[laserAnimationState.index];

  if (!current) {
    laserAnimationState = null;
    return;
  }

  laserAnimationState.elapsed += deltaMs;
  const duration = current.duration;
  const progress = Math.min(laserAnimationState.elapsed / duration, 1);

  current.object.visible = true;
  current.object.scale.copy(current.originalScale).multiplyScalar(progress);

  if (progress < 1) {
    return;
  }

  current.object.scale.copy(current.originalScale);
  laserAnimationState.index += 1;
  laserAnimationState.elapsed = 0;

  if (laserAnimationState.index >= laserAnimationState.sequence.length) {
    laserAnimationState = null;
  }
};

let applySavedView = null;

const gui = new GUI({ title: "Scene Controls" });
const meshGui = new GUI({ title: "Mesh Visibility" });

const laserFolder = gui.addFolder("Laser");
laserFolder
  .addColor(guiState, "laserColor")
  .name("Beam Color")
  .onChange(syncLaserMaterials);
laserFolder
  .addColor(guiState, "laserGlowColor")
  .name("Glow Color")
  .onChange(syncLaserMaterials);
laserFolder
  .add(guiState, "laserOpacity", 0, 1, 0.01)
  .name("Beam Opacity")
  .onChange((value) => {
    if (value > 0) {
      guiState.laserVisibleOpacity = value;
    }
    syncLaserMaterials();
  });
laserFolder
  .add(guiState, "laserEmissiveIntensity", 0, 8, 0.1)
  .name("Glow Intensity")
  .onChange(syncLaserMaterials);
laserFolder
  .add({ laseranimation: startLaserAnimation }, "laseranimation")
  .name("Trigger Animation");
laserFolder.open();

const lightFolder = gui.addFolder("Lights");
lightFolder
  .add(guiState, "exposure", 0.2, 1.8, 0.01)
  .name("Exposure")
  .onChange(syncLighting);
lightFolder
  .addColor(guiState, "background")
  .name("Background")
  .onChange(syncLighting);
lightFolder
  .addColor(guiState, "fillColor")
  .name("Fill Color")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "fillIntensity", 0, 3, 0.01)
  .name("Fill Power")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "fillX", -40, 40, 0.1)
  .name("Fill X")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "fillY", -40, 40, 0.1)
  .name("Fill Y")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "fillZ", -40, 40, 0.1)
  .name("Fill Z")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "fillTargetX", -40, 40, 0.1)
  .name("Fill Aim X")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "fillTargetY", -40, 40, 0.1)
  .name("Fill Aim Y")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "fillTargetZ", -40, 40, 0.1)
  .name("Fill Aim Z")
  .onChange(syncLighting);
lightFolder
  .addColor(guiState, "keyColor")
  .name("Key Color")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "keyIntensity", 0, 6, 0.01)
  .name("Key Power")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "keyX", -40, 40, 0.1)
  .name("Key X")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "keyY", -40, 40, 0.1)
  .name("Key Y")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "keyZ", -40, 40, 0.1)
  .name("Key Z")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "keyTargetX", -40, 40, 0.1)
  .name("Key Aim X")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "keyTargetY", -40, 40, 0.1)
  .name("Key Aim Y")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "keyTargetZ", -40, 40, 0.1)
  .name("Key Aim Z")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "shadowOpacity", 0, 0.6, 0.01)
  .name("Shadow Opacity")
  .onChange(syncLighting);

const bloomFolder = gui.addFolder("Bloom");
bloomFolder
  .add(guiState, "bloomStrength", 0, 2, 0.01)
  .name("Strength")
  .onChange(syncBloom);
bloomFolder
  .add(guiState, "bloomRadius", 0, 1, 0.01)
  .name("Radius")
  .onChange(syncBloom);
bloomFolder
  .add(guiState, "bloomThreshold", 0, 2, 0.01)
  .name("Threshold")
  .onChange(syncBloom);

const cameraFolder = gui.addFolder("Camera");
cameraFolder
  .add({ default: () => applySavedView?.("default") }, "default")
  .name("Default");
cameraFolder
  .add({ front: () => applySavedView?.("front") }, "front")
  .name("Front");
cameraFolder.add({ back: () => applySavedView?.("back") }, "back").name("Back");
cameraFolder
  .add({ right: () => applySavedView?.("right") }, "right")
  .name("Right");
cameraFolder.add({ left: () => applySavedView?.("left") }, "left").name("Left");
cameraFolder.add({ top: () => applySavedView?.("top") }, "top").name("Top");
cameraFolder
  .add(
    { isoFrontRight: () => applySavedView?.("isoFrontRight") },
    "isoFrontRight",
  )
  .name("Iso Front Right");

syncLighting();
syncBloom();

const registerMeshVisibilityControls = (model) => {
  const meshFolder = meshGui.addFolder("Objects");
  const nameCounts = new Map();

  model.traverse((child) => {
    if (!isMeaningfulNodeName(child.name) || child === model) {
      return;
    }

    const baseName = child.name;
    const nextCount = (nameCounts.get(baseName) ?? 0) + 1;
    nameCounts.set(baseName, nextCount);

    const label = nextCount === 1 ? baseName : `${baseName} (${nextCount})`;
    meshVisibilityState[label] = child.visible;

    meshFolder
      .add(meshVisibilityState, label)
      .name(label)
      .onChange((visible) => {
        child.visible = visible;
      });
  });
};

const registerLaserAnimationTargets = (model) => {
  for (const name of ["OGLAZ", "OGLAZ2", "DMD1", "DMD2"]) {
    const object = model.getObjectByName(name);

    if (!object) {
      continue;
    }

    const size = new THREE.Box3()
      .setFromObject(object)
      .getSize(new THREE.Vector3());
    const visualLength = size.length();

    laserAnimationTargets.set(name, {
      object,
      originalScale: object.scale.clone(),
      duration: Math.max(visualLength * 4, 80),
    });
  }
};

const configureShadowCamera = (light, center, radius) => {
  const shadowCamera = light.shadow.camera;
  const shadowExtent = radius * 2.2;

  light.target.position.copy(center);
  shadowCamera.left = -shadowExtent;
  shadowCamera.right = shadowExtent;
  shadowCamera.top = shadowExtent;
  shadowCamera.bottom = -shadowExtent;
  shadowCamera.near = 0.5;
  shadowCamera.far = Math.max(radius * 8, 50);
  shadowCamera.updateProjectionMatrix();
};

loader.load(modelUrl, (gltf) => {
  const model = gltf.scene;
  loadedModel = model;
  scene.add(model);
  groupedHoverObjects = [];

  model.traverse((child) => {
    const name = child.name?.toLowerCase() ?? "";

    if (groupedHoverEntityNames.has(name)) {
      groupedHoverObjects.push(child);
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = sphere.radius;

  model.position.sub(center);
  model.position.y += size.y / 2;

  const framedCenter = new THREE.Vector3(0, size.y * 0.42, 0);
  const fitDistance = Math.max(radius * 1.45, 3.5);

  applySavedView = (viewName) => {
    const viewDirection = savedViewDirections[viewName];

    if (!viewDirection) {
      return;
    }

    camera.position.copy(
      framedCenter
        .clone()
        .add(viewDirection.clone().normalize().multiplyScalar(fitDistance)),
    );
    controls.target.copy(framedCenter);
    controls.update();
  };

  applySavedView("default");
  camera.near = Math.max(maxDim / 100, 0.01);
  camera.far = Math.max(maxDim * 20, 100);
  camera.updateProjectionMatrix();

  const shadowCenter = new THREE.Vector3(0, size.y * 0.5, 0);
  directionalLight.position.set(
    radius * 1.8,
    size.y + radius * 2.6,
    radius * 1.6,
  );
  guiState.keyX = directionalLight.position.x;
  guiState.keyY = directionalLight.position.y;
  guiState.keyZ = directionalLight.position.z;
  guiState.keyTargetX = shadowCenter.x;
  guiState.keyTargetY = shadowCenter.y;
  guiState.keyTargetZ = shadowCenter.z;
  configureShadowCamera(directionalLight, shadowCenter, radius);

  shadowCatcher.scale.set(radius * 2.4, radius * 1.8, 1);
  shadowCatcher.position.set(0, -0.01, 0);

  model.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    if (
      belongsToGroupedHoverEntity(child) ||
      !isOutlineExcluded(child, materials)
    ) {
      hoverableMeshes.push(child);
      const sphere = new THREE.Sphere();
      child.geometry.computeBoundingSphere();
      sphere.copy(child.geometry.boundingSphere);
      hoverBounds.set(child, {
        center: sphere.center.clone(),
        radius: sphere.radius,
      });
    }

    child.material = Array.isArray(child.material)
      ? materials.map((material) => {
          if (isLaserMaterial(material)) {
            const laserMaterial = upgradeLaserMaterial(material);
            laserMaterials.push(laserMaterial);
            return laserMaterial;
          }

          return isGlassMaterial(material)
            ? upgradeGlassMaterial(material)
            : material;
        })
      : isLaserMaterial(child.material)
        ? (() => {
            const laserMaterial = upgradeLaserMaterial(child.material);
            laserMaterials.push(laserMaterial);
            return laserMaterial;
          })()
        : isGlassMaterial(child.material)
          ? upgradeGlassMaterial(child.material)
          : child.material;

    const hasGlass = materials.some(isGlassMaterial);
    const hasLaser = materials.some(isLaserMaterial);
    child.castShadow = !hasGlass && !hasLaser;

    if (!hasGlass) {
      for (const material of materials) {
        if ("envMapIntensity" in material) {
          material.envMapIntensity = Math.min(
            material.envMapIntensity ?? 1,
            0.35,
          );
        }
      }
    }

    child.receiveShadow = !hasGlass && !hasLaser;
  });

  controls.target.copy(framedCenter);
  controls.minDistance = Math.max(radius * 0.12, 0.35);
  controls.maxDistance = Math.max(radius * 8, 30);
  controls.update();
  syncLaserMaterials();
  syncLighting();
  registerMeshVisibilityControls(model);
  registerLaserAnimationTargets(model);
});

const handleResize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
  outlinePass.setSize(window.innerWidth, window.innerHeight);
  updateHoverLabel();
};

window.addEventListener("resize", handleResize);

let lastFrameTime = performance.now();

const tick = () => {
  const now = performance.now();
  const deltaMs = now - lastFrameTime;
  lastFrameTime = now;

  controls.update();
  updateHoveredObject();
  updateHoverLabel();
  updateLaserAnimation(deltaMs);
  composer.render();
  window.requestAnimationFrame(tick);
};

tick();
