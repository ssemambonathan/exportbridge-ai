import * as THREE from 'three';
import {
  createBurlapTexture,
  createContactShadowTexture,
  createContainerTexture,
  createQuayConcreteTexture,
  createWoodGrainTexture,
} from './textures.ts';

export type ContainerFinishPreset = 'forest' | 'navy' | 'sandstone';

export interface SceneMaterialSet {
  burlap: THREE.MeshStandardMaterial;
  palletWood: THREE.MeshStandardMaterial;
  polyStrap: THREE.MeshStandardMaterial;
  brassProbe: THREE.MeshPhysicalMaterial;
  containerShell: THREE.MeshPhysicalMaterial;
  containerSteelFrame: THREE.MeshStandardMaterial;
  reeferGrille: THREE.MeshStandardMaterial;
  inspectionGlass: THREE.MeshPhysicalMaterial;
  craneYellow: THREE.MeshStandardMaterial;
  craneDarkSteel: THREE.MeshStandardMaterial;
  quayConcrete: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  coastLand: THREE.MeshStandardMaterial;
  contactShadow: THREE.MeshBasicMaterial;
  plaqueMat: THREE.MeshStandardMaterial;
  waterTimeUniform: { value: number };
  setContainerFinish: (preset: ContainerFinishPreset) => void;
  dispose: () => void;
}

export function createSceneMaterials(
  maxAnisotropy: number,
  isSoftwareGl: boolean
): SceneMaterialSet {
  const burlapTex = createBurlapTexture(maxAnisotropy);
  const woodTex = createWoodGrainTexture(maxAnisotropy);
  const quayTex = createQuayConcreteTexture(maxAnisotropy);
  const shadowTex = createContactShadowTexture();

  const containerTextures: Record<ContainerFinishPreset, THREE.CanvasTexture> = {
    forest: createContainerTexture('#11382A', 'EB-20FT · MOMBASA', maxAnisotropy),
    navy: createContainerTexture('#1D3557', 'EB-20FT · HAMBURG', maxAnisotropy),
    sandstone: createContainerTexture('#6E5A42', 'EB-20FT · DJIBOUTI', maxAnisotropy),
  };

  const burlap = new THREE.MeshStandardMaterial({
    map: burlapTex,
    roughness: 0.92,
    metalness: 0.0,
  });

  const palletWood = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.86,
    metalness: 0.02,
  });

  const polyStrap = new THREE.MeshStandardMaterial({
    color: 0x162620,
    roughness: 0.34,
    metalness: 0.08,
  });

  const brassProbe = new THREE.MeshPhysicalMaterial({
    color: 0xc99a2e,
    roughness: 0.18,
    metalness: 0.94,
    anisotropy: 0.8,
    anisotropyRotation: 0.35,
    clearcoat: 0.4,
  });

  const containerShell = new THREE.MeshPhysicalMaterial({
    map: containerTextures.forest,
    roughness: 0.42,
    metalness: 0.55,
    clearcoat: 0.35,
    clearcoatRoughness: 0.28,
  });

  const containerSteelFrame = new THREE.MeshStandardMaterial({
    color: 0x262b29,
    roughness: 0.32,
    metalness: 0.85,
  });

  const reeferGrille = new THREE.MeshStandardMaterial({
    color: 0x4e5854,
    roughness: 0.28,
    metalness: 0.82,
  });

  const inspectionGlass = new THREE.MeshPhysicalMaterial({
    color: 0xdff2ef,
    metalness: 0.0,
    roughness: 0.08,
    transmission: isSoftwareGl ? 0 : 0.88,
    transparent: true,
    opacity: isSoftwareGl ? 0.38 : 1.0,
    ior: 1.52,
    thickness: 0.3,
    clearcoat: 1.0,
    depthWrite: false,
  });

  const craneYellow = new THREE.MeshStandardMaterial({
    color: 0xc89214,
    roughness: 0.38,
    metalness: 0.45,
  });

  const craneDarkSteel = new THREE.MeshStandardMaterial({
    color: 0x2a312f,
    roughness: 0.25,
    metalness: 0.88,
  });

  const quayConcrete = new THREE.MeshStandardMaterial({
    map: quayTex,
    roughness: 0.88,
    metalness: 0.02,
  });

  const waterTimeUniform = { value: 0 };
  const water = new THREE.MeshStandardMaterial({
    color: 0x1f4e5b,
    roughness: 0.16,
    metalness: 0.25,
  });
  water.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterTimeUniform;
    shader.vertexShader =
      `uniform float uTime;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float wave = sin(position.x * 0.45 + uTime * 1.1) * 0.08 + cos(position.z * 0.55 - uTime * 0.85) * 0.06;
        transformed.y += wave;`
      );
  };

  const coastLand = new THREE.MeshStandardMaterial({
    color: 0x5c6851,
    roughness: 0.94,
    metalness: 0.0,
  });

  const contactShadow = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.48,
  });

  const plaqueMat = new THREE.MeshStandardMaterial({
    color: 0x11382a,
    roughness: 0.45,
    metalness: 0.2,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const allMaterials: THREE.Material[] = [
    burlap,
    palletWood,
    polyStrap,
    brassProbe,
    containerShell,
    containerSteelFrame,
    reeferGrille,
    inspectionGlass,
    craneYellow,
    craneDarkSteel,
    quayConcrete,
    water,
    coastLand,
    contactShadow,
    plaqueMat,
  ];
  const allTextures: THREE.Texture[] = [
    burlapTex,
    woodTex,
    quayTex,
    shadowTex,
    containerTextures.forest,
    containerTextures.navy,
    containerTextures.sandstone,
  ];

  return {
    burlap,
    palletWood,
    polyStrap,
    brassProbe,
    containerShell,
    containerSteelFrame,
    reeferGrille,
    inspectionGlass,
    craneYellow,
    craneDarkSteel,
    quayConcrete,
    water,
    coastLand,
    contactShadow,
    plaqueMat,
    waterTimeUniform,
    setContainerFinish: (preset: ContainerFinishPreset) => {
      containerShell.map = containerTextures[preset];
      containerShell.needsUpdate = true;
    },
    dispose: () => {
      allMaterials.forEach((m) => m.dispose());
      allTextures.forEach((t) => t.dispose());
    },
  };
}
