import * as THREE from 'three';

function createCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return [canvas, ctx];
}

export function createBurlapTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 256);
  ctx.fillStyle = '#B8976B';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 6) {
    ctx.fillStyle = y % 12 === 0 ? 'rgba(90, 65, 36, 0.24)' : 'rgba(225, 200, 160, 0.14)';
    ctx.fillRect(0, y, 256, 3);
  }
  for (let x = 0; x < 256; x += 6) {
    ctx.fillStyle = x % 12 === 0 ? 'rgba(85, 60, 32, 0.22)' : 'rgba(235, 210, 175, 0.12)';
    ctx.fillRect(x, 0, 3, 256);
  }

  // Origin coffee sack stripe & stencil mark
  ctx.fillStyle = '#11382A';
  ctx.fillRect(0, 108, 256, 14);
  ctx.fillStyle = '#B8860B';
  ctx.fillRect(0, 124, 256, 5);
  ctx.fillStyle = '#2A2218';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('UG-AA WASHED', 42, 92);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createWoodGrainTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 256);
  ctx.fillStyle = '#8F6A42';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 64; i++) {
    const y = i * 4;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(55, 36, 18, 0.25)' : 'rgba(170, 130, 88, 0.14)';
    ctx.fillRect(0, y, 256, 2);
  }
  // Plank seams
  ctx.fillStyle = 'rgba(30, 20, 10, 0.45)';
  ctx.fillRect(0, 62, 256, 3);
  ctx.fillRect(0, 126, 256, 3);
  ctx.fillRect(0, 190, 256, 3);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createContainerTexture(
  baseHex: string,
  label: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(512, 256);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 256);

  // Corrugation vertical shading
  for (let x = 0; x < 512; x += 16) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(x, 0, 6, 256);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(x + 8, 0, 4, 256);
  }

  // ExportBridge stencil branding
  ctx.fillStyle = 'rgba(250, 248, 243, 0.92)';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('EXPORTBRIDGE', 40, 110);
  ctx.fillStyle = '#D1A12B';
  ctx.fillRect(40, 122, 180, 4);
  ctx.fillStyle = 'rgba(250, 248, 243, 0.85)';
  ctx.font = '600 15px monospace';
  ctx.fillText(label, 40, 148);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createQuayConcreteTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(512, 512);
  ctx.fillStyle = '#C9C3B4';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle aggregate speckle
  for (let i = 0; i < 1600; i++) {
    const x = (i * 73) % 512;
    const y = (i * 137) % 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(80,78,72,0.12)' : 'rgba(255,252,245,0.14)';
    ctx.fillRect(x, y, 2, 2);
  }

  // Slab expansion joints
  ctx.strokeStyle = 'rgba(70, 68, 62, 0.3)';
  ctx.lineWidth = 2;
  for (let p = 0; p <= 512; p += 128) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(512, p);
    ctx.stroke();
  }

  // Safety quay edge yellow stripe on one edge
  ctx.fillStyle = 'rgba(184, 134, 11, 0.55)';
  ctx.fillRect(0, 490, 512, 12);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 4);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 256);
  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 120);
  grad.addColorStop(0, 'rgba(15, 22, 19, 0.58)');
  grad.addColorStop(0.55, 'rgba(15, 22, 19, 0.24)');
  grad.addColorStop(1, 'rgba(15, 22, 19, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
