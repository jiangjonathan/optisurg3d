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
    <div class="focus-controls">
      <button class="focus-back" type="button">Exit</button>
      <button class="focus-nav focus-prev" type="button">&lt;</button>
      <button class="focus-nav focus-next" type="button">&gt;</button>
    </div>
    <aside class="focus-panel">
      <h2 class="focus-panel-title"></h2>
      <div class="focus-panel-body"></div>
      <div class="focus-panel-toolbar">
        <label class="focus-panel-kernel-label" for="focus-panel-kernel">
          Kernel
        </label>
        <select class="focus-panel-kernel-select" id="focus-panel-kernel">
          <option value="laplacian">laplacian</option>
          <option value="sobel-x">sobel x</option>
          <option value="sobel-y">sobel y</option>
        </select>
      </div>
      <div class="focus-panel-media"></div>
    </aside>
  </div>
`;

const viewerShell = document.querySelector(".viewer-shell");
const canvas = document.querySelector(".viewer");
const focusControls = document.querySelector(".focus-controls");
const focusPrevButton = document.querySelector(".focus-prev");
const focusBackButton = document.querySelector(".focus-back");
const focusNextButton = document.querySelector(".focus-next");
const focusPanel = document.querySelector(".focus-panel");
const focusPanelTitle = document.querySelector(".focus-panel-title");
const focusPanelBody = document.querySelector(".focus-panel-body");
const focusPanelToolbar = document.querySelector(".focus-panel-toolbar");
const focusPanelKernelSelect = document.querySelector(
  ".focus-panel-kernel-select",
);
const focusPanelMedia = document.querySelector(".focus-panel-media");
let focusPanelTransitionFrame = null;
let focusPanelTransitionTimeout = null;
const dmdInputTextureUrl = new URL(
  "../frame_100_endo/01_input_bgr.png",
  import.meta.url,
).href;
const dmdClaheTextureUrl = new URL(
  "../frame_100_endo/02_gray_clahe.png",
  import.meta.url,
).href;
const fft1TextureUrl = new URL("../fft1.png", import.meta.url).href;
const dmd2RampTextureUrl = new URL(
  "../dmd_laplacian_3bit_fast_ramp.png",
  import.meta.url,
).href;
const laplacianFeatureTextureUrl = new URL(
  "../laplacianfft.png",
  import.meta.url,
).href;
const laplacianFeatureIntensityTextureUrl = new URL(
  "../frame_100_endo/04_feature_laplacian_intensity.png",
  import.meta.url,
).href;
const predColorOrigsizeTextureUrl = new URL(
  "../frame_100_endo/09_pred_color_origsize.png",
  import.meta.url,
).href;
const overlayOrigsizeTextureUrl = new URL(
  "../frame_100_endo/10_overlay_origsize.png",
  import.meta.url,
).href;
const kernelMediaByKey = {
  laplacian: {
    dmd: new URL("../dmd_laplacian_3bit_fast_ramp.png", import.meta.url).href,
    fft: new URL("../laplacianfft.png", import.meta.url).href,
    feature: new URL(
      "../frame_100_endo/04_feature_laplacian_intensity.png",
      import.meta.url,
    ).href,
  },
  "sobel-x": {
    dmd: new URL("../dmd_sobel_x_3bit_fast_ramp.png", import.meta.url).href,
    fft: new URL("../sobelxfft.png", import.meta.url).href,
    feature: new URL(
      "../frame_100_endo/04_feature_sobel_x_intensity.png",
      import.meta.url,
    ).href,
  },
  "sobel-y": {
    dmd: new URL("../dmd_sobel_y_3bit_fast_ramp.png", import.meta.url).href,
    fft: new URL("../sobelyfft.png", import.meta.url).href,
    feature: new URL(
      "../frame_100_endo/04_feature_sobel_y_intensity.png",
      import.meta.url,
    ).href,
  },
};
const kernelSelectableCameraKeys = new Set([
  "dmd-2",
  "fourier-lens-2",
  "camera",
]);
const kernelKeys = ["laplacian", "sobel-x", "sobel-y"];
let selectedKernelKey = "laplacian";
const getFourierLens2LeftCaption = (kernelKey) => {
  switch (kernelKey) {
    case "laplacian":
      return "Left: Laplacian modulated DFT";
    case "sobel-x":
      return "Left: Sobel X modulated DFT";
    case "sobel-y":
    default:
      return "Left: Sobel Y modulated DFT";
  }
};
const getFourierLens2RightCaption = (kernelKey) => {
  switch (kernelKey) {
    case "laplacian":
      return "Right: Inverse Fourier of Laplacian DFT pattern";
    case "sobel-x":
      return "Right: Inverse Fourier of Sobel X DFT pattern";
    case "sobel-y":
    default:
      return "Right: Inverse Fourier of Sobel Y DFT pattern";
  }
};

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
const dmdFace2Materials = [];
const meshVisibilityState = {};
const laserAnimationTargets = new Map();
let laserAnimationState = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const hoverableMeshes = [];
const hoverBounds = new Map();
const hoverDebugHelpers = new Map();
const persistentFocusLabelTargets = new Map();
const orderedFocusCameraKeys = [
  "laser-assembly",
  "dmd-1",
  "fourier-lens-1",
  "dmd-2",
  "fourier-lens-2",
  "camera",
];
const horizontalOverviewViews = ["front", "right", "back", "left"];
const laserAssemblyFocusLabelDefinitions = [
  { id: "beam-expander", label: "Beam Expander", pattern: /beamex/i },
  { id: "aperture", label: "Aperture", pattern: /apertu?e?r/i },
  { id: "lens", label: "Lens", pattern: /lh2a/i },
  { id: "laser", label: "Laser", pattern: /^laser$/i },
];
const numberedFocusTitleByCameraKey = new Map([
  ["laser-assembly", "1. Laser Assembly"],
  ["dmd-1", "2. DMD 1"],
  ["fourier-lens-1", "3. Fourier Lens 1"],
  ["dmd-2", "4. DMD 2"],
  ["fourier-lens-2", "5. Fourier Lens 2"],
  ["camera", "6. Camera"],
]);
const focusInfoByCameraKey = new Map([
  [
    "laser-assembly",
    {
      title: "1. Laser Assembly",
      bodyLead:
        "Prepares a clean, uniform, and properly scaled optical field for encoding on the DMD.",
      bodyBullets: [
        "Laser: Generates a coherent, monochromatic beam of light.",
        "Lens: Reduces beam divergence and flattens the wavefront.",
        "Aperture: Removes high-frequency noise and unwanted spatial components.",
        "Beam expander: Increases beam diameter to evenly illuminate the DMD area.",
      ],
    },
  ],
  [
    "dmd-1",
    {
      title: "2. DMD 1",
      body: "The first Digital Micromirror Device (DMD) spatially patterns the beam, shaping the laser to represent the input image by controlling downstream light.",
      mediaCaption:
        "Left: Original surgical image; Right: normalized image for optical modulation.",
      media: [
        { src: dmdInputTextureUrl, alt: "01_input_bgr" },
        {
          src: dmdClaheTextureUrl,
          alt: "02_gray_clahe",
        },
      ],
    },
  ],
  [
    "fourier-lens-1",
    {
      title: "3. Fourier Lens 1",
      body: "Performs the first Fourier transform of the patterned beam. It converts spatial structure from the first modulation stage into its frequency-domain distribution.",
      mediaCaption:
        "Left: Normalized surgical image; Right: Discrete Fourier transform of image.",
      media: [
        { src: dmdClaheTextureUrl, alt: "02_gray_clahe" },
        { src: fft1TextureUrl, alt: "fft1" },
      ],
    },
  ],
  [
    "dmd-2",
    {
      title: "4. DMD 2",
      body: "Applies a second programmable modulation at the Fourier plane, where the frequency domain image is filtered by the kernel to selectively reweight frequency components before final imaging.",
      getMediaCaption: (kernelKey) =>
        kernelKey === "laplacian"
          ? "Left: DFT of image; Right: Modulated DFT using Laplacian kernel"
          : kernelKey === "sobel-x"
            ? "Left: DFT of image; Right: Modulated DFT using Sobel X kernel"
            : "Left: DFT of image; Right: Modulated DFT using Sobel Y kernel",
      getMedia: (kernelKey) => [
        {
          src: kernelMediaByKey[kernelKey].dmd,
          alt: `${kernelKey}_dmd`,
          span: "full",
          label:
            kernelKey === "laplacian"
              ? "Laplacian kernel in Fourier domain"
              : kernelKey === "sobel-x"
                ? "Sobel X kernel in Fourier domain"
                : "Sobel Y kernel in Fourier domain",
        },
        { src: fft1TextureUrl, alt: "fft1" },
        {
          src: kernelMediaByKey[kernelKey].fft,
          alt: `${kernelKey}_fft`,
        },
      ],
    },
  ],
  [
    "fourier-lens-2",
    {
      title: "5. Fourier Lens 2",
      body: "Performs an inverse Fourier transform, converting the modulated frequency-domain field back into the spatial domain at the camera sensor.",
      getMediaCaption: (kernelKey) =>
        `${getFourierLens2LeftCaption(kernelKey)}; ${getFourierLens2RightCaption(kernelKey)}`,
      getMedia: (kernelKey) => [
        { src: kernelMediaByKey[kernelKey].fft, alt: `${kernelKey}_fft` },
        {
          src: kernelMediaByKey[kernelKey].feature,
          alt: `${kernelKey}_feature`,
        },
      ],
    },
  ],
  [
    "camera",
    {
      title: "6. Camera",
      body: "Captures the resulting convolved feature maps and forwards them to the digital segmentation head to produce a prediction mask for overlay visualization.",
      getMediaRows: (kernelKey) => [
        {
          items: [
            {
              src: kernelMediaByKey[kernelKey].feature,
              alt: `${kernelKey}_feature`,
            },
            { src: predColorOrigsizeTextureUrl, alt: "09_pred_color_origsize" },
          ],
          caption:
            kernelKey === "laplacian"
              ? "Left: Laplacian feature map;  Right: Class prediction mask"
              : kernelKey === "sobel-x"
                ? "Left: Sobel X feature map;  Right: Class prediction mask"
                : "Left: Sobel Y feature map;  Right: Class prediction mask",
        },
        {
          items: [
            { src: dmdInputTextureUrl, alt: "01_input_bgr" },
            { src: overlayOrigsizeTextureUrl, alt: "10_overlay_origsize" },
          ],
          caption:
            "Left: Original surgical image; Right: Original image with segmentation mask overlay",
        },
      ],
    },
  ],
]);
const focusSelectionIdsByCameraKey = new Map();
let hoveredSelectionId = null;
let hoveredSelectionObjects = [];
let hoveredSelectionLabel = "";
let hoveredSelectionCameraKey = null;
let hoveredAssemblyFocusPartId = null;
let currentFocusedCameraKey = null;
let loadedModel = null;
let isPointerOverCanvas = false;
let isFocusLocked = false;
let isCinematicModeEnabled = false;
let areAllHoverLabelsVisible = false;
let groupedHoverObjects = [];
const hoverLabels = new Map();
let activeHoverLabel = null;
let areGuiPanelsVisible = false;
let currentOverviewViewName = "default";
let lastHorizontalOverviewViewName = "front";
let targetCameraViewOffsetPx = 0;
let currentCameraViewOffsetPx = 0;
const hoverPixelLeeway = 2;
const hoverRadiusScale = 0.28;
const hoverLabelBounds = new THREE.Box3();
const hoverLabelAnchor = new THREE.Vector3();
const hoverLabelProjection = new THREE.Vector3();
const hoverDebugBox = new THREE.Box3();
const hoverDebugCenter = new THREE.Vector3();
const hoverDebugSize = new THREE.Vector3();
const focusCameraPosition = new THREE.Vector3();
const focusCameraTarget = new THREE.Vector3();
const focusFrontDirection = new THREE.Vector3();
const focusPlaneSize = new THREE.Vector2();
const previousCameraPosition = new THREE.Vector3();
const previousCameraTarget = new THREE.Vector3();
const cameraTransitionStartPosition = new THREE.Vector3();
const cameraTransitionEndPosition = new THREE.Vector3();
const cameraTransitionStartQuaternion = new THREE.Quaternion();
const cameraTransitionEndQuaternion = new THREE.Quaternion();
const cameraTransitionEndTarget = new THREE.Vector3();
const animatedCameraPosition = new THREE.Vector3();
const animatedCameraQuaternion = new THREE.Quaternion();
const transitionLookCamera = new THREE.PerspectiveCamera();
const cameraTransitionOrbitCenter = new THREE.Vector3();
const cameraTransitionOrbitStartOffset = new THREE.Vector3();
const cameraTransitionOrbitEndOffset = new THREE.Vector3();
let cameraTransitionOrbitRadius = 0;
const autoOrbitTarget = new THREE.Vector3();
let autoOrbitRadius = 0;
let autoOrbitHeight = 0;
let autoOrbitAngle = 0;
let isAutoOrbitEnabled = false;
let isAutoOrbitArming = false;
const laserAnchorAxis = new THREE.Vector3();
const laserAnchorOffset = new THREE.Vector3();
const defaultHoverDebugColor = new THREE.Color("#8ec5ff");
const activeHoverDebugColor = new THREE.Color("#ffd166");
const defaultHoverFaceColor = new THREE.Color("#8ec5ff");
const activeHoverFaceColor = new THREE.Color("#ffd166");
const showHoverDebugHelpers = false;
const dmdFace1TextureUrl = new URL(
  "../frame_100_endo/02_gray_clahe.png",
  import.meta.url,
).href;
const dmdFace2TextureUrl = new URL(
  "../dmd_laplacian_3bit_fast_ramp.png",
  import.meta.url,
).href;
const hoverDebugYawByCameraKey = new Map([
  ["laser-assembly", THREE.MathUtils.degToRad(-12.5)],
  ["fourier-lens-1", THREE.MathUtils.degToRad(12.5)],
  ["fourier-lens-2", THREE.MathUtils.degToRad(-12.5)],
  ["camera", THREE.MathUtils.degToRad(-12.5)],
]);
const hoverDebugFrontFaceByCameraKey = new Map([
  ["laser-assembly", "south"],
  ["dmd-1", "east"],
  ["fourier-lens-1", "west"],
  ["dmd-2", "west"],
  ["fourier-lens-2", "east"],
  ["camera", "east"],
]);
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
let cameraTransition = null;
const textureLoader = new THREE.TextureLoader();
const dmdFace2Aspect = 1.862652322165395;
const createHeightFitTexture = (url, targetAspect) => {
  const texture = textureLoader.load(url, (loadedTexture) => {
    const sourceImage = loadedTexture.image;

    if (!sourceImage) {
      return;
    }

    const sourceWidth = sourceImage.naturalWidth ?? sourceImage.width;
    const sourceHeight = sourceImage.naturalHeight ?? sourceImage.height;
    const sourceAspect = sourceWidth / sourceHeight;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sourceHeight * targetAspect);
    canvas.height = sourceHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Fit vertically only. Preserve source aspect and crop horizontally if needed.
    const drawWidth = sourceHeight * sourceAspect;
    const offsetX = (canvas.width - drawWidth) * 0.5;
    context.drawImage(sourceImage, offsetX, 0, drawWidth, sourceHeight);

    loadedTexture.image = canvas;
    loadedTexture.needsUpdate = true;
  });

  texture.matrixAutoUpdate = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  return texture;
};
const dmdFace1Texture = textureLoader.load(dmdFace1TextureUrl);
dmdFace1Texture.matrixAutoUpdate = false;
dmdFace1Texture.colorSpace = THREE.SRGBColorSpace;
dmdFace1Texture.flipY = false;
dmdFace1Texture.matrix.setUvTransform(
  1 + 0.203083336353302 / (0.7969167232513428 - 0.203083336353302),
  1 + 0.20308327674865723 / (0.796916663646698 - 0.20308327674865723),
  -1 / (0.7969167232513428 - 0.203083336353302),
  -1 / (0.796916663646698 - 0.20308327674865723),
  0,
  0,
  0,
);
const createDmdFace2Texture = (url) => {
  const texture = createHeightFitTexture(url, dmdFace2Aspect);
  texture.matrix.setUvTransform(
    -0.203083336353302 / (0.7969167232513428 - 0.203083336353302),
    -0.20308327674865723 / (0.796916663646698 - 0.20308327674865723),
    1 / (0.7969167232513428 - 0.203083336353302),
    1 / (0.796916663646698 - 0.20308327674865723),
    0,
    0,
    0,
  );
  return texture;
};
const dmdFace2TexturesByKernel = {
  laplacian: createDmdFace2Texture(kernelMediaByKey.laplacian.dmd),
  "sobel-x": createDmdFace2Texture(kernelMediaByKey["sobel-x"].dmd),
  "sobel-y": createDmdFace2Texture(kernelMediaByKey["sobel-y"].dmd),
};
const brightenDmdFaceMaterial = (material, texture) => {
  const texturedMaterial = material.clone();
  texturedMaterial.map = texture;

  if ("color" in texturedMaterial) {
    texturedMaterial.color.setRGB(1.35, 1.35, 1.35);
  }

  if ("emissive" in texturedMaterial) {
    texturedMaterial.emissive.setRGB(0.28, 0.28, 0.28);
    texturedMaterial.emissiveIntensity = 0.45;
  }

  texturedMaterial.needsUpdate = true;
  return texturedMaterial;
};

const syncDmdFace2Texture = () => {
  const texture = dmdFace2TexturesByKernel[selectedKernelKey];

  for (const material of dmdFace2Materials) {
    material.map = texture;
    material.needsUpdate = true;
  }
};

const isMeaningfulNodeName = (name) => {
  if (!name) {
    return false;
  }

  return !/(plane|circle)/i.test(name);
};

const hasNamedAncestor = (object, targetName) => {
  let current = object;
  const normalizedTargetName = targetName.toLowerCase().replace(/[\s_]+/g, "");

  while (current) {
    const normalizedCurrentName = (current.name ?? "")
      .toLowerCase()
      .replace(/[\s_]+/g, "");

    if (normalizedCurrentName === normalizedTargetName) {
      return true;
    }

    current = current.parent;
  }

  return false;
};

const toCameraKey = (label) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getNumberedFocusTitle = (cameraKey, fallbackLabel) =>
  numberedFocusTitleByCameraKey.get(cameraKey) ?? fallbackLabel;

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
        label: getNumberedFocusTitle("laser-assembly", "Laser Assembly"),
        cameraKey: "laser-assembly",
      };
    }

    if (isMeaningfulNodeName(current.name)) {
      const label = formatHoverLabel(current.name);
      const cameraKey = toCameraKey(label);
      return {
        id: current.uuid,
        objects: [current],
        label: getNumberedFocusTitle(cameraKey, label),
        cameraKey,
      };
    }

    current = current.parent;
  }

  const label = formatHoverLabel(object.name);
  const cameraKey = toCameraKey(label);
  return {
    id: object.uuid,
    objects: [object],
    label: getNumberedFocusTitle(cameraKey, label),
    cameraKey,
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
  if (isFocusLocked) {
    if (
      currentFocusedCameraKey === "laser-assembly" &&
      hoveredAssemblyFocusPartId
    ) {
      const hoveredPart = persistentFocusLabelTargets.get(
        hoveredAssemblyFocusPartId,
      );
      const outlineObjects = [];

      hoveredPart?.object?.traverse((child) => {
        if (child.isMesh && child.visible) {
          outlineObjects.push(child);
        }
      });

      outlinePass.selectedObjects = outlineObjects;
      return;
    }

    outlinePass.selectedObjects = [];
    return;
  }

  outlinePass.selectedObjects = hoveredSelectionObjects;
};

const getFocusIndex = (cameraKey) => orderedFocusCameraKeys.indexOf(cameraKey);

const syncFocusBackButton = () => {
  const focusedIndex = getFocusIndex(currentFocusedCameraKey);
  focusControls.classList.toggle("is-visible", isFocusLocked);
  focusPrevButton.disabled = !isFocusLocked || focusedIndex <= 0;
  focusNextButton.disabled =
    !isFocusLocked ||
    focusedIndex === -1 ||
    focusedIndex >= orderedFocusCameraKeys.length - 1;
};

const syncCameraViewOffset = () => {
  const viewportWidth = window.innerWidth;
  const isDesktopFocusRail =
    isFocusLocked &&
    !isCinematicModeEnabled &&
    viewportWidth > 720 &&
    focusPanel.classList.contains("is-visible");

  targetCameraViewOffsetPx = isDesktopFocusRail
    ? focusPanel.getBoundingClientRect().width
    : 0;
};

const updateCameraViewOffset = (deltaMs) => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const blend = 1 - Math.exp(-deltaMs / 140);

  currentCameraViewOffsetPx = THREE.MathUtils.lerp(
    currentCameraViewOffsetPx,
    targetCameraViewOffsetPx,
    blend,
  );

  if (Math.abs(currentCameraViewOffsetPx - targetCameraViewOffsetPx) < 0.5) {
    currentCameraViewOffsetPx = targetCameraViewOffsetPx;
  }

  if (currentCameraViewOffsetPx <= 0.01) {
    camera.clearViewOffset();
    camera.aspect = viewportWidth / viewportHeight;
    camera.updateProjectionMatrix();
    return;
  }

  const fullWidth = viewportWidth + currentCameraViewOffsetPx;
  camera.setViewOffset(
    fullWidth,
    viewportHeight,
    currentCameraViewOffsetPx,
    0,
    viewportWidth,
    viewportHeight,
  );
  camera.aspect = fullWidth / viewportHeight;
  camera.updateProjectionMatrix();
};

const syncFocusPanel = () => {
  const info = currentFocusedCameraKey
    ? focusInfoByCameraKey.get(currentFocusedCameraKey)
    : null;
  const showPanel = isFocusLocked && Boolean(info) && !isCinematicModeEnabled;
  const showKernelSelector = kernelSelectableCameraKeys.has(
    currentFocusedCameraKey,
  );
  const mediaRows = info?.getMediaRows
    ? info.getMediaRows(selectedKernelKey)
    : null;
  const mediaItems = mediaRows
    ? mediaRows.flatMap((row) => row.items)
    : info?.getMedia
      ? info.getMedia(selectedKernelKey)
      : (info?.media ?? []);
  const mediaCaption = info?.getMediaCaption
    ? info.getMediaCaption(selectedKernelKey)
    : info?.mediaCaption;

  focusPanel.classList.toggle("is-visible", showPanel);
  focusPanelTitle.textContent = info?.title ?? "";
  focusPanelBody.replaceChildren();

  if (info?.bodyLead || info?.bodyBullets?.length) {
    if (info.bodyLead) {
      const lead = document.createElement("p");
      lead.className = "focus-panel-body-paragraph";
      lead.textContent = info.bodyLead;
      focusPanelBody.append(lead);
    }

    if (info.bodyBullets?.length) {
      const list = document.createElement("ul");
      list.className = "focus-panel-body-list";

      for (const item of info.bodyBullets) {
        const listItem = document.createElement("li");
        const separatorIndex = item.indexOf(":");

        if (separatorIndex !== -1) {
          const label = document.createElement("strong");
          label.textContent = item.slice(0, separatorIndex + 1);
          listItem.append(label, ` ${item.slice(separatorIndex + 1).trim()}`);
        } else {
          listItem.textContent = item;
        }

        list.append(listItem);
      }

      focusPanelBody.append(list);
    }
  } else {
    focusPanelBody.textContent = info?.body ?? "";
  }
  focusPanelToolbar.classList.toggle("is-visible", showKernelSelector);
  focusPanelKernelSelect.value = selectedKernelKey;
  focusPanelMedia.replaceChildren();

  const appendMediaItem = (mediaItem) => {
    const figure = document.createElement("figure");
    figure.className = "focus-panel-media-card";
    if (mediaItem.span === "full") {
      figure.classList.add("is-full");
    }

    const image = document.createElement("img");
    image.className = "focus-panel-media-image";
    image.src = mediaItem.src;
    image.alt = mediaItem.alt;
    image.loading = "lazy";

    figure.append(image);

    if (mediaItem.label) {
      const itemCaption = document.createElement("figcaption");
      itemCaption.className = "focus-panel-media-item-caption";
      itemCaption.textContent = mediaItem.label;
      figure.append(itemCaption);
    }

    focusPanelMedia.append(figure);
  };

  if (mediaRows) {
    for (const row of mediaRows) {
      for (const mediaItem of row.items) {
        appendMediaItem(mediaItem);
      }

      if (row.caption) {
        const rowCaption = document.createElement("p");
        rowCaption.className = "focus-panel-media-caption";
        rowCaption.textContent = row.caption;
        focusPanelMedia.append(rowCaption);
      }
    }
  } else {
    for (const mediaItem of mediaItems) {
      appendMediaItem(mediaItem);
    }
  }

  if (mediaCaption) {
    const caption = document.createElement("p");
    caption.className = "focus-panel-media-caption";
    caption.textContent = mediaCaption;
    focusPanelMedia.append(caption);
  }

  if (focusPanelTransitionFrame !== null) {
    cancelAnimationFrame(focusPanelTransitionFrame);
    focusPanelTransitionFrame = null;
  }
  if (focusPanelTransitionTimeout !== null) {
    clearTimeout(focusPanelTransitionTimeout);
    focusPanelTransitionTimeout = null;
  }

  if (showPanel) {
    focusPanel.classList.remove("is-content-entering");
    void focusPanel.offsetWidth;
    focusPanel.classList.add("is-content-entering");
    focusPanelTransitionFrame = requestAnimationFrame(() => {
      focusPanelTransitionFrame = null;
      focusPanelTransitionTimeout = setTimeout(() => {
        focusPanel.classList.remove("is-content-entering");
        focusPanelTransitionTimeout = null;
      }, 280);
    });
  }

  syncCameraViewOffset();
};

focusPanelKernelSelect.addEventListener("change", (event) => {
  selectedKernelKey = event.target.value;
  syncDmdFace2Texture();
  syncFocusPanel();
});

const enforceCameraFloor = () => {
  if (controls.target.y < 0) {
    controls.target.y = 0;
    controls.update();
  }
};

const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);

const getFrontFaceDirection = (faceName) => {
  switch (faceName) {
    case "east":
      return new THREE.Vector3(1, 0, 0);
    case "west":
      return new THREE.Vector3(-1, 0, 0);
    case "north":
      return new THREE.Vector3(0, 0, -1);
    case "south":
    default:
      return new THREE.Vector3(0, 0, 1);
  }
};

const getFocusPlaneSize = (faceName, boxSize) => {
  switch (faceName) {
    case "east":
    case "west":
      return focusPlaneSize.set(boxSize.z, boxSize.y);
    case "north":
    case "south":
    default:
      return focusPlaneSize.set(boxSize.x, boxSize.y);
  }
};

const getCameraTransitionDuration = (position, target) => {
  const travelDistance = camera.position.distanceTo(position);
  const distanceMs = travelDistance * 52;

  return THREE.MathUtils.clamp(260 + distanceMs, 420, 950);
};

const startOrbitCameraTransition = (
  position,
  target,
  durationMs = null,
  onComplete,
) => {
  cameraTransitionOrbitCenter.copy(target);
  cameraTransitionOrbitStartOffset.copy(camera.position).sub(target);
  cameraTransitionOrbitEndOffset.copy(position).sub(target);
  cameraTransitionOrbitRadius = Math.max(
    cameraTransitionOrbitStartOffset.clone().setY(0).length(),
    cameraTransitionOrbitEndOffset.clone().setY(0).length(),
    0.001,
  );
  cameraTransitionEndPosition.copy(position);
  cameraTransitionEndTarget.copy(target);

  controls.enabled = false;
  cameraTransition = {
    startedAt: performance.now(),
    durationMs: durationMs ?? getCameraTransitionDuration(position, target),
    onComplete,
    mode: "orbit",
  };
};

const startCameraTransition = (
  position,
  target,
  durationMs = null,
  onComplete,
) => {
  cameraTransitionStartPosition.copy(camera.position);
  cameraTransitionEndPosition.copy(position);
  cameraTransitionEndTarget.copy(target);
  cameraTransitionStartQuaternion.copy(camera.quaternion);

  transitionLookCamera.position.copy(position);
  transitionLookCamera.up.copy(camera.up);
  transitionLookCamera.lookAt(target);
  cameraTransitionEndQuaternion.copy(transitionLookCamera.quaternion);

  controls.enabled = false;
  cameraTransition = {
    startedAt: performance.now(),
    durationMs: durationMs ?? getCameraTransitionDuration(position, target),
    onComplete,
    mode: "linear",
  };
};

const updateCameraTransition = (now) => {
  if (!cameraTransition) {
    return;
  }

  const progress = THREE.MathUtils.clamp(
    (now - cameraTransition.startedAt) / cameraTransition.durationMs,
    0,
    1,
  );
  const easedProgress = easeOutCubic(progress);

  if (cameraTransition.mode === "orbit") {
    const startAngle = Math.atan2(
      cameraTransitionOrbitStartOffset.z,
      cameraTransitionOrbitStartOffset.x,
    );
    let angleDelta =
      Math.atan2(
        cameraTransitionOrbitEndOffset.z,
        cameraTransitionOrbitEndOffset.x,
      ) - startAngle;

    if (angleDelta > Math.PI) {
      angleDelta -= Math.PI * 2;
    } else if (angleDelta < -Math.PI) {
      angleDelta += Math.PI * 2;
    }

    const orbitAngle = startAngle + angleDelta * easedProgress;

    animatedCameraPosition.set(
      cameraTransitionOrbitCenter.x +
        Math.cos(orbitAngle) * cameraTransitionOrbitRadius,
      THREE.MathUtils.lerp(
        cameraTransitionOrbitCenter.y + cameraTransitionOrbitStartOffset.y,
        cameraTransitionOrbitCenter.y + cameraTransitionOrbitEndOffset.y,
        easedProgress,
      ),
      cameraTransitionOrbitCenter.z +
        Math.sin(orbitAngle) * cameraTransitionOrbitRadius,
    );
    camera.position.copy(animatedCameraPosition);
    transitionLookCamera.position.copy(animatedCameraPosition);
    transitionLookCamera.up.copy(camera.up);
    transitionLookCamera.lookAt(cameraTransitionEndTarget);
    camera.quaternion.copy(transitionLookCamera.quaternion);
  } else {
    animatedCameraPosition.lerpVectors(
      cameraTransitionStartPosition,
      cameraTransitionEndPosition,
      easedProgress,
    );
    animatedCameraQuaternion.slerpQuaternions(
      cameraTransitionStartQuaternion,
      cameraTransitionEndQuaternion,
      easedProgress,
    );

    camera.position.copy(animatedCameraPosition);
    camera.quaternion.copy(animatedCameraQuaternion);
  }

  camera.updateMatrixWorld();

  if (progress < 1) {
    return;
  }

  camera.position.copy(cameraTransitionEndPosition);
  camera.quaternion.copy(cameraTransitionEndQuaternion);
  controls.target.copy(cameraTransitionEndTarget);
  controls.update();
  controls.enabled = true;
  camera.updateMatrixWorld();
  const onComplete = cameraTransition.onComplete;
  cameraTransition = null;
  onComplete?.();
};

const syncHoverDebugHelpers = () => {
  for (const [selectionId, debugData] of hoverDebugHelpers) {
    hoverDebugBox.makeEmpty();

    for (const object of debugData.objects) {
      hoverDebugBox.expandByObject(object);
    }

    debugData.helper.visible =
      showHoverDebugHelpers && !hoverDebugBox.isEmpty();

    if (!debugData.helper.visible) {
      continue;
    }

    hoverDebugBox.getCenter(hoverDebugCenter);
    hoverDebugBox.getSize(hoverDebugSize);
    debugData.helper.position.copy(hoverDebugCenter);
    debugData.helper.scale.copy(hoverDebugSize);
    debugData.helper.rotation.set(0, debugData.yaw, 0);
    debugData.helper.material.color.copy(
      selectionId === hoveredSelectionId
        ? activeHoverDebugColor
        : defaultHoverDebugColor,
    );
    debugData.face.material.color.copy(
      selectionId === hoveredSelectionId
        ? activeHoverFaceColor
        : defaultHoverFaceColor,
    );
    debugData.face.visible = true;
    debugData.helper.updateMatrixWorld(true);
  }
};

const applyFrontFaceTransform = (faceMesh, faceName) => {
  const offset = 0.501;

  faceMesh.position.set(0, 0, 0);
  faceMesh.rotation.set(0, 0, 0);

  switch (faceName) {
    case "east":
      faceMesh.position.x = offset;
      faceMesh.rotation.y = Math.PI / 2;
      break;
    case "west":
      faceMesh.position.x = -offset;
      faceMesh.rotation.y = -Math.PI / 2;
      break;
    case "south":
      faceMesh.position.z = offset;
      break;
    case "north":
      faceMesh.position.z = -offset;
      faceMesh.rotation.y = Math.PI;
      break;
    default:
      break;
  }
};

const registerHoverDebugHelper = (selection) => {
  if (!selection || hoverDebugHelpers.has(selection.id)) {
    return;
  }

  const helper = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: defaultHoverDebugColor.clone() }),
  );
  helper.material.transparent = true;
  helper.material.opacity = 0.95;
  helper.material.depthTest = false;
  helper.renderOrder = 1000;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: defaultHoverFaceColor.clone(),
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  face.renderOrder = 999;
  applyFrontFaceTransform(
    face,
    hoverDebugFrontFaceByCameraKey.get(selection.cameraKey) ?? "south",
  );
  helper.add(face);
  scene.add(helper);
  hoverDebugHelpers.set(selection.id, {
    helper,
    face,
    objects: selection.objects,
    cameraKey: selection.cameraKey,
    label: selection.label,
    yaw: hoverDebugYawByCameraKey.get(selection.cameraKey) ?? 0,
    frontFace:
      hoverDebugFrontFaceByCameraKey.get(selection.cameraKey) ?? "south",
  });

  if (orderedFocusCameraKeys.includes(selection.cameraKey)) {
    focusSelectionIdsByCameraKey.set(selection.cameraKey, selection.id);
  }
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

const hidePersistentFocusLabels = () => {
  for (const { id, label } of persistentFocusLabelTargets.values()) {
    const element = getHoverLabelElement(`focus-${id}`, label);
    element.classList.remove("is-visible");
    element.classList.remove("is-active");
  }
};

const hideAllGeneralHoverLabels = () => {
  for (const [selectionId, debugData] of hoverDebugHelpers) {
    const element = getHoverLabelElement(selectionId, debugData.label);
    element.classList.remove("is-visible");
    element.classList.remove("is-active");
  }
};

const updatePersistentFocusLabels = () => {
  if (currentFocusedCameraKey !== "laser-assembly") {
    hidePersistentFocusLabels();
    return;
  }

  for (const { id, object, label } of persistentFocusLabelTargets.values()) {
    const element = getHoverLabelElement(`focus-${id}`, label);
    element.classList.toggle("is-active", hoveredAssemblyFocusPartId === id);

    if (!object?.visible) {
      element.classList.remove("is-visible");
      continue;
    }

    hoverLabelBounds.setFromObject(object);

    if (hoverLabelBounds.isEmpty()) {
      element.classList.remove("is-visible");
      continue;
    }

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
      element.classList.remove("is-visible");
      continue;
    }

    const x = (hoverLabelProjection.x + 1) * 0.5 * viewerShell.clientWidth;
    const y = (1 - hoverLabelProjection.y) * 0.5 * viewerShell.clientHeight;
    element.textContent = label;
    element.style.setProperty("--hover-label-x", `${x}px`);
    element.style.setProperty("--hover-label-y", `${y}px`);
    element.classList.add("is-visible");
  }
};

const updateAssemblyFocusHover = () => {
  if (!isFocusLocked || currentFocusedCameraKey !== "laser-assembly") {
    if (hoveredAssemblyFocusPartId) {
      hoveredAssemblyFocusPartId = null;
      syncHoveredOutline();
    }
    return;
  }

  const assemblyHoverObjects = [];

  for (const [id, entry] of persistentFocusLabelTargets) {
    if (!entry.object?.visible) {
      continue;
    }

    assemblyHoverObjects.push(entry.object);
  }

  raycaster.setFromCamera(pointer, camera);
  const [intersection] = raycaster.intersectObjects(assemblyHoverObjects, true);
  let nextHoveredId = null;

  if (intersection?.object) {
    let current = intersection.object;

    while (current && !nextHoveredId) {
      for (const [id, entry] of persistentFocusLabelTargets) {
        if (current === entry.object) {
          nextHoveredId = id;
          break;
        }
      }

      current = current.parent;
    }
  }

  if (nextHoveredId === hoveredAssemblyFocusPartId) {
    return;
  }

  hoveredAssemblyFocusPartId = nextHoveredId;
  syncHoveredOutline();
};

const updateAllHoverLabels = () => {
  if (isFocusLocked || !areAllHoverLabelsVisible) {
    hideAllGeneralHoverLabels();
    return;
  }

  for (const [selectionId, debugData] of hoverDebugHelpers) {
    hoverLabelBounds.makeEmpty();

    for (const object of debugData.objects) {
      if (object.visible) {
        hoverLabelBounds.expandByObject(object);
      }
    }

    const element = getHoverLabelElement(selectionId, debugData.label);
    element.classList.toggle("is-active", selectionId === hoveredSelectionId);

    if (hoverLabelBounds.isEmpty()) {
      element.classList.remove("is-visible");
      continue;
    }

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
      element.classList.remove("is-visible");
      continue;
    }

    const x = (hoverLabelProjection.x + 1) * 0.5 * viewerShell.clientWidth;
    const y = (1 - hoverLabelProjection.y) * 0.5 * viewerShell.clientHeight;
    element.textContent = debugData.label;
    element.style.setProperty("--hover-label-x", `${x}px`);
    element.style.setProperty("--hover-label-y", `${y}px`);
    element.classList.add("is-visible");
  }
};

const updateHoverLabel = () => {
  if (areAllHoverLabelsVisible) {
    if (activeHoverLabel) {
      activeHoverLabel.classList.remove("is-visible");
      activeHoverLabel = null;
    }
    updateAllHoverLabels();
    return;
  }

  if (isFocusLocked || !hoveredSelectionObjects.length) {
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

const syncGuiVisibility = () => {
  gui.domElement.style.display = areGuiPanelsVisible ? "" : "none";
  meshGui.domElement.style.display = areGuiPanelsVisible ? "" : "none";
};

const handleKeyDown = (event) => {
  const activeTagName = document.activeElement?.tagName ?? "";
  const isTypingIntoControl =
    /^(INPUT|TEXTAREA|SELECT)$/i.test(activeTagName) ||
    document.activeElement?.isContentEditable;

  if (isTypingIntoControl) {
    return;
  }

  if (event.shiftKey && event.code === "KeyL") {
    event.preventDefault();
    areGuiPanelsVisible = !areGuiPanelsVisible;
    syncGuiVisibility();
    return;
  }

  if (event.code === "KeyL") {
    event.preventDefault();
    startLaserAnimation();
    return;
  }

  if (event.code === "KeyZ") {
    event.preventDefault();
    areAllHoverLabelsVisible = !areAllHoverLabelsVisible;
    if (!areAllHoverLabelsVisible) {
      hideAllGeneralHoverLabels();
    }
    updateHoverLabel();
    return;
  }

  if (event.code === "KeyK") {
    event.preventDefault();
    stopLaserAnimation();
    return;
  }

  if (event.code === "KeyR") {
    event.preventDefault();
    stopAutoOrbit();
    applySavedView?.("default");
    return;
  }

  if (event.code === "KeyC") {
    event.preventDefault();
    isCinematicModeEnabled = !isCinematicModeEnabled;
    syncFocusPanel();
    return;
  }

  if (
    event.code === "KeyX" &&
    isFocusLocked &&
    kernelSelectableCameraKeys.has(currentFocusedCameraKey)
  ) {
    event.preventDefault();
    const currentKernelIndex = kernelKeys.indexOf(selectedKernelKey);
    const nextKernelIndex = (currentKernelIndex + 1) % kernelKeys.length;
    selectedKernelKey = kernelKeys[nextKernelIndex];
    syncDmdFace2Texture();
    syncFocusPanel();
    return;
  }

  if (event.code === "KeyO") {
    event.preventDefault();
    if (!isFocusLocked) {
      toggleAutoOrbit();
    }
    return;
  }

  if (event.code === "ArrowLeft") {
    event.preventDefault();

    if (isFocusLocked) {
      stepFocusedSelection(-1);
      return;
    }

    cycleOverviewView(-1);
    return;
  }

  if (event.code === "ArrowRight") {
    event.preventDefault();

    if (isFocusLocked) {
      stepFocusedSelection(1);
      return;
    }

    cycleOverviewView(1);
    return;
  }

  if (event.code === "ArrowUp" && !isFocusLocked) {
    event.preventDefault();
    applySavedView?.("top");
  }
};

const cycleOverviewView = (step) => {
  const currentHorizontalView =
    currentOverviewViewName === "top"
      ? lastHorizontalOverviewViewName
      : horizontalOverviewViews.includes(currentOverviewViewName)
        ? currentOverviewViewName
        : "front";
  const currentIndex = horizontalOverviewViews.indexOf(currentHorizontalView);
  const nextIndex =
    (currentIndex + step + horizontalOverviewViews.length) %
    horizontalOverviewViews.length;

  applySavedView?.(horizontalOverviewViews[nextIndex]);
};

const stopAutoOrbit = () => {
  if (!isAutoOrbitEnabled && !isAutoOrbitArming) {
    return;
  }

  isAutoOrbitEnabled = false;
  isAutoOrbitArming = false;
  if (cameraTransition) {
    cameraTransition = null;
  }
  controls.enabled = true;
};

const toggleAutoOrbit = () => {
  if (!applySavedView) {
    return;
  }

  if (isAutoOrbitEnabled) {
    stopAutoOrbit();
    return;
  }

  if (cameraTransition) {
    cameraTransition = null;
  }

  isAutoOrbitArming = true;
  controls.enabled = false;
  const orbitStartPosition = new THREE.Vector3(
    autoOrbitTarget.x + Math.cos(autoOrbitAngle) * autoOrbitRadius,
    autoOrbitTarget.y + autoOrbitHeight,
    autoOrbitTarget.z + Math.sin(autoOrbitAngle) * autoOrbitRadius,
  );
  startOrbitCameraTransition(orbitStartPosition, autoOrbitTarget, null, () => {
    isAutoOrbitArming = false;
    isAutoOrbitEnabled = true;
    controls.enabled = false;
  });
};

const focusSelection = (selectionId, { preservePreviousView = false } = {}) => {
  stopAutoOrbit();

  if (!selectionId || !hoverDebugHelpers.has(selectionId)) {
    return;
  }

  const debugData = hoverDebugHelpers.get(selectionId);
  hoverDebugBox.makeEmpty();

  for (const object of debugData.objects) {
    hoverDebugBox.expandByObject(object);
  }

  if (hoverDebugBox.isEmpty()) {
    return;
  }

  hoverDebugBox.getCenter(focusCameraTarget);
  hoverDebugBox.getSize(hoverDebugSize);
  focusFrontDirection
    .copy(getFrontFaceDirection(debugData.frontFace))
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), debugData.yaw)
    .normalize();

  const frontHalfExtent =
    (Math.abs(focusFrontDirection.x) * hoverDebugSize.x +
      Math.abs(focusFrontDirection.z) * hoverDebugSize.z) *
    0.5;

  focusCameraTarget
    .addScaledVector(focusFrontDirection, frontHalfExtent)
    .add(new THREE.Vector3(0, hoverDebugSize.y * 0.5, 0));

  const planeSize = getFocusPlaneSize(debugData.frontFace, hoverDebugSize);
  const verticalDistance =
    (planeSize.y * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const horizontalFov =
    2 *
    Math.atan(
      Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * camera.aspect,
    );
  const horizontalDistance =
    (planeSize.x * 0.5) / Math.tan(horizontalFov * 0.5);
  const distance =
    Math.max(
      verticalDistance,
      horizontalDistance,
      hoverDebugSize.length() * 0.35,
    ) * 1.1;

  focusCameraPosition
    .copy(focusCameraTarget)
    .addScaledVector(focusFrontDirection, distance)
    .add(new THREE.Vector3(0, hoverDebugSize.y * 0.3, 0));

  if (preservePreviousView) {
    previousCameraPosition.copy(camera.position);
    previousCameraTarget.copy(controls.target);
  }

  hoveredSelectionId = selectionId;
  hoveredSelectionObjects = debugData.objects;
  hoveredSelectionLabel = debugData.label;
  hoveredSelectionCameraKey = debugData.cameraKey;
  hoveredAssemblyFocusPartId = null;
  currentFocusedCameraKey = debugData.cameraKey;
  isFocusLocked = true;
  syncHoveredOutline();
  syncHoverDebugHelpers();
  updateHoverLabel();
  syncFocusBackButton();
  syncFocusPanel();
  startCameraTransition(focusCameraPosition, focusCameraTarget);
};

const focusCameraOnSelection = () => {
  if (isFocusLocked || !hoveredSelectionId) {
    return;
  }

  focusSelection(hoveredSelectionId, { preservePreviousView: true });
};

const stepFocusedSelection = (step) => {
  if (!isFocusLocked) {
    return;
  }

  const currentIndex = getFocusIndex(currentFocusedCameraKey);

  if (currentIndex === -1) {
    return;
  }

  const nextIndex = THREE.MathUtils.clamp(
    currentIndex + step,
    0,
    orderedFocusCameraKeys.length - 1,
  );

  if (nextIndex === currentIndex) {
    return;
  }

  const nextSelectionId = focusSelectionIdsByCameraKey.get(
    orderedFocusCameraKeys[nextIndex],
  );

  if (!nextSelectionId) {
    return;
  }

  focusSelection(nextSelectionId);
};

const exitFocusedSelection = () => {
  if (!isFocusLocked) {
    return;
  }

  isFocusLocked = false;
  currentFocusedCameraKey = null;
  hoveredAssemblyFocusPartId = null;
  hoveredSelectionId = null;
  hoveredSelectionObjects = [];
  hoveredSelectionLabel = "";
  hoveredSelectionCameraKey = null;
  syncHoveredOutline();
  hidePersistentFocusLabels();
  syncHoverDebugHelpers();
  updateHoverLabel();
  syncFocusBackButton();
  syncFocusPanel();

  applySavedView?.("default");
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
  hoveredAssemblyFocusPartId = null;
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
  syncHoverDebugHelpers();
  updateHoverLabel();
};

canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerleave", handlePointerLeave);
canvas.addEventListener("click", focusCameraOnSelection);
focusPrevButton.addEventListener("click", () => stepFocusedSelection(-1));
focusBackButton.addEventListener("click", exitFocusedSelection);
focusNextButton.addEventListener("click", () => stepFocusedSelection(1));
window.addEventListener("keydown", handleKeyDown);

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
  front: new THREE.Vector3(0, 0.7, 1),
  back: new THREE.Vector3(0, 0.7, -1),
  right: new THREE.Vector3(1, 0.7, 0),
  left: new THREE.Vector3(-1, 0.7, 0),
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
controls.maxPolarAngle = Math.PI / 2 - 0.01;

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

const tameFoundationBloom = (object, material) => {
  if (!material || (object.name?.toLowerCase() ?? "") !== "found") {
    return material;
  }

  if ("envMapIntensity" in material) {
    material.envMapIntensity = Math.min(material.envMapIntensity ?? 1, 0.01);
  }

  if ("metalness" in material) {
    material.metalness = Math.min(material.metalness ?? 1, 0.25);
  }

  if ("roughness" in material) {
    material.roughness = Math.max(material.roughness ?? 0, 0.9);
  }

  if ("color" in material && material.color) {
    material.color.multiplyScalar(0.82);
  }

  if ("emissiveIntensity" in material) {
    material.emissiveIntensity = 0;
  }

  return material;
};

const upgradeGlassMaterial = (material) => {
  const glass = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xb7dcff),
    metalness: 0,
    roughness: 0.006,
    transparent: true,
    opacity: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.004,
    reflectivity: 1,
    iridescence: 0.28,
    iridescenceIOR: 1.3,
    envMapIntensity: 4,
    specularIntensity: 1.35,
    specularColor: new THREE.Color(0xf4fbff),
    side: material.side ?? THREE.DoubleSide,
  });

  glass.name = material.name;
  glass.depthWrite = false;
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
    if (
      entry.scaleAxis === "x-anchor-min" ||
      entry.scaleAxis === "x-anchor-max"
    ) {
      laserAnchorAxis
        .set(1, 0, 0)
        .applyQuaternion(entry.object.quaternion)
        .normalize();
      const anchorEdgeX =
        entry.scaleAxis === "x-anchor-max"
          ? entry.anchorMaxX
          : entry.anchorMinX;
      laserAnchorOffset
        .copy(laserAnchorAxis)
        .multiplyScalar(anchorEdgeX * entry.originalScale.x);
      entry.object.position.copy(entry.originalPosition).add(laserAnchorOffset);
      entry.object.scale.set(0, entry.originalScale.y, entry.originalScale.z);
    } else {
      entry.object.scale.set(0, 0, 0);
    }
  }

  laserAnimationState = {
    sequence,
    index: 0,
    elapsed: 0,
  };
};

const stopLaserAnimation = () => {
  laserAnimationState = null;
  guiState.laserOpacity = 0;
  syncLaserMaterials();

  for (const entry of laserAnimationTargets.values()) {
    entry.object.visible = false;
    entry.object.position.copy(entry.originalPosition);
    entry.object.scale.copy(entry.originalScale);
  }
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
  if (
    current.scaleAxis === "x-anchor-min" ||
    current.scaleAxis === "x-anchor-max"
  ) {
    laserAnchorAxis
      .set(1, 0, 0)
      .applyQuaternion(current.object.quaternion)
      .normalize();
    const anchorEdgeX =
      current.scaleAxis === "x-anchor-max"
        ? current.anchorMaxX
        : current.anchorMinX;
    laserAnchorOffset
      .copy(laserAnchorAxis)
      .multiplyScalar((1 - progress) * anchorEdgeX * current.originalScale.x);
    current.object.position
      .copy(current.originalPosition)
      .add(laserAnchorOffset);
    current.object.scale.set(
      current.originalScale.x * progress,
      current.originalScale.y,
      current.originalScale.z,
    );
  } else {
    current.object.scale.copy(current.originalScale).multiplyScalar(progress);
  }

  if (progress < 1) {
    return;
  }

  current.object.position.copy(current.originalPosition);
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
syncGuiVisibility();

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

    if (object.geometry && !object.geometry.boundingBox) {
      object.geometry.computeBoundingBox();
    }

    const geometryBounds = object.geometry?.boundingBox;
    const size = geometryBounds
      ? geometryBounds.getSize(new THREE.Vector3())
      : new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    const visualLength = size.length();

    laserAnimationTargets.set(name, {
      object,
      originalPosition: object.position.clone(),
      originalScale: object.scale.clone(),
      duration: Math.max(visualLength * (name === "OGLAZ" ? 6 : 4) - 500, 80),
      scaleAxis:
        name === "DMD2"
          ? "x-anchor-max"
          : name === "DMD1" || name === "OGLAZ2" || name === "OGLAZ"
            ? "x-anchor-min"
            : "all",
      anchorMinX: geometryBounds?.min.x ?? -(size.x * 0.5),
      anchorMaxX: geometryBounds?.max.x ?? size.x * 0.5,
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
  persistentFocusLabelTargets.clear();

  model.traverse((child) => {
    const name = child.name?.toLowerCase() ?? "";

    if (groupedHoverEntityNames.has(name)) {
      groupedHoverObjects.push(child);
    }

    for (const definition of laserAssemblyFocusLabelDefinitions) {
      if (
        !persistentFocusLabelTargets.has(definition.id) &&
        definition.pattern.test(child.name ?? "")
      ) {
        persistentFocusLabelTargets.set(definition.id, {
          id: definition.id,
          object: child,
          label: definition.label,
        });
      }
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
  const defaultOrbitDirection = new THREE.Vector3(0, 0.3, 0.75).normalize();
  autoOrbitTarget.copy(framedCenter);
  autoOrbitRadius =
    defaultOrbitDirection.clone().setY(0).length() * fitDistance;
  autoOrbitHeight = defaultOrbitDirection.y * fitDistance;
  autoOrbitAngle = Math.atan2(defaultOrbitDirection.z, defaultOrbitDirection.x);

  applySavedView = (viewName, { instant = false } = {}) => {
    const viewDirection = savedViewDirections[viewName];

    if (!viewDirection) {
      return;
    }

    const position = framedCenter
      .clone()
      .add(viewDirection.clone().normalize().multiplyScalar(fitDistance));

    currentOverviewViewName = viewName;

    if (horizontalOverviewViews.includes(viewName)) {
      lastHorizontalOverviewViewName = viewName;
    }

    if (cameraTransition) {
      cameraTransition = null;
    }

    const target = framedCenter.clone();

    if (instant) {
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
      camera.updateMatrixWorld();
      return;
    }

    const shouldOrbitToView =
      horizontalOverviewViews.includes(viewName) &&
      camera.position.clone().sub(target).setY(0).lengthSq() > 1e-6;

    (shouldOrbitToView ? startOrbitCameraTransition : startCameraTransition)(
      position,
      target,
      null,
      () => {
        currentOverviewViewName = viewName;
      },
    );
  };

  applySavedView("default", { instant: true });
  camera.near = Math.max(maxDim / 100, 0.01);
  camera.far = Math.max(maxDim * 20, 100);
  camera.updateProjectionMatrix();
  syncCameraViewOffset();

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

    const childName = child.name?.toLowerCase() ?? "";

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
      registerHoverDebugHelper(getHoverSelection(child));
    }

    child.material = Array.isArray(child.material)
      ? materials.map((material) => {
          if (isLaserMaterial(material)) {
            const laserMaterial = upgradeLaserMaterial(material);
            laserMaterials.push(laserMaterial);
            return laserMaterial;
          }

          return tameFoundationBloom(
            child,
            isGlassMaterial(material)
              ? upgradeGlassMaterial(material)
              : material,
          );
        })
      : isLaserMaterial(child.material)
        ? (() => {
            const laserMaterial = upgradeLaserMaterial(child.material);
            laserMaterials.push(laserMaterial);
            return laserMaterial;
          })()
        : tameFoundationBloom(
            child,
            isGlassMaterial(child.material)
              ? upgradeGlassMaterial(child.material)
              : child.material,
          );

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

    if (hasNamedAncestor(child, "dmd 1")) {
      child.material = Array.isArray(child.material)
        ? child.material.map((material) => {
            if ((material?.name ?? "").toLowerCase() !== "dmdface1") {
              return material;
            }

            return brightenDmdFaceMaterial(material, dmdFace1Texture);
          })
        : (() => {
            if ((child.material?.name ?? "").toLowerCase() !== "dmdface1") {
              return child.material;
            }

            return brightenDmdFaceMaterial(child.material, dmdFace1Texture);
          })();
    }

    if (hasNamedAncestor(child, "dmd 2")) {
      child.material = Array.isArray(child.material)
        ? child.material.map((material) => {
            if ((material?.name ?? "").toLowerCase() !== "dmdface2") {
              return material;
            }

            const texturedMaterial = brightenDmdFaceMaterial(
              material,
              dmdFace2TexturesByKernel[selectedKernelKey],
            );
            dmdFace2Materials.push(texturedMaterial);
            return texturedMaterial;
          })
        : (() => {
            if ((child.material?.name ?? "").toLowerCase() !== "dmdface2") {
              return child.material;
            }

            const texturedMaterial = brightenDmdFaceMaterial(
              child.material,
              dmdFace2TexturesByKernel[selectedKernelKey],
            );
            dmdFace2Materials.push(texturedMaterial);
            return texturedMaterial;
          })();
    }

    child.receiveShadow = !hasGlass && !hasLaser;
  });

  controls.target.copy(framedCenter);
  controls.minDistance = Math.max(radius * 0.12, 0.35);
  controls.maxDistance = Math.max(radius * 8, 30);
  controls.update();
  syncFocusBackButton();
  syncHoverDebugHelpers();
  syncDmdFace2Texture();
  syncLaserMaterials();
  syncLighting();
  registerMeshVisibilityControls(model);
  registerLaserAnimationTargets(model);
});

const handleResize = () => {
  syncCameraViewOffset();
  updateCameraViewOffset(1000);
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

  updateCameraViewOffset(deltaMs);
  updateCameraTransition(now);
  if (isAutoOrbitEnabled && !isFocusLocked && !cameraTransition) {
    autoOrbitAngle += deltaMs * 0.0001;
    camera.position.set(
      autoOrbitTarget.x + Math.cos(autoOrbitAngle) * autoOrbitRadius,
      autoOrbitTarget.y + autoOrbitHeight,
      autoOrbitTarget.z + Math.sin(autoOrbitAngle) * autoOrbitRadius,
    );
    controls.target.copy(autoOrbitTarget);
    camera.lookAt(autoOrbitTarget);
    camera.updateMatrixWorld();
  } else if (!cameraTransition) {
    controls.update();
    enforceCameraFloor();
  }
  updateAssemblyFocusHover();
  syncHoverDebugHelpers();
  updateHoveredObject();
  updateHoverLabel();
  updatePersistentFocusLabels();
  updateLaserAnimation(deltaMs);
  composer.render();
  window.requestAnimationFrame(tick);
};

tick();
