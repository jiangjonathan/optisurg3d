import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const app = document.querySelector("#app");
app.innerHTML = `
  <div class="viewer-shell">
    <canvas class="viewer"></canvas>
  </div>
`;

const canvas = document.querySelector(".viewer");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe3e6ea);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(3, 2, 5);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(
  new RoomEnvironment(),
  0.04,
).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;

scene.add(new THREE.HemisphereLight(0xf3f6fb, 0xa8b0ba, 0.6));

const fillLight = new THREE.DirectionalLight(0xd7e3f4, 0.45);
fillLight.position.set(-6, 7, -4);
scene.add(fillLight);

const directionalLight = new THREE.DirectionalLight(0xfff6e8, 2.4);
directionalLight.position.set(8, 14, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(2048, 2048);
directionalLight.shadow.bias = -0.00015;
directionalLight.shadow.normalBias = 0.02;
scene.add(directionalLight);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(20, 64),
  new THREE.MeshStandardMaterial({
    color: 0xd7dbe0,
    roughness: 1,
    metalness: 0.01,
    envMapIntensity: 0.05,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
scene.add(ground);

const shadowCatcher = new THREE.Mesh(
  new THREE.CircleGeometry(20, 64),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.22 }),
);
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.position.y = -0.005;
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
    material.opacity < 1 ||
    material.transparent === true
  );
};

const upgradeGlassMaterial = (material) => {
  const glass = new THREE.MeshPhysicalMaterial({
    color: material.color?.clone() ?? new THREE.Color(0xdfe8f5),
    metalness: 0,
    roughness: 0.08,
    transparent: true,
    opacity: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    reflectivity: 0.9,
    envMapIntensity: 1.1,
    side: material.side ?? THREE.DoubleSide,
  });

  glass.name = material.name;
  return glass;
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
  scene.add(model);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = sphere.radius;

  model.position.sub(center);
  model.position.y += size.y / 2;

  const framedCenter = new THREE.Vector3(0, size.y * 0.42, 0);
  const viewDirection = new THREE.Vector3(1.15, 0.78, 1.25).normalize();
  const fitDistance = Math.max(radius * 2.15, 6);

  camera.position.copy(
    framedCenter.clone().add(viewDirection.multiplyScalar(fitDistance)),
  );
  camera.near = Math.max(maxDim / 100, 0.01);
  camera.far = Math.max(maxDim * 20, 100);
  camera.updateProjectionMatrix();

  const shadowCenter = new THREE.Vector3(0, size.y * 0.5, 0);
  directionalLight.position.set(
    radius * 1.8,
    size.y + radius * 2.6,
    radius * 1.6,
  );
  configureShadowCamera(directionalLight, shadowCenter, radius);
  scene.add(directionalLight.target);

  ground.scale.setScalar(Math.max(radius * 1.9, 20));

  model.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    child.material = Array.isArray(child.material)
      ? materials.map((material) =>
          isGlassMaterial(material) ? upgradeGlassMaterial(material) : material,
        )
      : isGlassMaterial(child.material)
        ? upgradeGlassMaterial(child.material)
        : child.material;

    const hasGlass = materials.some(isGlassMaterial);
    child.castShadow = !hasGlass;

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

    child.receiveShadow = !hasGlass;
  });

  controls.target.copy(framedCenter);
  controls.minDistance = Math.max(radius * 0.95, 3);
  controls.maxDistance = Math.max(radius * 5, 20);
  controls.update();

  ground.scale.setScalar(Math.max(radius * 1.9, 20));
  shadowCatcher.scale.setScalar(Math.max(radius * 1.9, 20));
});

const handleResize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};

window.addEventListener("resize", handleResize);

const tick = () => {
  controls.update();
  renderer.render(scene, camera);
  window.requestAnimationFrame(tick);
};

tick();
