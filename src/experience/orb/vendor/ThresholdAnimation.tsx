/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/nvknexusorb/ThresholdAnimation.tsx
 * GitHub blob SHA: 46454ed
 * Do not simplify away: this file is the original implementation, kept verbatim
 * except for import-path fixes noted inline where the layout changed.
 */

import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

interface NexusPortalProps {
  onAnimationEnd: () => void;
  animationType: number;
}

const vertexShader = `
  uniform float uTime;
  uniform float uProgress;
  uniform float uAnimationType;

  attribute float aScale;
  attribute vec3 aColor;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vDepth;

  // Easing function
  float easeOutCubic(float t) {
    return 1.0 - pow(1.0 - t, 3.0);
  }
  float easeInOutCubic(float t) {
    return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
  }

  void main() {
    vColor = aColor;
    vec3 pos = position;
    float easeProgress = easeInOutCubic(uProgress);

    // --- Animation Logic based on Type ---

    // Type 0: Quantum Vortex (Original)
    if (uAnimationType == 0.0) {
      float vortexProgress = min(easeProgress / 0.7, 1.0);
      float angle = atan(pos.x, pos.y);
      float dist = length(pos.xy);
      
      float swirlStrength = vortexProgress * 30.0;
      angle += (1.0/(dist + 0.1)) * swirlStrength * 0.1 * (1.0 - vortexProgress * 0.5);
      dist = mix(dist, 0.0, pow(vortexProgress, 2.0) * 0.8);
      pos.x = cos(angle) * dist;
      pos.y = sin(angle) * dist;
      pos.z += easeProgress * 150.0;

      float stretchProgress = clamp((easeProgress - 0.5) / 0.4, 0.0, 1.0);
      pos.z *= 1.0 + stretchProgress * 20.0;
      
      float fadeProgress = clamp((easeProgress - 0.8) / 0.2, 0.0, 1.0);
      pos.xy *= (1.0 - fadeProgress);
      vAlpha = (1.0 - fadeProgress);
    }
    // Type 1: Wormhole Collapse
    else if (uAnimationType == 1.0) {
      float twistProgress = min(easeProgress / 0.9, 1.0);
      float twistAngle = pos.z * 0.05 + uTime * 1.5;
      float c = cos(twistAngle);
      float s = sin(twistAngle);
      mat2 rot = mat2(c, -s, s, c);
      pos.xy = rot * pos.xy;
      pos.z += easeProgress * 180.0;

      float pinchProgress = easeProgress;
      pos.xy *= 1.0 - pinchProgress * 0.8;

      float fadeProgress = clamp((easeProgress - 0.85) / 0.15, 0.0, 1.0);
      vAlpha = 1.0 - fadeProgress;
    }
    // Type 2: Starlight Dash
    else if (uAnimationType == 2.0) {
      pos.z += easeProgress * 300.0;
      float stretchProgress = clamp((easeProgress - 0.1) / 0.8, 0.0, 1.0);
      pos.z *= 1.0 + pow(stretchProgress, 2.0) * 50.0;

      float fadeProgress = clamp((easeProgress - 0.7) / 0.3, 0.0, 1.0);
      vAlpha = 1.0 - fadeProgress;
    }
    // Type 3: Cosmic Bloom
    else if (uAnimationType == 3.0) {
      float collapseProgress = clamp(uProgress / 0.4, 0.0, 1.0);
      float expandProgress = clamp((uProgress - 0.45) / 0.55, 0.0, 1.0);
      
      vec3 originPos = position * (1.0 - easeInOutCubic(collapseProgress));
      
      vec3 dir = normalize(position);
      vec3 expandPos = dir * pow(easeOutCubic(expandProgress), 1.5) * 120.0;
      
      pos = originPos + expandPos;
      
      vAlpha = sin(expandProgress * 3.14159);
    }


    vec4 modelViewPosition = modelViewMatrix * vec4(pos, 1.0);
    vDepth = -modelViewPosition.z;
    gl_Position = projectionMatrix * modelViewPosition;
    
    float pointSize = (25.0 * aScale) * (1.0 - clamp((easeProgress - 0.9) / 0.1, 0.0, 1.0));
    gl_PointSize = pointSize * (20.0 / -modelViewPosition.z);
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vDepth;
  uniform float uProgress;
  uniform float uTime;
  uniform float uAnimationType;

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    float strength = distance(gl_PointCoord, vec2(0.5));
    if (strength > 0.5) discard;
    float circleAlpha = 1.0 - strength * 2.0;
    
    vec3 baseColor;
    float seed = vColor.r; // Use red channel as a random seed

    // Type 0: Quantum Vortex
    if (uAnimationType == 0.0) {
        float hue = mod(uProgress * 0.5 + seed * 0.3, 1.0);
        float depthFactor = smoothstep(50.0, 250.0, vDepth);
        float saturation = 1.0 - depthFactor * 0.7;
        float value = 1.0 + depthFactor * 0.5;
        float stretchProgress = clamp((uProgress - 0.5) / 0.4, 0.0, 1.0);
        if (stretchProgress > 0.1 && stretchProgress < 0.9) {
            float flicker = sin(vDepth * 10.0 + uTime * 20.0) * 0.5 + 0.5;
            hue = mod(hue + flicker * 0.1, 1.0);
        }
        baseColor = hsv2rgb(vec3(hue, saturation, value));
    }
    // Type 1: Wormhole Collapse (Blues/Purples)
    else if (uAnimationType == 1.0) {
        float hue = 0.6 + sin(vDepth * 0.05 + uTime * 0.5) * 0.1;
        baseColor = hsv2rgb(vec3(hue, 0.9, 1.2));
    }
    // Type 2: Starlight Dash (White/Cyan)
    else if (uAnimationType == 2.0) {
        baseColor = vec3(0.8, 0.95, 1.0) * (1.0 + vColor.b * 0.2);
    }
    // Type 3: Cosmic Bloom (Fiery Oranges/Yellows)
    else if (uAnimationType == 3.0) {
        float hue = 0.05 + (1.0 - vAlpha) * 0.1 + seed * 0.05;
        float saturation = 1.0 - vAlpha * 0.3;
        baseColor = hsv2rgb(vec3(hue, saturation, 1.0));
    }
    
    float coreGlow = smoothstep(0.2, 0.0, strength) * 0.5;
    vec3 finalColor = baseColor + coreGlow;
    
    gl_FragColor = vec4(finalColor, vAlpha * circleAlpha);
  }
`;


