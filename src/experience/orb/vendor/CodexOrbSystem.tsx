/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/NVK-AI-OS/components/CodexOrbSystem.tsx @ b723bc4d9
 * (2026-09-21) + components/core/CodexModes.ts (see vendor/CodexModes.ts).
 * This file REPLACES the nvknexusorb CodexOrbSystem vendored in v0.1.0
 * (that file's content survives in the v0.1.5 GitHub main commit
 * 425a94c2; its NexusOrb shader orb is kept as the asset in
 * vendor/NexusOrb.tsx, unmounted).
 *
 * v0.1.6 (Phase B — orb renderer swap, 2026-11-22): the OS repo's orb
 * (Perlin-displaced shader core, 11 particle modes, 11 orb modes) is
 * now the renderer, behind the Phase A OrbVisualInput interface. The
 * interface is the stable seam: the host passes one color/entropy/pulse
 * per real pipeline state, and this file only applies it. Ported
 * faithfully EXCEPT for the adaptations listed in
 * docs/PHASE-B-RENDERER-SWAP.md — the short version: the OS file's
 * 7-state vocabulary, SystemContext entropy, voice, flight/omniwheel
 * navigation, axiom nodes, cluster/panel system, sub-agent
 * constellation and thought glyphs are NOT ported (Phase C or never);
 * the Agent's 4 gateways are the orbiting nodes; listeners are scoped
 * to the canvas, not the window; the HUD uses text labels, not the
 * Remix Icon font this app does not ship.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { gsap } from 'gsap';
import { NEXUS_GATEWAYS } from './constants';
import type { PortalAnimationType, ActiveView, NexusGateway } from './types';
import type { OrbVisualInput } from '../orb-state';
import { OrbMode, ParticleBackgroundMode } from './osTypes';
import { audio } from './audio';
import ProjectViewer from './ProjectViewer';

// OS shader factors (NVK-AI-OS defaults). The OS file exposes these as
// props; this app has no UI to change them, so they live here as
// constants until a tuning surface exists.
const TORUS_FACTOR = 1.8;
const FLOW_FACTOR = 4.0;
const GRID_FACTOR = 2.2;
const SCANLINE_FACTOR = 0.12;

const IS_MOBILE = typeof navigator !== 'undefined' ? /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) : false;

const vertexShader = `
  uniform float uTime;
  uniform float uEntropy;
  uniform vec3 uMouse;
  uniform vec3 uClickPos;
  uniform float uClickRadius;
  uniform float uClickForce;
  varying vec3 vNormal;
  varying vec3 vLocalPosition;
  
  // Perlin noise function
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vNormal = normalize(normalMatrix * normal);
    
    // Hover deformation
    float hoverDist = distance(position, uMouse);
    float hoverDisp = 0.0;
    if (hoverDist < 8.0 && hoverDist > 0.1) {
      float f = (8.0 - hoverDist) / 8.0;
      hoverDisp = f * f * 1.8;
    }

    // Click deformation
    float clickDist = distance(position, uClickPos);
    float clickDisp = 0.0;
    if (clickDist < uClickRadius && clickDist > 0.1) {
      float cf = (uClickRadius - clickDist) / uClickRadius;
      clickDisp = cf * uClickForce * 2.5;
    }

    float noise = snoise(position.xy * (1.5 + uEntropy * 3.0) + uTime * 0.2) * 0.15 * uEntropy;
    vec3 newPosition = position + normal * (noise + hoverDisp + clickDisp);
    vLocalPosition = newPosition;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uEntropy;
  uniform float uTorusFactor;
  uniform float uFlowFactor;
  uniform float uGridFactor;
  uniform float uScanlineFactor;
  uniform float uHover;
  varying vec3 vNormal;
  varying vec3 vLocalPosition;
  
  void main() {
    // Normal vectors
    vec3 normalMat = normalize(vNormal);
    float dotProduct = clamp(dot(normalMat, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
    
    // Holographic outer Fresnel glow
    float rimIntensity = pow(1.0 - dotProduct, 3.0);
    
    // Safe Toroidal coordinates representation (highly robust, no NaN)
    vec2 p_xy = vLocalPosition.xy;
    float len_xy = length(p_xy);
    
    vec3 q;
    if (len_xy > 0.0001) {
      q = vec3(p_xy / len_xy * 2.8, 0.0);
    } else {
      q = vec3(2.8, 0.0, 0.0);
    }
    
    // Distance from the current shaded pixel to the torus major ring
    float distToTorus = length(vLocalPosition - q);
    
    // Core torus Gaussian density field (peaks directly on the torus ring, fades outwards)
    float torusCore = exp(-0.7 * distToTorus * distToTorus);
    
    // Safe poloidal direction vector
    float d_xy = len_xy - 2.8;
    vec2 poloidalVec = vec2(d_xy, vLocalPosition.z);
    float poloidalLen = length(poloidalVec);
    vec2 poloidalDir = (poloidalLen > 0.0001) ? poloidalVec / poloidalLen : vec2(1.0, 0.0);
    
    // Safe toroidal direction vector (around the XY ring)
    vec2 toroidalDir = (len_xy > 0.0001) ? p_xy / len_xy : vec2(1.0, 0.0);
    
    // Helical quantum energy streams swirling on the torus surface
    // Use angle-free waves: sin(scalar coordinates * multiplier - time * speed)
    float angleT = atan(toroidalDir.y, toroidalDir.x + 0.00001);
    float angleP = atan(poloidalDir.y, poloidalDir.x + 0.00001);
    
    float spiralFlow = sin(angleP * 4.0 + angleT * 8.0 - uTime * 4.5);
    float flowLine = smoothstep(0.7, 1.0, spiralFlow) * torusCore;
    
    // Fine holographic wireframe grid lines representing field resonance coordinates
    float toroidalGrid = abs(sin(angleT * 12.0));
    float poloidalGrid = abs(sin(angleP * 8.0));
    float gridPattern = (smoothstep(0.92, 1.0, toroidalGrid) + smoothstep(0.92, 1.0, poloidalGrid)) * torusCore * 0.45;
    
    // Vertical scanning cyber-lines
    float scanline = sin(vLocalPosition.z * 12.0 + uTime * 5.5);
    float scanlineIntensity = smoothstep(0.6, 1.0, scanline) * uScanlineFactor;
    
    // Soft, pulsing overall base glow
    float centerPulse = 0.5 + 0.5 * sin(uTime * 3.5);
    float pulseAxiom = dotProduct * centerPulse * 0.4;
    
    // Merge glowing elements together
    float glowFactor = (rimIntensity * 3.0 + pulseAxiom + torusCore * uTorusFactor + flowLine * uFlowFactor + gridPattern * uGridFactor + scanlineIntensity + uHover * 2.0);
    
    // Tactile entropy flicker
    float flicker = 1.0 - (sin(uTime * (18.0 + uEntropy * 36.0)) * 0.5 + 0.5) * uEntropy * 0.15;
    
    // Color space configuration: base vibrant green blended with electric quantum cyan and deep ultraviolet neon
    vec3 baseColor = uColor;
    vec3 quantumCyan = vec3(0.05, 0.85, 1.0);
    vec3 ultravioletField = vec3(0.48, 0.12, 1.0);
    vec3 hoverCyan = vec3(0.0, 1.0, 0.95);
    
    // Shift color based on specific field features
    vec3 baseMelt = mix(baseColor, quantumCyan, torusCore * 0.75 + flowLine * 0.3);
    vec3 streamMelt = mix(baseMelt, ultravioletField, flowLine * 0.45);
    vec3 entropyShift = mix(streamMelt, vec3(1.0, 0.35, 0.15), uEntropy * 0.65);
    vec3 hoverShift = mix(entropyShift, hoverCyan, uHover * 0.85);
    
    vec3 lighting = hoverShift * glowFactor * flicker * (1.1 + uEntropy * 0.6 + uHover * 0.5);
    
    // Alpha transparency channel: high transparency on centers, high opacity on rim glow and torus tracks
    float alphaVal = clamp(
      rimIntensity * (0.95 + uHover * 0.35) + 
      torusCore * (0.55 + uHover * 0.3) + 
      flowLine * 0.95 + 
      gridPattern * 0.5 + 
      scanlineIntensity * 0.5, 
      0.0, 
      1.0
    );
    
    // Ensure visibility of the core by establishing a solid minimum alpha threshold
    alphaVal = clamp(alphaVal * (1.0 + uEntropy * 0.4 + uHover * 0.2), 0.15, 0.99);
    
    gl_FragColor = vec4(lighting, alphaVal);
  }
`;

interface CodexOrbSystemProps {
  onNavigate: (view: ActiveView, animationType: PortalAnimationType) => void;
  onNavigateExternal: (url: string, animationType: PortalAnimationType) => void;
  onNavigateNewTab: (url: string, animationType: PortalAnimationType) => void;
  /** Reports a clicked gateway to the host (DOM gateway controls + status). */
  onGatewaySelect?: (gatewayId: string) => void;
  /**
   * Phase A: the orb's visual input (color / entropy / pulse) for the
   * current real pipeline state. The host owns the mapping
   * (orb-state.ts); this file only applies it to the shader orb.
   */
  visualInput?: OrbVisualInput;
  /** OS orb mode. Default HolographicCore — the shader orb that shows the state colors. No mode-selector UI yet; the prop is the seam for one. */
  orbMode?: OrbMode;
  /** OS particle mode. Default Galaxy — the closest to the v0.1.4 galaxy look. */
  particleMode?: ParticleBackgroundMode;
  /** Photo sources for the PhotoGallery orb mode. Empty → the mode renders its placeholder torus (the OS file's own behavior). */
  photoSources?: string[];
  /** Reported on WebGL context loss / init failure. Optional — the component shows its own retry UI. */
  onRendererError?: (hasError: boolean) => void;
}

