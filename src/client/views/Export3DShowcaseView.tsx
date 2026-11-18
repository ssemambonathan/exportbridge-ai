import React, { useEffect, useRef, useState } from 'react';
import {
  AssemblyInspectionInfo,
  CameraPresetId,
  ExportPortSceneController,
  LightingPresetId,
} from '../three/sceneController.ts';
import { ContainerFinishPreset } from '../three/materials.ts';
import { ChevronDown, ChevronUp, Eye, Layers, Sun } from 'lucide-react';

export function Export3DShowcaseView() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ExportPortSceneController | null>(null);

  const [selectedInfo, setSelectedInfo] = useState<AssemblyInspectionInfo | null>(null);
  const [activeCamera, setActiveCamera] = useState<CameraPresetId>('overview');
  const [explodeValue, setExplodeValue] = useState<number>(0);
  const [containerFinish, setContainerFinish] = useState<ContainerFinishPreset>('forest');
  const [lightingPreset, setLightingPreset] = useState<LightingPresetId>('golden_quay');
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [contextLost, setContextLost] = useState<boolean>(false);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const controller = new ExportPortSceneController(mountEl, {
      onSelectAssembly: (info) => setSelectedInfo(info),
      onContextLost: (lost) => setContextLost(lost),
    });
    controllerRef.current = controller;

    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === 'h' || e.key === 'H') &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function handleCameraChange(preset: CameraPresetId) {
    setActiveCamera(preset);
    controllerRef.current?.setCameraPreset(preset, true);
  }

  function handleExplodeChange(val: number) {
    setExplodeValue(val);
    controllerRef.current?.setExplode(val);
  }

  function handleFinishChange(preset: ContainerFinishPreset) {
    setContainerFinish(preset);
    controllerRef.current?.setContainerFinish(preset);
  }

  function handleLightingChange(preset: LightingPresetId) {
    setLightingPreset(preset);
    controllerRef.current?.setLightingPreset(preset);
  }

  return (
    <div className="relative w-full h-[calc(100vh-8.5rem)] min-h-[540px] rounded-lg overflow-hidden border border-[#E5DEC9] bg-[#EAE4D3]">
      {/* Isolated WebGL mount container */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />

      {/* WebGL Context Lost Graceful Fallback */}
      {contextLost ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#FAF8F3] p-6">
          <div className="max-w-md text-center space-y-3">
            <img
              src="/src/assets/images/export_port_logistics_1794565677671.jpg"
              alt="Mombasa Export Terminal Preview"
              className="w-full h-48 object-cover rounded-md border border-[#E5DEC9]"
            />
            <div className="text-sm font-semibold text-[#1C1F1E]">
              3D WebGL context paused
            </div>
            <p className="text-xs text-[#666D6A]">
              Graphics acceleration was temporarily reclaimed by the browser. Reload the tab to restore interactive 3D inspection.
            </p>
          </div>
        </div>
      ) : null}

      {/* Minimal Top-Left Specification Badge (Unobstructed Center) */}
      <div className="absolute top-4 left-4 z-10 pointer-events-auto max-w-xs">
        <div
          className="rounded-lg border border-[#D9D3C4] px-3.5 py-2.5 shadow-sm"
          style={{ backgroundColor: 'rgba(250, 248, 243, 0.94)' }}
        >
          <div className="text-[11px] font-medium text-[#11382A] tracking-tight">
            Mombasa Quay · Berth 14 Digital Twin
          </div>
          {selectedInfo ? (
            <div className="mt-1">
              <div className="text-xs font-semibold text-[#1C1F1E] leading-snug">
                {selectedInfo.title}
              </div>
              <div className="text-[11px] text-[#666D6A] mt-0.5 leading-snug">
                {selectedInfo.subtitle}
              </div>
              <div className="mt-2 pt-2 border-t border-[#E5DEC9] grid grid-cols-3 gap-2">
                {selectedInfo.metrics.map((m) => (
                  <div key={m.label}>
                    <div className="text-[10px] text-[#666D6A]">{m.label}</div>
                    <div className="text-[11px] font-semibold text-[#11382A] tabular-nums">
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Collapsible Bottom Control Dock */}
      <div
        className="absolute left-1/2 z-20 -translate-x-1/2 transition-transform duration-300 ease-out pointer-events-auto"
        style={{
          bottom: '18px',
          width: 'min(900px, 94%)',
          transform: dockCollapsed
            ? 'translate(-50%, calc(100% - 34px))'
            : 'translate(-50%, 0)',
        }}
      >
        <div className="flex justify-center mb-1.5">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-[#0B261C] text-[11px] font-medium text-[#FAF8F3] shadow-sm"
            style={{ backgroundColor: 'rgba(17, 56, 42, 0.94)' }}
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Show Controls (H)</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Hide Controls (H)</span>
              </>
            )}
          </button>
        </div>

        <div
          className="rounded-lg border border-[#0B261C]/30 p-3 shadow-md"
          style={{ backgroundColor: 'rgba(17, 56, 42, 0.94)' }}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-[#FAF8F3]">
            {/* Camera Presets */}
            <div className="md:col-span-5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] text-[#E4EDE9]/75 mr-1">
                <Eye className="w-3.5 h-3.5" />
                View
              </span>
              {(
                [
                  { id: 'overview', label: 'Overview' },
                  { id: 'coffee_lot', label: 'Coffee Lot' },
                  { id: 'reefer_container', label: 'Container' },
                  { id: 'gantry_crane', label: 'Crane' },
                ] as Array<{ id: CameraPresetId; label: string }>
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleCameraChange(preset.id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                    activeCamera === preset.id
                      ? 'bg-[#FAF8F3] text-[#11382A]'
                      : 'bg-[#174937] text-[#E4EDE9] hover:bg-[#1E5C45]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Exploded View Slider */}
            <div className="md:col-span-4 flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1 text-[11px] text-[#E4EDE9]/80 whitespace-nowrap">
                <Layers className="w-3.5 h-3.5" />
                Explode
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={explodeValue}
                onChange={(e) => handleExplodeChange(Number(e.target.value))}
                aria-label="Exploded view separation"
                className="w-full accent-[#D1A12B] cursor-pointer"
              />
              <span className="text-[11px] font-mono tabular-nums w-9 text-right text-[#D1A12B]">
                {Math.round(explodeValue * 100)}%
              </span>
            </div>

            {/* Finish Swatches & Lighting */}
            <div className="md:col-span-3 flex items-center justify-between md:justify-end gap-2">
              <div className="flex items-center gap-1.5" title="Container Finish">
                {(
                  [
                    { id: 'forest', hex: '#11382A', label: 'Forest Green' },
                    { id: 'navy', hex: '#1D3557', label: 'Maritime Navy' },
                    { id: 'sandstone', hex: '#6E5A42', label: 'Savanna Bronze' },
                  ] as Array<{ id: ContainerFinishPreset; hex: string; label: string }>
                ).map((swatch) => (
                  <button
                    key={swatch.id}
                    type="button"
                    onClick={() => handleFinishChange(swatch.id)}
                    aria-label={swatch.label}
                    title={swatch.label}
                    className={`w-5 h-5 rounded border-2 transition-transform ${
                      containerFinish === swatch.id
                        ? 'border-[#D1A12B] scale-110'
                        : 'border-[#FAF8F3]/40'
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                  />
                ))}
              </div>

              <div className="h-4 w-px bg-[#FAF8F3]/20" />

              <button
                type="button"
                onClick={() =>
                  handleLightingChange(
                    lightingPreset === 'golden_quay' ? 'overcast_inspection' : 'golden_quay'
                  )
                }
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#174937] hover:bg-[#1E5C45] text-[11px] text-[#FAF8F3] whitespace-nowrap"
              >
                <Sun className="w-3.5 h-3.5 text-[#D1A12B]" />
                <span>{lightingPreset === 'golden_quay' ? 'Daylight' : 'Overcast'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