const NexusPortal: React.FC<NexusPortalProps> = ({ onAnimationEnd, animationType }) => {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const DURATION = 6000;
        const animationEndTimer = setTimeout(onAnimationEnd, DURATION);
        
        if (!mountRef.current) return;
        const mount = mountRef.current;
        let animationFrameId: number;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 100;

        let renderer: THREE.WebGLRenderer | null = null;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        } catch (e) {
            console.warn("High-performance WebGL context failed, falling back.", e);
            try {
                renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
            } catch (e2) {
                console.warn("Standard WebGL context failed, falling back to minimal.", e2);
                try {
                    renderer = new THREE.WebGLRenderer({ alpha: true });
                } catch (e3) {
                    console.error("Critical: All WebGL context creation attempts failed.", e3);
                }
            }
        }
        
        if (!renderer) return;

        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mount.appendChild(renderer.domElement);

        const renderScene = new RenderPass(scene, camera);
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
        const composer = new EffectComposer(renderer);
        composer.addPass(renderScene);
        composer.addPass(bloomPass);
        
        const particleCount = 100000;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const scales = new Float32Array(particleCount);
        const colors = new Float32Array(particleCount * 3);
        
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            const radius = Math.random() * 15 + 2;
            const angle = Math.random() * Math.PI * 2;
            positions[i3] = Math.cos(angle) * radius;
            positions[i3+1] = Math.sin(angle) * radius;
            positions[i3+2] = (Math.random() - 1.0) * 100;
            scales[i] = Math.random() * 0.5 + 0.5;

            const c = new THREE.Color();
            c.setHSL(Math.random(), 1.0, 0.7);
            c.toArray(colors, i3);
        }
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
        particleGeometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

        const particleMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uProgress: { value: 0 },
                uAnimationType: { value: animationType },
            },
            vertexShader,
            fragmentShader,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
        });
        const particles = new THREE.Points(particleGeometry, particleMaterial);
        scene.add(particles);

        const whiteoutGeom = new THREE.PlaneGeometry(window.innerWidth, window.innerHeight);
        const whiteoutMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
        const whiteoutPlane = new THREE.Mesh(whiteoutGeom, whiteoutMat);
        whiteoutPlane.position.z = camera.position.z - 1;
        scene.add(whiteoutPlane);
        
        const clock = new THREE.Clock();
        const startTime = clock.getElapsedTime();
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            const elapsed = clock.getElapsedTime() - startTime;
            const progress = Math.min(elapsed / (DURATION / 1000), 1.0);
            
            particleMaterial.uniforms.uTime.value = elapsed;
            particleMaterial.uniforms.uProgress.value = progress;
            
            // Camera animations
            if (animationType !== 3) { // For all except bloom
                 camera.position.z = 100 - progress * 100;
                 const shake = Math.sin(progress * Math.PI * 8) * (1.0 - progress) * 0.2;
                 camera.position.x = shake;
                 camera.position.y = -shake;
                 camera.lookAt(0,0,0);
            } else { // For bloom, pull camera back to watch
                camera.position.z = 100 - progress * 50;
                camera.lookAt(0,0,0);
            }

            bloomPass.strength = 1.5 + Math.sin(progress * Math.PI) * 2.0;

            const whiteoutProgress = Math.max(0, (progress - 0.9) / 0.1);
            whiteoutMat.opacity = whiteoutProgress * whiteoutProgress;
            
            composer.render();
        };

        animate();

        const handleResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            if(renderer) {
                renderer.setSize(window.innerWidth, window.innerHeight);
                composer.setSize(window.innerWidth, window.innerHeight);
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            clearTimeout(animationEndTimer);
            window.removeEventListener('resize', handleResize);
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (renderer) {
                if (mount && mount.contains(renderer.domElement)) {
                    mount.removeChild(renderer.domElement);
                }
                renderer.dispose();
            }
            particleGeometry.dispose();
            particleMaterial.dispose();
        };
    }, [onAnimationEnd, animationType]);

    return <div ref={mountRef} className="fixed inset-0 z-50 bg-black" />;
};

export default NexusPortal;