const CodexOrbSystem: React.FC<CodexOrbSystemProps & { nodeAnimationSpeed?: number }> = ({ onNavigate, onNavigateExternal, onNavigateNewTab, onGatewaySelect, visualInput, orbMode = OrbMode.HolographicCore, particleMode = ParticleBackgroundMode.Galaxy, photoSources = [], onRendererError, nodeAnimationSpeed = 1.0 }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const intersectedRef = useRef<THREE.Object3D | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const hoveredCoreRef = useRef<THREE.Object3D | null>(null);
  const modeObjectsRef = useRef<THREE.Group>(new THREE.Group());
  const defaultOrbObjectsRef = useRef<THREE.Group>(new THREE.Group());
  const backgroundParticlesGroupRef = useRef<THREE.Group>(new THREE.Group());
  const gatewayGroupRef = useRef<THREE.Group | null>(null);
  const speedRef = useRef(nodeAnimationSpeed);
  const hoverScaleRef = useRef(1.0);
  const clickScaleImpulseRef = useRef(0.0);
  const clickWobbleVelRef = useRef(0.0);
  const [rendererError, setRendererError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [selectedGateway, setSelectedGateway] = useState<NexusGateway | null>(null);

  // Keep callbacks + the visual input in refs — the three.js effects
  // must not re-init when the parent re-renders with new identities.
  // (Same pattern the vendored orb used for onGatewaySelect, v0.1.4.)
  const onGatewaySelectRef = useRef(onGatewaySelect);
  onGatewaySelectRef.current = onGatewaySelect;
  const visualInputRef = useRef(visualInput);
  visualInputRef.current = visualInput;
  const onRendererErrorRef = useRef(onRendererError);
  onRendererErrorRef.current = onRendererError;

  const cleanup = useCallback((renderer?: THREE.WebGLRenderer, cssRenderer?: CSS3DRenderer, scene?: THREE.Scene, controls?: OrbitControls, resizeObserver?: ResizeObserver) => {
    if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
    }
    controls?.dispose();
    resizeObserver?.disconnect();

    scene?.traverse(object => {
      if ('geometry' in object && (object as any).geometry) {
        ((object as any).geometry as THREE.BufferGeometry).dispose();
      }
      if ('material' in object && (object as any).material) {
        const material = (object as any).material;
        const disposeMat = (m: any) => {
          if (m.map && typeof m.map.dispose === 'function') {
            m.map.dispose();
          }
          if (typeof m.dispose === 'function') {
            m.dispose();
          }
        };
        if (Array.isArray(material)) {
          material.forEach(disposeMat);
        } else if (material) {
          disposeMat(material);
        }
      }
    });

    renderer?.dispose();
    cameraRef.current = null;
    controlsRef.current = null;
    if(mountRef.current) {
        while (mountRef.current.firstChild) {
            mountRef.current.removeChild(mountRef.current.firstChild);
        }
    }
  }, []);

  useEffect(() => {
    const group = backgroundParticlesGroupRef.current;

    // Cleanup function to remove old particles
    const cleanupParticles = () => {
      while(group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child instanceof THREE.Points) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      }
    };
    
    cleanupParticles();

    // Create new particles based on mode
    const particleCount = IS_MOBILE ? 400 : 1200;
    const particleGeometry = new THREE.BufferGeometry();
    const particleMaterial = new THREE.PointsMaterial({ 
      color: 0x00ffb3, 
      size: 0.05, 
      blending: THREE.AdditiveBlending, 
      transparent: true, 
      opacity: 0.7 
    });

    switch (particleMode) {
      case ParticleBackgroundMode.Orbital: {
        const positions = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
          const theta = Math.random() * 2 * Math.PI;
          const phi = Math.acos(2 * Math.random() - 1);
          const r = 5.5 + Math.random() * 1.5;
          positions[i*3] = r * Math.sin(phi) * Math.cos(theta);
          positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
          positions[i*3+2] = r * Math.cos(phi);
        }
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const orbParticles = new THREE.Points(particleGeometry, particleMaterial);
        group.add(orbParticles);
        break;
      }
      case ParticleBackgroundMode.Galaxy: {
        const galaxyPositions = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
          const radius = Math.random() * 20;
          const angle = Math.random() * 2 * Math.PI;
          galaxyPositions[i*3] = radius * Math.cos(angle);
          galaxyPositions[i*3+1] = (Math.random() - 0.5) * 0.5; // Flat disc
          galaxyPositions[i*3+2] = radius * Math.sin(angle);
        }
        particleMaterial.size = 0.08;
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(galaxyPositions, 3));
        const galaxyParticles = new THREE.Points(particleGeometry, particleMaterial);
        group.add(galaxyParticles);
        break;
      }
      case ParticleBackgroundMode.Stardust: {
        const halfWidth = 25;
        const numStardustParticles = particleCount / 2;
        const stardustPositions = new Float32Array(numStardustParticles * 3);
        for (let i = 0; i < numStardustParticles; i++) { 
          stardustPositions[i*3] = (Math.random() - 0.5) * halfWidth * 2;
          stardustPositions[i*3+1] = (Math.random() - 0.5) * 30;
          stardustPositions[i*3+2] = (Math.random() - 0.5) * 30;
        }
        particleMaterial.size = 0.1;
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(stardustPositions, 3));
        const stardustParticles = new THREE.Points(particleGeometry, particleMaterial);
        group.add(stardustParticles);
        break;
      }
      case ParticleBackgroundMode.Wormhole: {
        const numWormholeParticles = particleCount * 2;
        const wormholePositions = new Float32Array(numWormholeParticles * 3);
        for (let i = 0; i < numWormholeParticles; i++) {
          const radius = 5 + Math.random() * 20;
          const angle = Math.random() * Math.PI * 2;
          wormholePositions[i*3] = radius * Math.cos(angle);
          wormholePositions[i*3+1] = radius * Math.sin(angle);
          wormholePositions[i*3+2] = (Math.random() - 0.5) * 50;
        }
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(wormholePositions, 3));
        particleMaterial.size = 0.08;
        particleMaterial.color.set(0xaa88ff);
        const wormholeParticles = new THREE.Points(particleGeometry, particleMaterial);
        group.add(wormholeParticles);
        break;
      }
      case ParticleBackgroundMode.CosmicWeb: {
        const numWebParticles = Math.floor(particleCount * 1.5);
        const webPositions = new Float32Array(numWebParticles * 3);
        const clusterCenters = [
            new THREE.Vector3(-15, 5, -10), new THREE.Vector3(10, -10, 15),
            new THREE.Vector3(5, 15, -5), new THREE.Vector3(-10, -8, 8),
            new THREE.Vector3(18, 0, 0),
        ];
        for (let i = 0; i < numWebParticles; i++) {
            let pos: THREE.Vector3;
            if (Math.random() > 0.3) { // 70% in clusters
                const center = clusterCenters[i % clusterCenters.length];
                pos = new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 5).add(center);
            } else { // 30% in filaments
                const c1 = clusterCenters[i % clusterCenters.length];
                const c2 = clusterCenters[(i + 1) % clusterCenters.length];
                pos = new THREE.Vector3().lerpVectors(c1, c2, Math.random());
                pos.add(new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 0.5));
            }
            webPositions[i*3] = pos.x;
            webPositions[i*3+1] = pos.y;
            webPositions[i*3+2] = pos.z;
        }
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(webPositions, 3));
        particleMaterial.size = 0.1;
        particleMaterial.color.set(0x88aaff);
        const webParticles = new THREE.Points(particleGeometry, particleMaterial);
        group.add(webParticles);
        break;
      }
      case ParticleBackgroundMode.NeutrinoStream: {
        const positions = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
          positions[i*3] = (Math.random() - 0.5) * 40;
          positions[i*3+1] = (Math.random() - 0.5) * 40;
          positions[i*3+2] = (Math.random() - 0.5) * 40;
        }
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleMaterial.size = 0.03;
        particleMaterial.color.set(0xaaaaff);
        const streamParticles = new THREE.Points(particleGeometry, particleMaterial);
        group.add(streamParticles);
        break;
      }
      case ParticleBackgroundMode.QuantumFoam: {
        const numFoamParticles = particleCount * 2;
        const positions = new Float32Array(numFoamParticles * 3);
        const lives = new Float32Array(numFoamParticles);
        for (let i = 0; i < numFoamParticles; i++) {
            positions[i*3] = (Math.random() - 0.5) * 20;
            positions[i*3+1] = (Math.random() - 0.5) * 20;
            positions[i*3+2] = (Math.random() - 0.5) * 20;
            lives[i] = Math.random() * 50;
        }
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('life', new THREE.BufferAttribute(lives, 1));
        particleMaterial.size = 0.02;
        particleMaterial.color.set(0xccddff);
        const foamParticles = new THREE.Points(particleGeometry, particleMaterial);
        group.add(foamParticles);
        break;
      }
      case ParticleBackgroundMode.NebulaCloud: {
        const numNebulaParticles = particleCount * 3;
        const positions = new Float32Array(numNebulaParticles * 3);
        const colors = new Float32Array(numNebulaParticles * 3);
        const color = new THREE.Color();
        for (let i = 0; i < numNebulaParticles; i++) {
            const r = 10 + Math.random() * 5;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            positions[i*3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i*3+2] = r * Math.cos(phi);

            color.setHSL(0.5 + Math.random() * 0.2, 0.8, 0.5 + Math.random() * 0.2);
            colors[i*3] = color.r;
            colors[i*3+1] = color.g;
            colors[i*3+2] = color.b;
        }
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        particleMaterial.size = 0.2;
        particleMaterial.vertexColors = true;
        particleMaterial.opacity = 0.3;
        const nebulaParticles = new THREE.Points(particleGeometry, particleMaterial);
        group.add(nebulaParticles);
        break;
      }
      case ParticleBackgroundMode.SupernovaRemnant: {
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const color = new THREE.Color();
        for (let i = 0; i < particleCount; i++) {
            positions[i*3] = 0;
            positions[i*3+1] = 0;
            positions[i*3+2] = 0;
            
            const velocity = new THREE.Vector3().randomDirection().multiplyScalar(0.01 + Math.random() * 0.05);
            velocities[i*3] = velocity.x;
            velocities[i*3+1] = velocity.y;
            velocities[i*3+2] = velocity.z;

            color.setHSL(0.1 * Math.random(), 1.0, 0.6);
            colors[i*3] = color.r;
            colors[i*3+1] = color.g;
            colors[i*3+2] = color.b;
        }
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        particleMaterial.size = 0.1;
        particleMaterial.vertexColors = true;
        const supernovaParticles = new THREE.Points(particleGeometry, particleMaterial);
        group.add(supernovaParticles);
        break;
      }
      case ParticleBackgroundMode.AetherFlow: {
        const positions = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
          positions[i*3] = (Math.random() - 0.5) * 50;
          positions[i*3+1] = (Math.random() - 0.5) * 50;
          positions[i*3+2] = (Math.random() - 0.5) * 50;
        }
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleMaterial.size = 0.04;
        particleMaterial.color.set(0x5577cc);
        particleMaterial.opacity = 0.4;
        const aetherParticles = new THREE.Points(particleGeometry, particleMaterial);
        group.add(aetherParticles);
        break;
      }
      case ParticleBackgroundMode.None:
      default:
        // Already cleaned up
        break;
    }

    // Ensure all background particle systems have a color attribute for dynamic multi-spectral color changes
    group.children.forEach(child => {
      if (child instanceof THREE.Points) {
        const geom = child.geometry;
        const posAttr = geom.attributes.position;
        if (posAttr) {
          if (!geom.attributes.color) {
            const count = posAttr.count;
            const colors = new Float32Array(count * 3);
            let baseColor = new THREE.Color(0x00ffb3);
            if (child.material instanceof THREE.PointsMaterial) {
              baseColor.copy(child.material.color);
              child.material.color.setHex(0xffffff); // Set to white so vertex colors dictate exact rendering
              child.material.vertexColors = true;
            }
            for (let i = 0; i < count; i++) {
              colors[i * 3] = baseColor.r;
              colors[i * 3 + 1] = baseColor.g;
              colors[i * 3 + 2] = baseColor.b;
            }
            geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          } else {
            // If color already exists, ensure material uses white and vertexColors
            if (child.material instanceof THREE.PointsMaterial) {
              child.material.color.setHex(0xffffff);
              child.material.vertexColors = true;
            }
          }
        }
      }
    });
    
    return cleanupParticles;
  }, [particleMode]);

  useEffect(() => {
    if (!mountRef.current) return;
    const currentMount = mountRef.current;
    
    const width = currentMount.clientWidth > 0 ? currentMount.clientWidth : (window.innerWidth > 0 ? window.innerWidth : 800);
    const height = currentMount.clientHeight > 0 ? currentMount.clientHeight : (window.innerHeight > 0 ? window.innerHeight : 600);

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    cameraRef.current = camera;
    camera.position.z = 25;
    
    let renderer: THREE.WebGLRenderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
        console.error("CodexOrbSystem: WebGL Context Creation Failed", e);
        setRendererError(true);
        onRendererErrorRef.current?.(true);
        return;
    }

    renderer.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        console.warn('CodexOrbSystem: WebGL context lost');
        setRendererError(true);
        onRendererErrorRef.current?.(true);
    }, false);
    
    const targetPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(targetPixelRatio);
    renderer.setSize(width, height);
    currentMount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';

    const cssRenderer = new CSS3DRenderer();
    cssRenderer.setSize(width, height);
    cssRenderer.domElement.style.position = 'absolute';
    cssRenderer.domElement.style.top = '0';
    cssRenderer.domElement.className = 'css3d-renderer';
    cssRenderer.domElement.style.pointerEvents = 'none'; // IMPORTANT: let touches pass through to WebGL canvas
    currentMount.appendChild(cssRenderer.domElement);

    let composer: EffectComposer | null = null;
    try {
        const renderScene = new RenderPass(scene, camera);
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.2, 0.4, 0.85);
        bloomPass.threshold = 0;
        bloomPass.strength = 1.0;
        bloomPass.radius = 0;
        composer = new EffectComposer(renderer);
        composer.addPass(renderScene);
        composer.addPass(bloomPass);
    } catch (e) {
        console.warn("CodexOrbSystem: EffectComposer initialization warning, falling back to direct render", e);
        composer = null;
    }
    
    // Bind to renderer.domElement so we receive events
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.2;
    controls.rotateSpeed = 0.5;
    controls.panSpeed = 0.5;
    controls.screenSpacePanning = true;
    // v0.1.6 (Phase B): keep the camera in a sane range around the
    // scene — the OS file sets no limits, so a wheel-zoom could fly
    // through the core or out to infinity.
    controls.minDistance = 12;
    controls.maxDistance = 40;
    
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-10, -10);
    let mouseActive = false;
    const mouse3D = new THREE.Vector3(-1000, -1000, -1000);
    const clickWave3D = {
      position: new THREE.Vector3(-1000, -1000, -1000),
      radius: 0,
      active: false,
      force: 0,
    };

    const triggerClickWave = (clientX: number, clientY: number) => {
        if (!currentMount) return;
        const rect = currentMount.getBoundingClientRect();
        const mouse2D = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(mouse2D, camera);
        const tempPos = new THREE.Vector3();
        const planeNormal = new THREE.Vector3();
        camera.getWorldDirection(planeNormal).negate();
        const plane = new THREE.Plane(planeNormal, 0);
        if (raycaster.ray.intersectPlane(plane, tempPos)) {
            clickWave3D.position.copy(tempPos);
            clickWave3D.radius = 0.1;
            clickWave3D.active = true;
            clickWave3D.force = 3.5;
        }
    };

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let lastTapTime = 0;

    const updateMousePosFromCoords = (clientX: number, clientY: number) => {
        if (!currentMount) return;
        const rect = currentMount.getBoundingClientRect();
        const width = rect.width > 0 ? rect.width : window.innerWidth;
        const height = rect.height > 0 ? rect.height : window.innerHeight;
        const left = rect.left || 0;
        const top = rect.top || 0;
        mouse.x = ((clientX - left) / width) * 2 - 1;
        mouse.y = -((clientY - top) / height) * 2 + 1;
        mouseActive = true;
    };

    const handleMouseMove = (event: MouseEvent) => {
        updateMousePosFromCoords(event.clientX, event.clientY);
    };

    const handleMouseLeave = () => {
        mouse.x = -10;
        mouse.y = -10;
        mouseActive = false;
    };

    const handlePointerDown = (event: PointerEvent) => {
        touchStartX = event.clientX;
        touchStartY = event.clientY;
        touchStartTime = Date.now();
        updateMousePosFromCoords(event.clientX, event.clientY);
        triggerClickWave(event.clientX, event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
        const dx = Math.abs(event.clientX - touchStartX);
        const dy = Math.abs(event.clientY - touchStartY);
        const dt = Date.now() - touchStartTime;
        if (dx < 20 && dy < 20 && dt < 600) {
            handleTapOrClick(event.clientX, event.clientY);
        }
    };

    const handleTouchStart = (event: TouchEvent) => {
        if (event.touches.length > 0) {
            const touch = event.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            touchStartTime = Date.now();
            updateMousePosFromCoords(touch.clientX, touch.clientY);
            triggerClickWave(touch.clientX, touch.clientY);
        }
    };

    const handleTouchMove = (event: TouchEvent) => {
        if (event.touches.length > 0) {
            updateMousePosFromCoords(event.touches[0].clientX, event.touches[0].clientY);
        }
    };

    const handleTouchEnd = (event: TouchEvent) => {
        mouseActive = false;
        if (event.changedTouches.length > 0) {
            const touch = event.changedTouches[0];
            const dx = Math.abs(touch.clientX - touchStartX);
            const dy = Math.abs(touch.clientY - touchStartY);
            const dt = Date.now() - touchStartTime;
            if (dx < 20 && dy < 20 && dt < 600) {
                handleTapOrClick(touch.clientX, touch.clientY);
            }
        }
    };

    // Default Orb Mode objects
    const orbGeometry = new THREE.IcosahedronGeometry(5, 15);
    const orbMaterial = new THREE.ShaderMaterial({ 
      vertexShader, 
      fragmentShader, 
      uniforms: { 
        uColor: { value: new THREE.Color(0x1ab3ff) }, 
        uTime: { value: 0 }, 
        uEntropy: { value: 0 },
        uMouse: { value: new THREE.Vector3(-1000, -1000, -1000) },
        uClickPos: { value: new THREE.Vector3(-1000, -1000, -1000) },
        uClickRadius: { value: 0 },
        uClickForce: { value: 0 },
        uTorusFactor: { value: TORUS_FACTOR },
        uFlowFactor: { value: FLOW_FACTOR },
        uGridFactor: { value: GRID_FACTOR },
        uScanlineFactor: { value: SCANLINE_FACTOR },
        uHover: { value: 0.0 }
      }, 
      blending: THREE.AdditiveBlending, 
      transparent: true 
    });
    const orb = new THREE.Mesh(orbGeometry, orbMaterial);
    orb.name = 'core_orb';
    defaultOrbObjectsRef.current.add(orb);
    
    scene.add(defaultOrbObjectsRef.current);
    scene.add(modeObjectsRef.current);
    scene.add(backgroundParticlesGroupRef.current);

    // Gateway ring (Agent, v0.1.6 Phase B): the 4 Nexus gateways orbit
    // the core — they are this app's organization system. The OS file's
    // orbiting nodes are its axiom nodes (OS-lore labels, no function)
    // and its cluster/panel nodes (Phase C, not ported); neither is
    // ported. Node sizes are scaled to the OS scene (core radius 5,
    // camera z=25): sphere 1.5, ring radius 12, labels 6x1.5.
    const gatewayGroup = new THREE.Group();
    gatewayGroupRef.current = gatewayGroup;

    const createGatewayNode = (gateway: NexusGateway) => {
        const group = new THREE.Group();
        group.userData = { id: gateway.id, type: 'gateway' };

        const geom = new THREE.SphereGeometry(1.5, 32, 32);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00A4FF, transparent: true, opacity: 0.6, wireframe: true });
        const sphere = new THREE.Mesh(geom, mat);

        const innerGeom = new THREE.SphereGeometry(0.75, 16, 16);
        const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const inner = new THREE.Mesh(innerGeom, innerMat);

        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0,0,512,128);
        ctx.font = 'bold 48px "Fira Code", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#67e8f9';
        ctx.shadowColor = '#00A4FF';
        ctx.shadowBlur = 10;
        ctx.fillText(gateway.title.toUpperCase(), 256, 64);

        const tex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(6, 1.5, 1);
        sprite.position.y = 2.6;

        group.add(sphere);
        group.add(inner);
        group.add(sprite);
        return group;
    };

    const gatewayRadius = 12;
    NEXUS_GATEWAYS.forEach((gateway, i) => {
        const angle = (i / NEXUS_GATEWAYS.length) * Math.PI * 2;
        const node = createGatewayNode(gateway);
        node.position.set(Math.cos(angle) * gatewayRadius, 0, Math.sin(angle) * gatewayRadius);

        // Connector line to center
        const points = [new THREE.Vector3(0,0,0), new THREE.Vector3(Math.cos(angle)*gatewayRadius, 0, Math.sin(angle)*gatewayRadius)];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x00A4FF, transparent: true, opacity: 0.1 });
        const line = new THREE.Line(lineGeo, lineMat);

        gatewayGroup.add(node);
        gatewayGroup.add(line);
    });

    scene.add(gatewayGroup);

    // v0.1.6 (Phase B): prefer the VISIBLE core. The OS file resolves
    // the default orb first even when its mode hides it (visible=false);
    // a raycast can then hit an invisible orb in a non-HolographicCore
    // mode. In HolographicCore the default orb is the visible core; in
    // every other mode the mode's own core (named 'core_orb' by
    // addInvisibleCore or by the mode builder) is the one that counts.
    const resolveCoreOrb = (): THREE.Object3D | null => {
        const defaultCore = defaultOrbObjectsRef.current.getObjectByName('core_orb');
        if (defaultCore && defaultOrbObjectsRef.current.visible) return defaultCore;
        // v0.1.6 (Phase B): strict-mode fix — getObjectByName returns
        // Object3D | undefined, this function returns | null.
        return modeObjectsRef.current.getObjectByName('core_orb') ?? null;
    };
    // Gateway tap/click (Agent, v0.1.6 Phase B): the interactables are
    // the core orb and the 4 gateway nodes. The OS file raycast axiom +
    // panel nodes here — those systems are Phase C and are not ported.
    // The core-orb proximity fallback (ray passes within 6.5 units of
    // the origin) is the OS file's own touch tolerance: a finger is
    // wider than a ray.
    const handleTapOrClick = (clientX: number, clientY: number) => {
        const now = Date.now();
        if (now - lastTapTime < 250) return; // Prevent double trigger
        lastTapTime = now;

        if (!currentMount || !cameraRef.current) return;
        updateMousePosFromCoords(clientX, clientY);

        const clickRaycaster = new THREE.Raycaster();
        clickRaycaster.setFromCamera(mouse, cameraRef.current);

        const gatewayNodes = gatewayGroupRef.current ? gatewayGroupRef.current.children : [];
        const coreOrb = resolveCoreOrb();
        const interactables: THREE.Object3D[] = coreOrb ? [...gatewayNodes, coreOrb] : [...gatewayNodes];
        if (modeObjectsRef.current) {
            interactables.push(...modeObjectsRef.current.children);
        }

        const intersects = clickRaycaster.intersectObjects(interactables, true);
        let hitTarget: THREE.Object3D | null = null;

        if (intersects.length > 0) {
            let obj: THREE.Object3D | null = intersects[0].object;
            while (obj && obj !== scene) {
                if (obj.name === 'core_orb' || obj.userData?.type === 'gateway') {
                    hitTarget = obj;
                    break;
                }
                obj = obj.parent;
            }
            if (!hitTarget) hitTarget = intersects[0].object;
        }

        let isCoreOrb = false;
        let targetObj = hitTarget || intersectedRef.current || hoveredCoreRef.current;

        if (targetObj) {
            let curr: THREE.Object3D | null = targetObj;
            while (curr) {
                if (curr.name === 'core_orb') {
                    isCoreOrb = true;
                    break;
                }
                curr = curr.parent;
            }
        }

        if (!isCoreOrb && (!targetObj || targetObj.userData?.type !== 'gateway')) {
            const ray = clickRaycaster.ray;
            const closestPointOnRay = new THREE.Vector3();
            ray.closestPointToPoint(new THREE.Vector3(0, 0, 0), closestPointOnRay);
            if (closestPointOnRay.distanceTo(new THREE.Vector3(0, 0, 0)) < 6.5) {
                isCoreOrb = true;
            }
        }

        if (isCoreOrb) {
            audio.nexusOrbClick();
            clickScaleImpulseRef.current = 0.55;
            clickWobbleVelRef.current = 0.9;
            triggerClickWave(clientX, clientY);

            if (defaultOrbObjectsRef.current) {
                defaultOrbObjectsRef.current.rotation.y += Math.PI * 0.6;
                defaultOrbObjectsRef.current.rotation.z += (Math.random() - 0.5) * 0.5;
            }
            if (modeObjectsRef.current) {
                modeObjectsRef.current.rotation.y += Math.PI * 0.6;
                modeObjectsRef.current.rotation.z += (Math.random() - 0.5) * 0.5;
            }

            // Core tap resets the camera to the OS file's focus distance.
            if (cameraRef.current && controlsRef.current) {
                gsap.to(cameraRef.current.position, {
                    x: 0,
                    y: 0,
                    z: 14,
                    duration: 0.8,
                    ease: "back.out(1.5)"
                });
                gsap.to(controlsRef.current.target, {
                    x: 0,
                    y: 0,
                    z: 0,
                    duration: 0.8,
                    ease: "power2.out",
                    onUpdate: () => controlsRef.current?.update()
                });
            }
        } else if (targetObj && targetObj.userData?.type === 'gateway') {
            audio.nexusOrbClick();
            const gateway = NEXUS_GATEWAYS.find(g => g.id === targetObj.userData.id);
            if (gateway) {
                setSelectedGateway(gateway);
                onGatewaySelectRef.current?.(gateway.id);
            }
        }
    };

    // Updated handleResize to check for dimensions and maintain high DPI resolution
    const handleResize = () => {
        if (!currentMount) return;
        const w = currentMount.clientWidth > 0 ? currentMount.clientWidth : (window.innerWidth > 0 ? window.innerWidth : 800);
        const h = currentMount.clientHeight > 0 ? currentMount.clientHeight : (window.innerHeight > 0 ? window.innerHeight : 600);

        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        const pr = Math.min(window.devicePixelRatio || 1, 2);
        renderer.setPixelRatio(pr);
        renderer.setSize(w, h);
        cssRenderer.setSize(w, h);
        if (composer) {
            composer.setSize(w, h);
        }
    };
    
    // Use ResizeObserver for robust size detection
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(currentMount);
    requestAnimationFrame(() => handleResize());

    // v0.1.6 (Phase B): listeners are scoped to the CANVAS, not the
    // window. The OS file listens on window because its orb is
    // full-screen; in this app the orb is a panel, and a window-level
    // click listener would raycast clicks on the DOM gateway buttons
    // below the canvas — a click just below the panel can pass within
    // the core-orb proximity fallback and reset the camera. Canvas
    // scope keeps the two control surfaces independent. The window
    // resize listener stays: ResizeObserver handles panel resizes,
    // the window listener covers viewport changes.
    const domElement = renderer.domElement;
    domElement.addEventListener('pointerdown', handlePointerDown);
    domElement.addEventListener('pointerup', handlePointerUp);
    domElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    domElement.addEventListener('touchend', handleTouchEnd, { passive: true });
    domElement.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    domElement.addEventListener('touchmove', handleTouchMove, { passive: true });
    domElement.addEventListener('mousemove', handleMouseMove);
    domElement.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('resize', handleResize);


    const clock = new THREE.Clock();
    
    // Helper to restore base points configurations
    const restorePointsBase = (points: THREE.Points) => {
      const positions = points.geometry.attributes.position;
      if (!positions || !points.userData.physicsInited) return;
      const count = positions.count;
      const posArr = positions.array as Float32Array;
      const offsets = points.userData.physicsOffsets;
      if (!offsets) return;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        posArr[i3] -= offsets[i3];
        posArr[i3 + 1] -= offsets[i3 + 1];
        posArr[i3 + 2] -= offsets[i3 + 2];
      }
    };

    const tempParentPos = new THREE.Vector3();
    const tempChildPos = new THREE.Vector3();

    let cumulativeTime = 0;
    const animate = () => {
        animationFrameIdRef.current = requestAnimationFrame(animate);
        (window as any).frameCount = ((window as any).frameCount || 0) + 1;
        const rawDelta = clock.getDelta();

        // If tab was backgrounded or frame rate spiked (> 0.2s pause), clamp delta to prevent layout jumps and preserve animation loop
        const delta = Math.min(rawDelta, 0.1);

        // Target: 60 FPS standard (delta = ~0.0166s -> dtSim = 1.0)
        const dtSim = delta * 60;
        
        cumulativeTime += delta * (speedRef.current || 0.5);
        const elapsedTime = cumulativeTime;

        try {
            // Restore Points base before existing animations modify them
            const restorePoints = (obj: THREE.Object3D) => {
                if (obj instanceof THREE.Points) {
                    restorePointsBase(obj);
                }
                obj.children.forEach(restorePoints);
            };
            restorePoints(modeObjectsRef.current);

            // --- Entropy Heart Visuals ---
            // Phase A/B: the orb's entropy comes from the host's
            // OrbVisualInput (one value per real pipeline state) — the
            // OS file read it from its SystemContext, which does not
            // exist in this app.
            const visual = visualInputRef.current;
            const entropyValue = visual?.entropy ?? 0.1;
            const pulseSpeed = 1 + entropyValue * 3;
            const pulseIntensity = 0.5 + entropyValue * 0.5;
            const currentSpeed = speedRef.current || 0.5;
            
            // Default orb animations reacting to entropy
            const rotationSpeed = 0.001 + entropyValue * 0.005;
            orb.rotation.y += rotationSpeed * currentSpeed * dtSim;
            // Smooth hover scale interpolation
            const isCoreCurrentlyHovered = hoveredCoreRef.current !== null;
            const targetHover = isCoreCurrentlyHovered ? 1.0 : 0.0;
            const targetHoverScale = isCoreCurrentlyHovered ? 1.25 : 1.0;
            hoverScaleRef.current += (targetHoverScale - hoverScaleRef.current) * Math.min(0.2 * dtSim, 1.0);

            // Spring physics simulation for click impulse
            if (clickScaleImpulseRef.current > 0.001 || Math.abs(clickWobbleVelRef.current) > 0.001) {
                const kSpring = 0.22;
                const damping = 0.82;
                const force = -clickScaleImpulseRef.current * kSpring;
                clickWobbleVelRef.current = (clickWobbleVelRef.current + force * dtSim) * Math.pow(damping, dtSim);
                clickScaleImpulseRef.current += clickWobbleVelRef.current * dtSim;
                if (clickScaleImpulseRef.current < 0) {
                    clickScaleImpulseRef.current = 0;
                    clickWobbleVelRef.current = 0;
                }
            } else {
                clickScaleImpulseRef.current = 0;
                clickWobbleVelRef.current = 0;
            }

            if (orb.material instanceof THREE.ShaderMaterial) {
              // Phase A/B: the ONLY driver is the host's OrbVisualInput
              // (one color/entropy/pulse per real pipeline state). The
              // OS file's 7-state vocabulary and its per-state boost
              // table are NOT ported: the boost is already folded into
              // OrbVisualInput by orbVisualForState (thinking entropy
              // 0.4 + pulse 2.2, blocked 0.6, ...).
              // There is deliberately no DISCOVERY gold and no ERROR
              // state here — no pipeline event produces them.
              const targetColor = new THREE.Color(visual?.color ?? '#1ab3ff');
              if (orb.material.uniforms.uColor) {
                orb.material.uniforms.uColor.value.lerp(targetColor, 0.1 * dtSim);
              }

              orb.material.uniforms.uTime.value = elapsedTime * pulseSpeed * (visual?.pulse ?? 1.0);
              orb.material.uniforms.uEntropy.value = Math.min(1.0, entropyValue);
              orb.material.uniforms.uMouse.value.copy(mouse3D);
              orb.material.uniforms.uClickPos.value.copy(clickWave3D.position);
              orb.material.uniforms.uClickRadius.value = clickWave3D.radius;
              orb.material.uniforms.uClickForce.value = clickWave3D.force;
              orb.material.uniforms.uTorusFactor.value = TORUS_FACTOR;
              orb.material.uniforms.uFlowFactor.value = FLOW_FACTOR;
              orb.material.uniforms.uGridFactor.value = GRID_FACTOR;
              orb.material.uniforms.uScanlineFactor.value = SCANLINE_FACTOR;
              if (orb.material.uniforms.uHover) {
                orb.material.uniforms.uHover.value += (targetHover - orb.material.uniforms.uHover.value) * 0.2 * dtSim;
              }
            }
            
            let basePulseScale = 1 + Math.sin(elapsedTime * pulseSpeed * 2) * 0.05 * pulseIntensity;
            const finalCoreScale = (basePulseScale + clickScaleImpulseRef.current) * hoverScaleRef.current;
            orb.scale.setScalar(finalCoreScale);
            if (modeObjectsRef.current) {
               modeObjectsRef.current.scale.setScalar(finalCoreScale);
            }
        
        // --- Particle Background Animations ---
        const backgroundGroup = backgroundParticlesGroupRef.current;
        switch (particleMode) {
          case ParticleBackgroundMode.Orbital:
            if (backgroundGroup.children.length > 0) {
              backgroundGroup.children[0].rotation.y += (rotationSpeed * 1.5) * speedRef.current * dtSim;
              const mat = (backgroundGroup.children[0] as THREE.Points).material as THREE.PointsMaterial;
              mat.opacity = 0.5 + entropyValue * 0.4;
              mat.size = 0.05 + entropyValue * 0.05;
            }
            break;
          case ParticleBackgroundMode.Galaxy:
            backgroundGroup.rotation.y += 0.0005 * (1 + entropyValue) * speedRef.current * dtSim;
            break;
          case ParticleBackgroundMode.Stardust: {
            const stardust = backgroundGroup.children[0] as THREE.Points;
            if (stardust) {
              const positions = stardust.geometry.attributes.position;
              const halfWidth = 25; // Define bounds for wrapping
              for (let i = 0; i < positions.count; i++) {
                let x = positions.getX(i);
                x -= (0.01 + entropyValue * 0.02) * speedRef.current * dtSim;
                if (x < -halfWidth) {
                  x = halfWidth;
                }
                positions.setX(i, x);
              }
              positions.needsUpdate = true;
            }
            break;
          }
          case ParticleBackgroundMode.Wormhole: {
            const wormhole = backgroundGroup.children[0] as THREE.Points;
            if (wormhole) {
              const positions = wormhole.geometry.attributes.position;
              for (let i=0; i < positions.count; i++) {
                let z = positions.getZ(i);
                z -= (0.1 + entropyValue * 0.2) * speedRef.current * dtSim;
                if (z < -25) {
                    z = 25;
                }
                positions.setZ(i, z);
              }
              positions.needsUpdate = true;
              wormhole.rotation.z += 0.001 * speedRef.current * dtSim;
            }
            break;
          }
          case ParticleBackgroundMode.CosmicWeb:
            backgroundGroup.rotation.y += 0.0002 * speedRef.current * dtSim;
            backgroundGroup.rotation.x += 0.0001 * speedRef.current * dtSim;
            break;
          case ParticleBackgroundMode.NeutrinoStream: {
            const stream = backgroundGroup.children[0] as THREE.Points;
            if (stream) {
              const positions = stream.geometry.attributes.position;
              for (let i = 0; i < positions.count; i++) {
                let y = positions.getY(i);
                y += 0.2 * speedRef.current * dtSim; // Fast vertical movement
                if (y > 20) {
                    y = -20;
                }
                positions.setY(i, y);
              }
              positions.needsUpdate = true;
            }
            break;
          }
          case ParticleBackgroundMode.QuantumFoam: {
            const foam = backgroundGroup.children[0] as THREE.Points;
            if (foam) {
              const positions = foam.geometry.attributes.position;
              const lives = foam.geometry.attributes.life as THREE.BufferAttribute;
              for (let i = 0; i < positions.count; i++) {
                lives.setX(i, lives.getX(i) - 1 * speedRef.current * dtSim);
                if (lives.getX(i) <= 0) {
                    positions.setXYZ(i, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
                    lives.setX(i, Math.random() * 50);
                }
              }
              positions.needsUpdate = true;
              lives.needsUpdate = true;
            }
            break;
          }
          case ParticleBackgroundMode.NebulaCloud:
            backgroundGroup.rotation.y += 0.0001 * speedRef.current * dtSim;
            backgroundGroup.rotation.x += 0.0002 * speedRef.current * dtSim;
            break;
          case ParticleBackgroundMode.SupernovaRemnant: {
            const supernova = backgroundGroup.children[0] as THREE.Points;
            if (supernova) {
              const positions = supernova.geometry.attributes.position;
              const velocities = supernova.geometry.attributes.velocity as THREE.BufferAttribute;
              const maxRadiusSq = 30 * 30;
              for (let i = 0; i < positions.count; i++) {
                positions.setX(i, positions.getX(i) + velocities.getX(i) * speedRef.current * dtSim);
                positions.setY(i, positions.getY(i) + velocities.getY(i) * speedRef.current * dtSim);
                positions.setZ(i, positions.getZ(i) + velocities.getZ(i) * speedRef.current * dtSim);

                const distSq = positions.getX(i)**2 + positions.getY(i)**2 + positions.getZ(i)**2;
                if (distSq > maxRadiusSq) {
                    positions.setXYZ(i, 0, 0, 0);
                }
              }
              positions.needsUpdate = true;
            }
            break;
          }
          case ParticleBackgroundMode.AetherFlow: {
            const aether = backgroundGroup.children[0] as THREE.Points;
            if (aether) {
              const positions = aether.geometry.attributes.position;
              for (let i = 0; i < positions.count; i++) {
                let x = positions.getX(i);
                x += 0.02 * speedRef.current * dtSim;
                if (x > 25) {
                    x = -25;
                }
                positions.setX(i, x);
              }
              positions.needsUpdate = true;
            }
            break;
          }
        }

        // Mode specific animations
        const group = modeObjectsRef.current;
        switch(orbMode) {
            case OrbMode.CrystallineMatrix:
                group.rotation.y += 0.0005 * currentSpeed;
                group.children.forEach(crystal => {
                    if (crystal instanceof THREE.Mesh && crystal.geometry instanceof THREE.BoxGeometry && crystal.userData?.rotationSpeed) {
                      crystal.rotation.x += crystal.userData.rotationSpeed.x * currentSpeed;
                      crystal.rotation.y += crystal.userData.rotationSpeed.y * currentSpeed;
                    }
                });
                break;
            case OrbMode.EntropicStorm:
            case OrbMode.ChaoticNucleus:
                const storm = group.children.find(c => c instanceof THREE.Points) as THREE.Points | undefined;
                if (storm && storm.userData?.velocities) {
                    const positions = storm.geometry.attributes.position;
                    const velocities = storm.userData.velocities;
                    const entropyFactor = entropyValue * (orbMode === OrbMode.ChaoticNucleus ? 0.35 : 0.2);
                    for (let i=0; i < positions.count; i++) {
                        velocities[i].x += (Math.random() - 0.5) * entropyFactor * 0.01;
                        velocities[i].y += (Math.random() - 0.5) * entropyFactor * 0.01;
                        velocities[i].z += (Math.random() - 0.5) * entropyFactor * 0.01;
                        positions.setX(i, positions.getX(i) + velocities[i].x * currentSpeed);
                        positions.setY(i, positions.getY(i) + velocities[i].y * currentSpeed);
                        positions.setZ(i, positions.getZ(i) + velocities[i].z * currentSpeed);
                        const dSq = positions.getX(i)**2 + positions.getY(i)**2 + positions.getZ(i)**2;
                        if (dSq > 10**2) {
                            positions.setXYZ(i, (Math.random()-0.5)*2, (Math.random()-0.5)*2, (Math.random()-0.5)*2);
                        }
                    }
                    positions.needsUpdate = true;
                }
                group.children.filter(c => c instanceof THREE.Mesh).forEach(shard => {
                  if (shard.userData?.rotSpeed) {
                    shard.rotation.x += shard.userData.rotSpeed.x * currentSpeed;
                    shard.rotation.y += shard.userData.rotSpeed.y * currentSpeed;
                  }
                });
                break;
            case OrbMode.AethericWeave:
                group.rotation.y += 0.001 * speedRef.current;
                group.children.forEach((strand, i) => {
                    if (strand instanceof THREE.Mesh && strand.material instanceof THREE.ShaderMaterial) {
                      strand.material.uniforms.uTime.value = elapsedTime + i * 0.2;
                    }
                });
                break;
            case OrbMode.StarlightConductor:
                const star = group.children[0] as THREE.Mesh;
                if(star) star.rotation.y += 0.002 * speedRef.current;
                const starfield = group.children[1] as THREE.Points;
                if(starfield) starfield.rotation.y += 0.0003 * speedRef.current;
                break;
            case OrbMode.VoidShell:
                group.rotation.y += 0.001 * speedRef.current;
                const voidParticles = group.children[1] as THREE.Points;
                if(voidParticles) voidParticles.rotation.y += 0.002 * speedRef.current;
                break;
            case OrbMode.BioLattice:
                group.rotation.y += 0.001 * speedRef.current;
                group.children.forEach((node, i) => {
                    if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshBasicMaterial) {
                      const pulse = 0.5 + Math.sin(elapsedTime * 2 + i * 0.5) * 0.5;
                      node.material.opacity = 0.4 + pulse * 0.5;
                    }
                });
                break;
            case OrbMode.ResonantSpire:
                group.rotation.y += 0.0015 * speedRef.current;
                const spireContainer = group.children[0];
                if (spireContainer) {
                    spireContainer.children.forEach(child => {
                        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.TorusGeometry) {
                            child.rotation.z += child.userData.rotationSpeed * speedRef.current;
                        }
                        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry) {
                            // Pulse the tip
                            const pulse = 0.5 + Math.sin(elapsedTime * 3) * 0.5;
                            (child.material as THREE.MeshBasicMaterial).color.setHSL(0, 0, 0.8 + pulse * 0.2);
                        }
                    });
                }
                break;
            case OrbMode.TemporalRift:
                 group.rotation.y += 0.0008 * speedRef.current;
                 group.children.forEach((plane, i) => {
                    if (plane instanceof THREE.Mesh && plane.material instanceof THREE.ShaderMaterial) {
                      plane.material.uniforms.uTime.value = elapsedTime * (1 + i*0.1);
                    }
                 });
                break;
        }

        // Gateway ring (Agent): the 4 gateways orbit the core. Idle
        // drift only — drag orbits the CAMERA (OrbitControls), not the
        // ring. Labels fade on the far side (v0.1.4: a far-side label
        // renders through the additive orb) and scale up on hover.
        if (gatewayGroupRef.current) {
            gatewayGroupRef.current.rotation.y += 0.001 * dtSim;
            gatewayGroupRef.current.children.forEach((child) => {
                if (child instanceof THREE.Group && child.userData.type === 'gateway') {
                    child.children.forEach((c) => {
                        if (c instanceof THREE.Sprite) {
                            const targetScale = (intersectedRef.current && intersectedRef.current.userData.id === child.userData.id) ? 1.2 : 1.0;
                            c.scale.lerp(new THREE.Vector3(6 * targetScale, 1.5 * targetScale, 1), 0.1);
                            const worldPos = new THREE.Vector3();
                            child.getWorldPosition(worldPos);
                            const facing = worldPos.normalize().dot(camera.position.clone().normalize());
                            const targetOpacity = facing > -0.25 ? 0.8 : 0;
                            const spriteMat = c.material as THREE.SpriteMaterial;
                            spriteMat.opacity += (targetOpacity - spriteMat.opacity) * 0.1;
                        }
                    });

                    // Rotate the mini sphere
                    const sphere = child.children[0];
                    if (sphere) {
                        sphere.rotation.y += 0.02 * dtSim;
                        sphere.rotation.z += 0.01 * dtSim;
                    }
                }
            });
        }

        // Hover: the core orb + the 4 gateway nodes are the
        // interactables. (The OS file also raycast axiom + panel nodes;
        // those systems are Phase C and are not ported — the Agent's
        // orbiting nodes are the gateways.) A hovered gateway plays the
        // hover sound once per change, as the vendored orb did. The OS
        // file also tweened the core's uEntropy to 1.0 on hover with
        // gsap — that tween is dead against the per-frame write of the
        // same uniform in the loop above, so it is not ported.
        raycaster.setFromCamera(mouse, camera);
        const gatewayNodes = gatewayGroupRef.current ? gatewayGroupRef.current.children : [];
        const hoverCoreOrb = resolveCoreOrb();
        const hoverInteractables: THREE.Object3D[] = hoverCoreOrb ? [...gatewayNodes, hoverCoreOrb] : [...gatewayNodes];
        if (modeObjectsRef.current) {
            hoverInteractables.push(...modeObjectsRef.current.children);
        }

        const intersects = raycaster.intersectObjects(hoverInteractables, true);
        let firstIntersect: THREE.Object3D | null = null;
        if (intersects.length > 0) {
            let obj: THREE.Object3D | null = intersects[0].object;
            while (obj && obj !== scene) {
                if (obj.name === 'core_orb' || obj.userData?.type === 'gateway') {
                    firstIntersect = obj;
                    break;
                }
                obj = obj.parent;
            }
            if (!firstIntersect) firstIntersect = intersects[0].object;
        }

        let isHoveringCore = false;
        if (firstIntersect) {
            let curr: THREE.Object3D | null = firstIntersect;
            while (curr) {
                if (curr.name === 'core_orb') {
                    isHoveringCore = true;
                    break;
                }
                curr = curr.parent;
            }
        }

        if (isHoveringCore && firstIntersect) {
            if (hoveredCoreRef.current !== firstIntersect) {
                hoveredCoreRef.current = firstIntersect;
                document.body.style.cursor = 'pointer';
            }
            intersectedRef.current = firstIntersect;
        } else {
            if (hoveredCoreRef.current) {
                document.body.style.cursor = 'default';
                hoveredCoreRef.current = null;
            }

            if (firstIntersect && firstIntersect.userData?.type === 'gateway') {
                if (intersectedRef.current !== firstIntersect) {
                    intersectedRef.current = firstIntersect;
                    audio.cardHover();
                    document.body.style.cursor = 'pointer';
                }
            } else {
                if (intersectedRef.current) {
                    intersectedRef.current = null;
                }
                document.body.style.cursor = 'default';
            }
        }

        // --- Interaction & Physical Physics Simulation of Particles / Meshes ---
        if (clickWave3D.active) {
            clickWave3D.radius += 0.55 * speedRef.current * dtSim; // Faster expansion velocity
            clickWave3D.force *= Math.pow(0.92, dtSim); // Safe exponential friction decay
            if (clickWave3D.force < 0.002 || clickWave3D.radius > 18.0) {
                clickWave3D.active = false;
                clickWave3D.force = 0;
                clickWave3D.radius = 0;
                clickWave3D.position.set(-1000, -1000, -1000);
            }
        } else {
            clickWave3D.force = 0;
            clickWave3D.radius = 0;
        }

        // Sync local cursor projected 3D plane
        if (mouseActive) {
            raycaster.setFromCamera(mouse, camera);
            const planeNormal = new THREE.Vector3();
            camera.getWorldDirection(planeNormal).negate();
            const plane = new THREE.Plane(planeNormal, 0);
            raycaster.ray.intersectPlane(plane, mouse3D);
        } else {
            mouse3D.set(-1000, -1000, -1000);
        }

        // Extract camera direction once per frame for screen-space calculations
        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir).normalize();

        // Interact on all active Points systems (background + mode-specific)
        const interactWithPoints = (points: THREE.Points) => {
            const positions = points.geometry.attributes.position;
            if (!positions) return;
            const count = positions.count;
            if (!points.userData.physicsInited) {
                points.userData.physicsInited = true;
                points.userData.physicsVelocities = new Float32Array(count * 3);
                points.userData.physicsOffsets = new Float32Array(count * 3);
                points.userData.originalPositions = (positions.array as Float32Array).slice();
            }
            const vels = points.userData.physicsVelocities;
            const offsets = points.userData.physicsOffsets;
            const posArr = positions.array as Float32Array;
            const origArr = points.userData.originalPositions;

            // Resolve dynamic colors array for multi-spectral responsive shifting
            const colorsAttr = points.geometry.attributes.color;
            const colorsArr = colorsAttr ? colorsAttr.array as Float32Array : null;
            if (colorsAttr && !points.userData.originalColors) {
                // v0.1.6 (Phase B): strict-mode fix — colorsAttr is
                // truthy in this branch, so its array is non-null; the
                // compiler cannot see that through the colorsArr
                // ternary above. No behavior change.
                points.userData.originalColors = (colorsAttr.array as Float32Array).slice();
            }
            const origColors = points.userData.originalColors;

            const pointsWorldPos = new THREE.Vector3();
            points.getWorldPosition(pointsWorldPos);
            
            const localMouse = mouse3D.clone().sub(pointsWorldPos);
            const invRotation = points.quaternion.clone().invert();
            localMouse.applyQuaternion(invRotation);
            
            const localClickPos = clickWave3D.position.clone().sub(pointsWorldPos).applyQuaternion(invRotation);
            
            const repelRadius = 5.0; // Slightly larger for better range and tactility
            const repelRadiusSq = repelRadius * repelRadius;
            const clickActive = clickWave3D.active;
            const clickRadius = clickWave3D.radius;
            const clickRadiusSq = clickRadius * clickRadius;
            const clickForce = clickWave3D.force;
            const speedFact = speedRef.current;

            for (let i = 0; i < count; i++) {
                const i3 = i * 3;
                let ox = offsets[i3];
                let oy = offsets[i3 + 1];
                let oz = offsets[i3 + 2];
                
                let vx = vels[i3];
                let vy = vels[i3 + 1];
                let vz = vels[i3 + 2];
                
                const k = 0.085; // Snappy return spring
                vx += -ox * k * dtSim;
                vy += -oy * k * dtSim;
                vz += -oz * k * dtSim;
                
                const px = origArr[i3];
                const py = origArr[i3 + 1];
                const pz = origArr[i3 + 2];

                let mouseDist = -1;
                let hoverIntensity = 0;
                
                if (mouse3D.x > -900) {
                    const dx = px - localMouse.x;
                    const dy = py - localMouse.y;
                    const dz = pz - localMouse.z;
                    const distSq = dx*dx + dy*dy + dz*dz;
                    if (distSq < repelRadiusSq && distSq > 0.0001) {
                        mouseDist = Math.sqrt(distSq);
                        hoverIntensity = (repelRadius - mouseDist) / repelRadius;
                        
                        // Linear push force (repulsion)
                        const push = hoverIntensity * hoverIntensity * 0.32 * speedFact * dtSim;
                        const invDist = 1 / mouseDist;
                        const pX = dx * invDist;
                        const pY = dy * invDist;
                        const pZ = dz * invDist;
                        vx += pX * push;
                        vy += pY * push;
                        vz += pZ * push;

                        // Screen-space circular swirl tangent (cross product of direction with camera vector)
                        // Bends the particles into a liquid magnetic vortex around the cursor!
                        const tx = pY * cameraDir.z - pZ * cameraDir.y;
                        const ty = pZ * cameraDir.x - pX * cameraDir.z;
                        const tz = pX * cameraDir.y - pY * cameraDir.x;
                        const swirl = hoverIntensity * 0.48 * speedFact * dtSim;
                        vx += tx * swirl;
                        vy += ty * swirl;
                        vz += tz * swirl;
                    }
                }

                let waveIntensity = 0;
                if (clickActive) {
                    const dx = px - localClickPos.x;
                    const dy = py - localClickPos.y;
                    const dz = pz - localClickPos.z;
                    const distSq = dx*dx + dy*dy + dz*dz;
                    if (distSq < clickRadiusSq && distSq > 0.0001) {
                        const dist = Math.sqrt(distSq);
                        const ratio = (clickRadius - dist) / clickRadius;
                        
                        // Push outward along shockwave wavefront
                        const blast = ratio * clickForce * 0.65 * speedFact * dtSim;
                        const invDist = 1 / dist;
                        const bX = dx * invDist;
                        const bY = dy * invDist;
                        const bZ = dz * invDist;
                        vx += bX * blast;
                        vy += bY * blast;
                        vz += bZ * blast;

                        // Shockwave swirling wavefront shear (creates a gorgeous spiraling ripple)
                        const tx = bY * cameraDir.z - bZ * cameraDir.y;
                        const ty = bZ * cameraDir.x - bX * cameraDir.z;
                        const tz = bX * cameraDir.y - bY * cameraDir.x;
                        const shear = ratio * clickForce * 0.38 * speedFact * dtSim;
                        vx += tx * shear;
                        vy += ty * shear;
                        vz += tz * shear;

                        // Precision wave ring highlighter
                        const waveWidth = 2.2;
                        const waveDist = Math.abs(dist - clickRadius);
                        if (waveDist < waveWidth) {
                            waveIntensity = (1.0 - waveDist / waveWidth) * (clickForce / 3.5);
                        }
                    }
                }
                
                // Damping scaled relative to time step
                const damping = Math.pow(0.86, dtSim);
                vx *= damping;
                vy *= damping;
                vz *= damping;
                
                ox += vx * dtSim;
                oy += vy * dtSim;
                oz += vz * dtSim;
                
                vels[i3] = vx;
                vels[i3 + 1] = vy;
                vels[i3 + 2] = vz;
                
                offsets[i3] = ox;
                offsets[i3 + 1] = oy;
                offsets[i3 + 2] = oz;
                
                posArr[i3] = px + ox;
                posArr[i3 + 1] = py + oy;
                posArr[i3 + 2] = pz + oz;

                // Dynamically modify RGB values for high-tactility feedback
                if (colorsArr && origColors) {
                    const r0 = origColors[i3];
                    const g0 = origColors[i3 + 1];
                    const b0 = origColors[i3 + 2];

                    // Speed-based kinetic glow
                    const velocitySq = vx*vx + vy*vy + vz*vz;
                    const kineticGlow = Math.min(velocitySq * 0.15, 0.6);

                    // Hover golden-white plasma glow
                    const hoverGlow = hoverIntensity * 0.5;

                    // Click shockwave neon pink/fuchsia ignition ripple
                    const rippleGlow = waveIntensity * 1.5;

                    // Blend components (over-exposing RGB values slightly so they pop through the UnrealBloomPass)
                    let tr = r0 + kineticGlow * 0.4 + hoverGlow * 0.6 + rippleGlow * 1.0;
                    let tg = g0 + kineticGlow * 0.6 + hoverGlow * 0.8 + rippleGlow * 0.2;
                    let tb = b0 + kineticGlow * 1.0 + hoverGlow * 0.3 + rippleGlow * 1.0;

                    colorsArr[i3] = Math.min(tr, 1.5);
                    colorsArr[i3 + 1] = Math.min(tg, 1.5);
                    colorsArr[i3 + 2] = Math.min(tb, 1.5);
                }
            }
            positions.needsUpdate = true;
            if (colorsAttr) {
                colorsAttr.needsUpdate = true;
            }
        };

        const interactWithMesh = (child: THREE.Mesh) => {
            if (!child.userData.originalPos) {
                child.userData.originalPos = child.position.clone();
            }
            if (!child.userData.physicsVel) {
                child.userData.physicsVel = new THREE.Vector3();
            }
            if (!child.userData.physicsOffset) {
                child.userData.physicsOffset = new THREE.Vector3();
            }
            
            const targetPos = child.userData.originalPos;
            const vel = child.userData.physicsVel as THREE.Vector3;
            const offset = child.userData.physicsOffset as THREE.Vector3;
            
            const k = 0.11; // Harder & crisp resilient return spring constant for meshes
            vel.x += -offset.x * k * dtSim;
            vel.y += -offset.y * k * dtSim;
            vel.z += -offset.z * k * dtSim;
            
            // Resolve world child position once
            tempParentPos.set(0, 0, 0);
            if (child.parent) {
                child.parent.getWorldPosition(tempParentPos);
            }
            tempChildPos.copy(child.userData.originalPos).add(tempParentPos).add(offset);
            
            let mouseDist = -1;
            if (mouse3D.x > -900) {
                const dx = tempChildPos.x - mouse3D.x;
                const dy = tempChildPos.y - mouse3D.y;
                const dz = tempChildPos.z - mouse3D.z;
                const distSq = dx*dx + dy*dy + dz*dz;
                const repelRadius = 6.0;
                const repelRadiusSq = repelRadius * repelRadius;
                if (distSq < repelRadiusSq && distSq > 0.01) {
                    mouseDist = Math.sqrt(distSq);
                    const force = (repelRadius - mouseDist) / repelRadius;
                    
                    // Push force (away from mouse)
                    const push = force * force * 0.75 * speedRef.current * dtSim; // Stronger push force
                    const invDist = 1 / mouseDist;
                    const pX = dx * invDist;
                    const pY = dy * invDist;
                    const pZ = dz * invDist;
                    vel.x += pX * push;
                    vel.y += pY * push;
                    vel.z += pZ * push;

                    // Grid vortex orbital swing on meshes
                    const tx = pY * cameraDir.z - pZ * cameraDir.y;
                    const ty = pZ * cameraDir.x - pX * cameraDir.z;
                    const tz = pX * cameraDir.y - pY * cameraDir.x;
                    const swirl = force * 0.65 * speedRef.current * dtSim;
                    vel.x += tx * swirl;
                    vel.y += ty * swirl;
                    vel.z += tz * swirl;
                }
            }
            
            if (clickWave3D.active) {
                const dx = tempChildPos.x - clickWave3D.position.x;
                const dy = tempChildPos.y - clickWave3D.position.y;
                const dz = tempChildPos.z - clickWave3D.position.z;
                const distSq = dx*dx + dy*dy + dz*dz;
                const clickRadius = clickWave3D.radius;
                const clickRadiusSq = clickRadius * clickRadius;
                if (distSq < clickRadiusSq && distSq > 0.01) {
                    const dist = Math.sqrt(distSq);
                    const ratio = (clickRadius - dist) / clickRadius;
                    
                    // Blast force (push)
                    const blast = ratio * clickWave3D.force * 1.15 * speedRef.current * dtSim; // Deeper wave displacement
                    const invDist = 1 / dist;
                    const bX = dx * invDist;
                    const bY = dy * invDist;
                    const bZ = dz * invDist;
                    vel.x += bX * blast;
                    vel.y += bY * blast;
                    vel.z += bZ * blast;

                    // Shockwave swirling shear on meshes
                    const tx = bY * cameraDir.z - bZ * cameraDir.y;
                    const ty = bZ * cameraDir.x - bX * cameraDir.z;
                    const tz = bX * cameraDir.y - bY * cameraDir.x;
                    const shear = ratio * clickWave3D.force * 0.55 * speedRef.current * dtSim;
                    vel.x += tx * shear;
                    vel.y += ty * shear;
                    vel.z += tz * shear;
                }
            }
            
            const damping = Math.pow(0.86, dtSim);
            vel.x *= damping;
            vel.y *= damping;
            vel.z *= damping;
            
            offset.x += vel.x * dtSim;
            offset.y += vel.y * dtSim;
            offset.z += vel.z * dtSim;
            
            child.position.copy(targetPos).add(offset);

            // Expressive pulse scaling
            if (mouse3D.x > -900) {
                const dist = mouseDist >= 0 ? mouseDist : tempChildPos.distanceTo(mouse3D);
                if (dist < 6.0) {
                    const sf = 1.0 + (6.0 - dist) / 6.0 * 0.35;
                    child.scale.set(sf, sf, sf);
                } else {
                    child.scale.set(1, 1, 1);
                }
            } else {
                child.scale.set(1, 1, 1);
            }
        };

        const applyPointsInteraction = (obj: THREE.Object3D) => {
            if (obj instanceof THREE.Points) {
                interactWithPoints(obj);
            }
            obj.children.forEach(applyPointsInteraction);
        };
        applyPointsInteraction(group);

        group.children.forEach(child => {
            if (child instanceof THREE.Mesh && child.name !== 'core_orb' && !child.userData.isLatticeLine) {
                if (child.children.length > 0) {
                    child.children.forEach(subchild => {
                        if (subchild instanceof THREE.Mesh && subchild.name !== 'core_orb') {
                            interactWithMesh(subchild);
                        }
                    });
                } else {
                    interactWithMesh(child);
                }
            }
        });

        // Let standard shader materials consume mouse/click values
        group.children.forEach(child => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
                child.material.uniforms.uMouse.value.copy(mouse3D);
                child.material.uniforms.uClickPos.value.copy(clickWave3D.position);
                child.material.uniforms.uClickRadius.value = clickWave3D.radius;
                child.material.uniforms.uClickForce.value = clickWave3D.force;
            }
        });

        // Dynamic BioLattice line matching
        if (orbMode === OrbMode.BioLattice) {
            const latticeLinesObj = group.getObjectByName('lattice_lines') as THREE.LineSegments | undefined;
            if (latticeLinesObj && latticeLinesObj.userData.links) {
                const linksList = latticeLinesObj.userData.links as { nodeI: THREE.Mesh, nodeJ: THREE.Mesh }[];
                const linePositions = latticeLinesObj.geometry.attributes.position;
                if (linePositions) {
                    const posArr = linePositions.array as Float32Array;
                    for (let index = 0; index < linksList.length; index++) {
                        const { nodeI, nodeJ } = linksList[index];
                        const i6 = index * 6;
                        posArr[i6] = nodeI.position.x;
                        posArr[i6 + 1] = nodeI.position.y;
                        posArr[i6 + 2] = nodeI.position.z;
                        posArr[i6 + 3] = nodeJ.position.x;
                        posArr[i6 + 4] = nodeJ.position.y;
                        posArr[i6 + 5] = nodeJ.position.z;
                    }
                    linePositions.needsUpdate = true;
                }
            }
        }

        controls.update();
        try {
            if (composer) {
                composer.render();
            } else {
                renderer.render(scene, camera);
            }
        } catch (rErr) {
            renderer.render(scene, camera);
        }
        
        cssRenderer.render(scene, camera);
        } catch (frameErr: any) {
            console.error("CodexOrb frame error caught, recovering:", frameErr);
        }
    };
    animate();

    let localRenderer = renderer;
    let localCssRenderer = cssRenderer;
    let localScene = scene;
    let localControls = controls;
    return () => {
      domElement.removeEventListener('pointerdown', handlePointerDown);
      domElement.removeEventListener('pointerup', handlePointerUp);
      domElement.removeEventListener('touchstart', handleTouchStart);
      domElement.removeEventListener('touchend', handleTouchEnd);
      domElement.removeEventListener('touchcancel', handleTouchEnd);
      domElement.removeEventListener('touchmove', handleTouchMove);
      domElement.removeEventListener('mousemove', handleMouseMove);
      domElement.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('resize', handleResize);
      cleanup(localRenderer, localCssRenderer, localScene, localControls, resizeObserver);
    };
  }, [retryCount]);

  useEffect(() => {
    const group = modeObjectsRef.current;
    group.traverse((obj) => {
      if (obj !== group) {
        if ('geometry' in obj && (obj as any).geometry) {
          ((obj as any).geometry as THREE.BufferGeometry).dispose();
        }
        if ('material' in obj && (obj as any).material) {
          const material = (obj as any).material;
          const disposeMat = (m: any) => {
            if (m.map && typeof m.map.dispose === 'function') {
              m.map.dispose();
            }
            if (typeof m.dispose === 'function') {
              m.dispose();
            }
          };
          if (Array.isArray(material)) {
            material.forEach(disposeMat);
          } else if (material) {
            disposeMat(material);
          }
        }
      }
    });
    while(group.children.length > 0){ 
      group.remove(group.children[0]);
    }
    
    defaultOrbObjectsRef.current.visible = orbMode === OrbMode.HolographicCore;
    
    // Add a consistent, named, but invisible core orb for modes that don't have a clear one.
    const addInvisibleCore = () => {
        const coreGeo = new THREE.SphereGeometry(4, 16, 16);
        const coreMat = new THREE.MeshBasicMaterial({ visible: false });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.name = 'core_orb';
        group.add(core);
    };


    const createShaderMaterial = (uniforms: any) => new THREE.ShaderMaterial({
        uniforms: {
          ...uniforms,
          uMouse: { value: new THREE.Vector3(-1000, -1000, -1000) },
          uClickPos: { value: new THREE.Vector3(-1000, -1000, -1000) },
          uClickRadius: { value: 0 },
          uClickForce: { value: 0 }
        },
        vertexShader: `
            uniform vec3 uMouse;
            uniform vec3 uClickPos;
            uniform float uClickRadius;
            uniform float uClickForce;
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                
                // Hover deformation
                float hoverDist = distance(worldPos.xyz, uMouse);
                float hoverDisp = 0.0;
                if (hoverDist < 8.0 && hoverDist > 0.1) {
                  float f = (8.0 - hoverDist) / 8.0;
                  hoverDisp = f * f * 1.5;
                }

                // Click deformation
                float clickDist = distance(worldPos.xyz, uClickPos);
                float clickDisp = 0.0;
                if (clickDist < uClickRadius && clickDist > 0.1) {
                  float cf = (uClickRadius - clickDist) / uClickRadius;
                  clickDisp = cf * uClickForce * 2.0;
                }

                vec3 newPosition = position + normal * (hoverDisp + clickDisp);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uColor1;
            uniform vec3 uColor2;
            varying vec3 vNormal;
            void main() {
                float intensity = pow(0.5 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
                vec3 finalColor = mix(uColor1, uColor2, intensity * (0.5 + sin(uTime * 2.0) * 0.5));
                gl_FragColor = vec4(finalColor, intensity);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
    });

    switch (orbMode) {
      case OrbMode.CrystallineMatrix:
        const coreGeo = new THREE.DodecahedronGeometry(2.5, 0);
        const coreMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.8, emissive: 0xaaaaff, emissiveIntensity: 0.3 });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.name = 'core_orb';
        group.add(core);

        const crystalGeo = new THREE.BoxGeometry(0.3, 0.6, 0.3);
        const numCrystals = IS_MOBILE ? 15 : 40;
        for (let i = 0; i < numCrystals; i++) {
          const crystalMat = new THREE.MeshStandardMaterial({color: new THREE.Color().setHSL(Math.random(), 0.8, 0.6), metalness: 0.1, roughness: 0.2, transparent: true, opacity: 0.7});
          const crystal = new THREE.Mesh(crystalGeo, crystalMat);
          crystal.scale.set(Math.random() * 0.5 + 0.5, Math.random() * 1.5 + 0.5, Math.random() * 0.5 + 0.5);
          const phi = Math.acos(2 * Math.random() - 1);
          const theta = Math.random() * 2 * Math.PI;
          const r = 6 + Math.random() * 2;
          crystal.position.setFromSphericalCoords(r, phi, theta);
          crystal.lookAt(0, 0, 0);
          crystal.userData.rotationSpeed = new THREE.Vector3((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02);
          group.add(crystal);
        }
        break;
      case OrbMode.PhotoGallery:
        addInvisibleCore();
        if (photoSources && photoSources.length > 0) {
          photoSources.forEach((src, i) => {
            const loader = new THREE.TextureLoader();
            loader.load(src, (texture) => {
              const aspect = texture.image.width / texture.image.height;
              const photoGeo = new THREE.PlaneGeometry(3 * aspect, 3);
              const photoMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
              const photo = new THREE.Mesh(photoGeo, photoMat);
              
              const phi = Math.acos(2 * (i / photoSources.length) - 1);
              const theta = Math.sqrt(photoSources.length * Math.PI) * phi;
              const r = 10;
              photo.position.setFromSphericalCoords(r, phi, theta);
              photo.lookAt(0, 0, 0);
              photo.userData.isPhoto = true;
              photo.userData.originalPos = photo.position.clone();
              group.add(photo);
            });
          });
        } else {
          // Placeholder if no photos
          const placeholderGeo = new THREE.TorusGeometry(8, 0.2, 16, 100);
          const placeholderMat = new THREE.MeshBasicMaterial({ color: 0x333333, wireframe: true });
          group.add(new THREE.Mesh(placeholderGeo, placeholderMat));
        }
        break;
      case OrbMode.EntropicStorm:
      case OrbMode.ChaoticNucleus:
        addInvisibleCore(); // Add invisible core for interaction
        const stormGeo = new THREE.BufferGeometry();
        const stormPositions = [];
        const velocities = [];
        let numParticles = orbMode === OrbMode.ChaoticNucleus ? 1200 : 800;
        if (IS_MOBILE) {
          numParticles = Math.floor(numParticles / 4);
        }
        for (let i = 0; i < numParticles; i++) {
          stormPositions.push((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15);
          velocities.push(new THREE.Vector3((Math.random()-0.5)*0.1, (Math.random()-0.5)*0.1, (Math.random()-0.5)*0.1));
        }
        stormGeo.setAttribute('position', new THREE.Float32BufferAttribute(stormPositions, 3));
        const stormMat = new THREE.PointsMaterial({color: 0xff4400, size: 0.1, blending: THREE.AdditiveBlending, transparent: true});
        const storm = new THREE.Points(stormGeo, stormMat);
        storm.userData.velocities = velocities;
        group.add(storm);
         if (orbMode === OrbMode.ChaoticNucleus) {
            const shardGeo = new THREE.TetrahedronGeometry(1.5, 0);
            for(let i=0; i < 10; i++){
                const shardMat = new THREE.MeshBasicMaterial({color: 0xffffff, wireframe: true, transparent: true, opacity: 0.3});
                const shard = new THREE.Mesh(shardGeo.clone(), shardMat);
                shard.position.set((Math.random()-0.5)*8, (Math.random()-0.5)*8, (Math.random()-0.5)*8);
                shard.userData.rotSpeed = { x: (Math.random()-0.5)*0.02, y: (Math.random()-0.5)*0.02 };
                group.add(shard);
            }
        }
        break;
      case OrbMode.AethericWeave:
          addInvisibleCore();
          const numStrands = IS_MOBILE ? 5 : 15;
          const tubularSegments = IS_MOBILE ? 80 : 200;
          for(let i=0; i<numStrands; i++) {
              const strandGeo = new THREE.TorusKnotGeometry(6, 0.1, tubularSegments, 16, 2 + Math.floor(Math.random()*3), 3 + Math.floor(Math.random()*4));
              const strandMat = createShaderMaterial({ uTime: {value: 0}, uColor1: {value: new THREE.Color(0x8800ff)}, uColor2: {value: new THREE.Color(0x00ffff)} });
              const strand = new THREE.Mesh(strandGeo, strandMat);
              strand.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
              group.add(strand);
          }
          break;
      case OrbMode.StarlightConductor:
          const starGeo = new THREE.SphereGeometry(3, IS_MOBILE ? 16 : 32, IS_MOBILE ? 16 : 32);
          const starMat = new THREE.MeshBasicMaterial({color: 0xffffaa, transparent: true, opacity: 0.9});
          const star = new THREE.Mesh(starGeo, starMat);
          star.name = 'core_orb';
          group.add(star);
          const starfieldGeo = new THREE.BufferGeometry();
          const starfieldPos = [];
          const numStarfield = IS_MOBILE ? 500 : 2000;
          for (let i = 0; i < numStarfield; i++) {
              starfieldPos.push((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50);
          }
          starfieldGeo.setAttribute('position', new THREE.Float32BufferAttribute(starfieldPos, 3));
          const starfieldMat = new THREE.PointsMaterial({color: 0xffffff, size: 0.08});
          const starfield = new THREE.Points(starfieldGeo, starfieldMat);
          group.add(starfield);
          break;
      case OrbMode.VoidShell:
          const shellGeo = new THREE.SphereGeometry(7, IS_MOBILE ? 24 : 64, IS_MOBILE ? 24 : 64);
          const shellMat = new THREE.MeshStandardMaterial({color: 0x111111, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.3, side: THREE.BackSide});
          const shell = new THREE.Mesh(shellGeo, shellMat);
          shell.name = 'core_orb';
          group.add(shell);
          const voidParticleGeo = new THREE.BufferGeometry();
          const voidParticlePos = [];
          const numVoidParticles = IS_MOBILE ? 100 : 300;
          for (let i = 0; i < numVoidParticles; i++) {
              voidParticlePos.push((Math.random() - 0.5) * 13, (Math.random() - 0.5) * 13, (Math.random() - 0.5) * 13);
          }
          voidParticleGeo.setAttribute('position', new THREE.Float32BufferAttribute(voidParticlePos, 3));
          const voidParticleMat = new THREE.PointsMaterial({color: 0x333333, size: 0.05, transparent: true, opacity: 0.5});
          const voidParticles = new THREE.Points(voidParticleGeo, voidParticleMat);
          group.add(voidParticles);
          break;
      case OrbMode.BioLattice:
          addInvisibleCore();
          const nodeGeo = new THREE.SphereGeometry(0.2, IS_MOBILE ? 8 : 12, IS_MOBILE ? 8 : 12);
          const positions = [];
          const latticeSize = IS_MOBILE ? 15 : 40;
          for(let i=0; i<latticeSize; i++) {
              positions.push(new THREE.Vector3((Math.random()-0.5)*15, (Math.random()-0.5)*15, (Math.random()-0.5)*15));
              const nodeMat = new THREE.MeshBasicMaterial({color: 0x00ff88, transparent: true, opacity: 0.8});
              const node = new THREE.Mesh(nodeGeo, nodeMat);
              node.position.copy(positions[i]);
              node.userData.isLatticeNode = true;
              node.userData.latticeIndex = i;
              group.add(node);
          }
          const links: { nodeI: THREE.Mesh, nodeJ: THREE.Mesh }[] = [];
          const segmentPoints: THREE.Vector3[] = [];
          const nodesInGroup = group.children.filter(c => c.userData.isLatticeNode) as THREE.Mesh[];

          for(let i=0; i<latticeSize; i++) {
              for(let j=i+1; j<latticeSize; j++) {
                  if(positions[i].distanceTo(positions[j]) < 4.5) {
                      const nodeI = nodesInGroup.find(n => n.userData.latticeIndex === i);
                      const nodeJ = nodesInGroup.find(n => n.userData.latticeIndex === j);
                      if (nodeI && nodeJ) {
                          links.push({ nodeI, nodeJ });
                          segmentPoints.push(nodeI.position, nodeJ.position);
                      }
                  }
              }
          }
          if (segmentPoints.length > 0) {
              const lineGeo = new THREE.BufferGeometry().setFromPoints(segmentPoints);
              const lineMat = new THREE.LineBasicMaterial({color: 0x00ff88, transparent: true, opacity: 0.2});
              const latticeLinesObj = new THREE.LineSegments(lineGeo, lineMat);
              latticeLinesObj.name = 'lattice_lines';
              latticeLinesObj.userData.isLatticeLineSegments = true;
              latticeLinesObj.userData.links = links;
              group.add(latticeLinesObj);
          }
          break;
      case OrbMode.ResonantSpire:
          const spireContainer = new THREE.Group();
          const spireGeo = new THREE.CylinderGeometry(0, 2.5, 12, IS_MOBILE ? 4 : 6);
          const spireMat = new THREE.MeshStandardMaterial({color: 0x88aaff, metalness: 0.3, roughness: 0.2, transparent: true, opacity: 0.8});
          const spire = new THREE.Mesh(spireGeo, spireMat);
          spire.name = 'core_orb';
          spireContainer.add(spire);

          const tipGeo = new THREE.SphereGeometry(0.5, IS_MOBILE ? 8 : 16, IS_MOBILE ? 8 : 16);
          const tipMat = new THREE.MeshBasicMaterial({color: 0xffffff});
          const tip = new THREE.Mesh(tipGeo, tipMat);
          tip.position.y = 6;
          spireContainer.add(tip);

          // Add resonant rings
          const ringGeo = new THREE.TorusGeometry(4, 0.1, 8, IS_MOBILE ? 24 : 48);
          for(let i=0; i<3; i++){
              const ringMat = new THREE.MeshBasicMaterial({
                  color: new THREE.Color().setHSL(0.6 + i*0.1, 0.9, 0.7),
              });
              const ring = new THREE.Mesh(ringGeo.clone(), ringMat);
              ring.position.y = -4 + i * 3;
              ring.rotation.x = Math.PI / 2;
              ring.scale.setScalar(1 - i * 0.1);
              ring.userData.rotationSpeed = 0.01 + i * 0.005;
              spireContainer.add(ring);
          }
          group.add(spireContainer);
          break;
      case OrbMode.TemporalRift:
          addInvisibleCore();
          const riftPlanesCount = IS_MOBILE ? 2 : 5;
          const riftResolution = IS_MOBILE ? 12 : 32;
          for(let i=0; i<riftPlanesCount; i++) {
              const riftGeo = new THREE.PlaneGeometry(15, 15, riftResolution, riftResolution);
              const riftMat = createShaderMaterial({ uTime: {value: 0}, uColor1: {value: new THREE.Color().setHSL(Math.random(), 0.7, 0.5)}, uColor2: {value: new THREE.Color().setHSL(Math.random(), 0.7, 0.5)} });
              const riftPlane = new THREE.Mesh(riftGeo, riftMat);
              riftPlane.position.set((Math.random()-0.5)*3, (Math.random()-0.5)*3, (Math.random()-0.5)*3);
              riftPlane.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
              group.add(riftPlane);
          }
          break;
    }
  }, [orbMode]);

  // Camera controls for the HUD (OS): focus zooms to the OS file's focus
  // distance; reset returns to the default view. Zoom itself needs no
  // button — OrbitControls already zooms on wheel/pinch.
  const focusOrb = () => {
    if (cameraRef.current && controlsRef.current) {
      gsap.to(cameraRef.current.position, { x: 0, y: 0, z: 14, duration: 1, ease: 'power2.inOut' });
      gsap.to(controlsRef.current.target, { x: 0, y: 0, z: 0, duration: 1, ease: 'power2.inOut', onUpdate: () => controlsRef.current?.update() });
    }
  };
  const resetView = () => {
    if (cameraRef.current && controlsRef.current) {
      gsap.to(cameraRef.current.position, { x: 0, y: 0, z: 25, duration: 1, ease: 'power2.inOut' });
      gsap.to(controlsRef.current.target, { x: 0, y: 0, z: 0, duration: 1, ease: 'power2.inOut', onUpdate: () => controlsRef.current?.update() });
    }
  };

  if (rendererError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-8 text-center">
        <div className="max-w-md space-y-6">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-rose-400">3D Engine Context Lost</h2>
          <p className="text-slate-400 font-mono text-sm leading-relaxed">
            The browser has reached its WebGL limit or the GPU context was lost.
            Closing other tabs that use WebGL can help.
          </p>
          <button
            onClick={() => {
                setRendererError(false);
                setRetryCount(prev => prev + 1);
            }}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-mono text-sm transition-all shadow-lg hover:shadow-emerald-500/20"
          >
            RETRY INITIALIZATION
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={mountRef} className="absolute inset-0 z-10 pointer-events-auto touch-none" />

      {/* HUD (OS, trimmed): Focus + Reset only. The OS file's zoom
          buttons are not ported — OrbitControls already zooms on
          wheel/pinch, and a 4-button stack would cover the gateway ring
          in a 340-520px panel. Text labels, not the OS's Remix Icon
          font (ri-*), which this app does not ship. */}
      <div className="absolute bottom-4 right-4 z-[500] flex gap-2 select-none pointer-events-auto">
        <button
          type="button"
          onClick={focusOrb}
          className="px-3 py-2 rounded-xl bg-slate-950/85 border border-emerald-500/40 hover:border-emerald-400 text-emerald-400 text-xs font-mono backdrop-blur-md transition-all active:scale-95"
          title="Focus Nexus Orb"
        >
          Focus
        </button>
        <button
          type="button"
          onClick={resetView}
          className="px-3 py-2 rounded-xl bg-slate-950/85 border border-cyan-500/30 hover:border-cyan-400 text-cyan-400 text-xs font-mono backdrop-blur-md transition-all active:scale-95"
          title="Reset Viewport"
        >
          Reset
        </button>
      </div>

      {!selectedGateway && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 text-center pointer-events-none">
          <h1 className="text-4xl font-serif-elegant tracking-wider text-white/90 animate-pulseText">The Nexus Orb</h1>
          <p className="text-cyan-300/70 mt-2">Select a Gateway Node</p>
        </div>
      )}

      {selectedGateway && (
        <ProjectViewer
          gateway={selectedGateway}
          onClose={() => setSelectedGateway(null)}
          onNavigate={onNavigate}
          onNavigateExternal={onNavigateExternal}
        />
      )}
    </>
  );
};

export default CodexOrbSystem;
