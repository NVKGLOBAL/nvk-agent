/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/nvknexusorb/CodexOrbSystem.tsx
 * GitHub blob SHA: b65184e
 * Do not simplify away: this file is the original implementation, kept verbatim
 * except for import-path fixes noted inline where the layout changed.
 *
 * v0.1.4 FIXES (2026-11-22, retest #3 findings — the ONLY edits to this file
 * beyond the original import-path fixes; each is marked inline):
 *   1. PARTICLES: the separate <ParticleBackground/> layer was mounted
 *      underneath this canvas at z-index -10, and this canvas is fully
 *      OPAQUE (EffectComposer + UnrealBloomPass: the blur shader hardcodes
 *      alpha 1.0, the final additive blend writes alpha 1.0 in every
 *      pixel), so the particles could never be seen. The galaxy is now
 *      rendered INSIDE this scene (ported from ParticleBackground.tsx,
 *      same parameters/shaders) plus a surrounding star shell, so the
 *      particles are part of the composited output. <ParticleBackground/>
 *      is no longer mounted (the file stays in vendor/ as the asset).
 *   2. SIZING: camera aspect + renderer + composer were sized to the
 *      WINDOW while the canvas is displayed at panel size — on phones the
 *      render was squashed into a thin strip and raycast coordinates were
 *      systematically wrong. Everything now sizes to the canvas's own
 *      displayed size (ResizeObserver), and mouse coordinates are computed
 *      from the canvas bounding rect.
 *   3. LABELS: far-side gateway labels rendered THROUGH the central orb
 *      (transparent objects render back-to-front; the nearer additive orb
 *      adds light over the farther label instead of occluding it). Labels
 *      now fade out when their node is on the far side, and the ring's
 *      X-rotation is clamped so labels cannot swing out of frame.
 *   4. GATEWAY SELECT: optional onGatewaySelect prop reports a clicked
 *      gateway to the host (for the DOM gateway controls + status line).
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { NEXUS_GATEWAYS } from './constants';
import type { PortalAnimationType, ActiveView, NexusGateway } from './types';
import { audio } from './audio';
import ProjectViewer from './ProjectViewer';
import { createNexusOrb } from './NexusOrb';

interface CodexOrbSystemProps {
  onNavigate: (view: ActiveView, animationType: PortalAnimationType) => void;
  onNavigateExternal: (url: string, animationType: PortalAnimationType) => void;
  onNavigateNewTab: (url: string, animationType: PortalAnimationType) => void;
  /** v0.1.4: reports a clicked gateway to the host (DOM controls + status). */
  onGatewaySelect?: (gatewayId: string) => void;
}

const CodexOrbSystem: React.FC<CodexOrbSystemProps> = ({ onNavigate, onNavigateExternal, onNavigateNewTab, onGatewaySelect }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isMounted = useRef(false);
    const [isReady, setIsReady] = useState(false);
    const [selectedGateway, setSelectedGateway] = useState<NexusGateway | null>(null);
    // v0.1.4: keep the callback in a ref — the three.js effect must not
    // re-init when the parent re-renders with a new callback identity.
    const onGatewaySelectRef = useRef(onGatewaySelect);
    onGatewaySelectRef.current = onGatewaySelect;
    
    // Interaction refs
    const isDragging = useRef(false);
    const wasDragged = useRef(false);
    const previousMousePosition = useRef({ x: 0, y: 0 });
    const rotationVelocity = useRef(new THREE.Vector2(0, 0));
    const DAMPING_FACTOR = 0.97;
    
    useEffect(() => {
        const timer = setTimeout(() => setIsReady(true), 100);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!canvasRef.current || isMounted.current) return;
        isMounted.current = true;
        const canvas = canvasRef.current;
        let animationFrameId: number;

        let scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer | null = null, composer: EffectComposer, controls: OrbitControls;
        let nexusOrb: { object: THREE.Group, update: (time: number, isHovered: boolean) => void};
        let orbitGroup: THREE.Group;
        // v0.1.4: the galaxy + star shell live in THIS scene (see header
        // note 1) — the separate ParticleBackground layer was invisible
        // behind this canvas's opaque composited output.
        let galaxyPoints: THREE.Points | null = null;
        let galaxyMaterial: THREE.ShaderMaterial | null = null;
        let starShell: THREE.Points | null = null;

        // v0.1.4: the canvas is displayed at PANEL size (CSS forces 100%
        // w/h of the orb panel) while the window is much larger. Size the
        // camera, renderer and composer to the canvas's own displayed
        // size — window sizing squashed the orb into a thin strip on
        // phones and made every raycast miss (retest #3).
        const containerSize = () => {
            const w = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 1);
            const h = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 1);
            return { w, h };
        };

        // v0.1.4: mouse in CANVAS coordinates. The old code divided by
        // window.innerWidth/Height, so a click on a gateway sphere mapped
        // to the wrong NDC point and the raycast never hit anything.
        const updateMouseFromEvent = (event: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        };
        
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(9999, 9999);
        let INTERSECTED: THREE.Object3D | null = null;
        const clock = new THREE.Clock();

        // Helper to find the parent object that has metadata (id/type)
        const findInteractiveParent = (object: THREE.Object3D | null): THREE.Object3D | null => {
            let current = object;
            while(current) {
                if (current.userData.id) return current;
                if (current.parent === scene) return null; // Don't go past scene
                current = current.parent;
            }
            return null;
        }

        const createGatewayNode = (gateway: NexusGateway) => {
            const group = new THREE.Group();
            group.userData = { id: gateway.id, type: 'gateway' };

            // Node Sphere (Mini Orb)
            const geom = new THREE.SphereGeometry(1.2, 32, 32);
            const mat = new THREE.MeshBasicMaterial({ color: 0x00A4FF, transparent: true, opacity: 0.6, wireframe: true });
            const sphere = new THREE.Mesh(geom, mat);
            
            // Inner Glow
            const innerGeom = new THREE.SphereGeometry(0.6, 16, 16);
            const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const inner = new THREE.Mesh(innerGeom, innerMat);
            
            // Label Sprite
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
            // v0.1.4: smaller label (8×2 overflowed the sphere and collided
            // with neighbours), slightly lower so it clears the node.
            sprite.scale.set(7, 1.75, 1);
            sprite.position.y = 2.2;

            group.add(sphere);
            group.add(inner);
            group.add(sprite);

            // Add subtle pulsing animation to user data for the render loop
            group.userData.originalScale = 1;
            
            return group;
        };
        
        // v0.1.4: galaxy star field, ported from vendor/ParticleBackground.tsx
        // (same parameters and shaders — the original asset's look, now
        // rendered inside this scene so the bloom composer includes it
        // instead of hiding it behind an opaque canvas).
        const createGalaxy = (): { points: THREE.Points; material: THREE.ShaderMaterial } => {
            const galaxyParams = {
                count: 250000,
                size: 0.015,
                radius: 22,
                branches: 7,
                spin: 1.5,
                randomness: 0.4,
                randomnessPower: 3.5,
                insideColor: '#67e8f9',
                outsideColor: '#d946ef',
            };

            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(galaxyParams.count * 3);
            const colors = new Float32Array(galaxyParams.count * 3);
            const scales = new Float32Array(galaxyParams.count * 1);
            const randomness = new Float32Array(galaxyParams.count * 3);
            const radiuses = new Float32Array(galaxyParams.count * 1);

            const colorInside = new THREE.Color(galaxyParams.insideColor);
            const colorOutside = new THREE.Color(galaxyParams.outsideColor);

            for (let i = 0; i < galaxyParams.count; i++) {
                const i3 = i * 3;
                const radius = Math.random() * galaxyParams.radius;
                const spinAngle = radius * galaxyParams.spin;
                const branchAngle = ((i % galaxyParams.branches) / galaxyParams.branches) * Math.PI * 2;

                const randomX = Math.pow(Math.random(), galaxyParams.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * galaxyParams.randomness * radius;
                const randomY = Math.pow(Math.random(), galaxyParams.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * galaxyParams.randomness * 0.2;
                const randomZ = Math.pow(Math.random(), galaxyParams.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * galaxyParams.randomness * radius;

                positions[i3] = Math.cos(branchAngle + spinAngle) * radius + randomX;
                positions[i3 + 1] = randomY;
                positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;

                randomness[i3] = randomX;
                randomness[i3 + 1] = randomY;
                randomness[i3 + 2] = randomZ;

                const mixedColor = colorInside.clone();
                mixedColor.lerp(colorOutside, radius / galaxyParams.radius);

                colors[i3] = mixedColor.r;
                colors[i3 + 1] = mixedColor.g;
                colors[i3 + 2] = mixedColor.b;

                scales[i] = Math.random();
                radiuses[i] = radius;
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
            geometry.setAttribute('aRandomness', new THREE.BufferAttribute(randomness, 3));
            geometry.setAttribute('aRadius', new THREE.BufferAttribute(radiuses, 1));

            const material = new THREE.ShaderMaterial({
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                vertexColors: true,
                uniforms: {
                    uTime: { value: 0 },
                    uSize: { value: 35 * (renderer?.getPixelRatio() || 1) },
                    uMouse: { value: new THREE.Vector2(9999, 9999) },
                    uGalaxyRadius: { value: galaxyParams.radius }
                },
                vertexShader: `
                    uniform float uTime;
                    uniform float uSize;
                    uniform vec2 uMouse;

                    attribute float aScale;
                    attribute vec3 aRandomness;
                    attribute float aRadius;

                    varying vec3 vColor;
                    varying float vRadius;

                    void main() {
                        vColor = color;
                        vRadius = aRadius;

                        vec4 modelPosition = modelMatrix * vec4(position, 1.0);

                        // Mouse warp effect
                        vec4 screenPos = projectionMatrix * viewMatrix * modelPosition;
                        vec2 screenXY = screenPos.xy / screenPos.w;
                        float mouseDist = distance(screenXY, uMouse);
                        float warpStrength = smoothstep(0.4, 0.0, mouseDist) * 2.0;

                        vec3 warpDirection = normalize(vec3(aRandomness.y, -aRandomness.x, 0.0));
                        modelPosition.xyz += warpDirection * warpStrength;

                        // Gentle floating animation
                        modelPosition.y += sin(uTime * 0.5 + modelPosition.x * 2.0) * aScale * 0.4;

                        vec4 viewPosition = viewMatrix * modelPosition;
                        vec4 projectedPosition = projectionMatrix * viewPosition;
                        gl_Position = projectedPosition;

                        gl_PointSize = uSize * aScale * (1.0 / -viewPosition.z);
                    }
                `,
                fragmentShader: `
                    uniform float uTime;
                    uniform float uGalaxyRadius;

                    varying vec3 vColor;
                    varying float vRadius;

                    void main() {
                        float strength = distance(gl_PointCoord, vec2(0.5));
                        float alpha = 1.0 - pow(strength * 2.0, 2.0);

                        if (alpha < 0.01) {
                            discard;
                        }

                        // Pulsing core
                        float distanceRatio = vRadius / uGalaxyRadius;
                        float pulse = sin(distanceRatio * -20.0 + uTime * 3.0) * 0.5 + 0.5;
                        float pulseStrength = smoothstep(0.5, 0.0, distanceRatio);

                        vec3 finalColor = vColor + vColor * pulse * pulseStrength * 2.0;

                        gl_FragColor = vec4(finalColor, alpha);
                    }
                `
            });

            return { points: new THREE.Points(geometry, material), material };
        };

        // v0.1.4: surrounding star shell. The galaxy disk is flat — viewed
        // from a low camera it reads as a thin band, not a field. The shell
        // fills the whole panel with stars so the background is never an
        // empty black rectangle.
        const createStarShell = (): THREE.Points => {
            const count = 1600;
            const positions = new Float32Array(count * 3);
            const colors = new Float32Array(count * 3);
            const white = new THREE.Color('#ffffff');
            const cyan = new THREE.Color('#67e8f9');
            for (let i = 0; i < count; i++) {
                const i3 = i * 3;
                const r = 30 + Math.random() * 30;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                positions[i3] = r * Math.sin(phi) * Math.cos(theta);
                positions[i3 + 1] = r * Math.cos(phi) * 0.6;
                positions[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);
                const c = Math.random() < 0.7 ? white : cyan;
                const b = 0.4 + Math.random() * 0.6;
                colors[i3] = c.r * b;
                colors[i3 + 1] = c.g * b;
                colors[i3 + 2] = c.b * b;
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            const material = new THREE.PointsMaterial({
                size: 0.18,
                vertexColors: true,
                transparent: true,
                opacity: 0.9,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                sizeAttenuation: true,
            });
            return new THREE.Points(geometry, material);
        };

        const init = () => {
            scene = new THREE.Scene();
            const size = containerSize();
            camera = new THREE.PerspectiveCamera(75, size.w / size.h, 0.1, 1000);
            camera.position.set(0, 4, 18);
            
            try {
                renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
            } catch (e) {
                console.warn("High-performance WebGL context failed, falling back.", e);
                try {
                    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
                } catch (e2) {
                    console.warn("Standard WebGL context failed, falling back to minimal.", e2);
                    try {
                        renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
                    } catch (e3) {
                        console.error("Critical: All WebGL context creation attempts failed.", e3);
                    }
                }
            }
            
            if (!renderer) return;
            
            // v0.1.4: size to the panel, not the window — and do not let the
            // renderer rewrite the CSS size (false), the stylesheet owns it.
            renderer.setSize(size.w, size.h, false);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.toneMapping = THREE.ReinhardToneMapping;
            
            controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.minDistance = 10;
            controls.maxDistance = 30;
            controls.enablePan = false;
            
            // Central Nexus Orb (The "Right" Orb with shaders)
            nexusOrb = createNexusOrb();
            scene.add(nexusOrb.object);
            
            // Orbital Group for Gateways
            orbitGroup = new THREE.Group();
            scene.add(orbitGroup);

            const radius = 10;
            NEXUS_GATEWAYS.forEach((gateway, i) => {
                const angle = (i / NEXUS_GATEWAYS.length) * Math.PI * 2;
                const node = createGatewayNode(gateway);
                node.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
                
                // Connector line to center
                const points = [new THREE.Vector3(0,0,0), new THREE.Vector3(Math.cos(angle)*radius, 0, Math.sin(angle)*radius)];
                const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
                const lineMat = new THREE.LineBasicMaterial({ color: 0x00A4FF, transparent: true, opacity: 0.1 });
                const line = new THREE.Line(lineGeo, lineMat);
                
                orbitGroup.add(node);
                orbitGroup.add(line);
            });
            
            // Galaxy + star shell, in THIS scene (v0.1.4 — see header note 1).
            const galaxy = createGalaxy();
            galaxyPoints = galaxy.points;
            galaxyMaterial = galaxy.material;
            scene.add(galaxyPoints);
            starShell = createStarShell();
            scene.add(starShell);

            // Post Processing
            const renderScene = new RenderPass(scene, camera);
            const bloomPass = new UnrealBloomPass(new THREE.Vector2(size.w, size.h), 1.2, 0.5, 0.1);
            composer = new EffectComposer(renderer);
            composer.addPass(renderScene);
            composer.addPass(bloomPass);
        };

        const onWindowResize = () => {
            // v0.1.4: resize to the canvas's displayed (panel) size, not
            // the window — window sizing squashed the orb on phones.
            const { w, h } = containerSize();
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            if (renderer) {
                renderer.setSize(w, h, false);
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                composer.setSize(w, h);
            }
        };

        const onMouseMove = (event: MouseEvent) => {
            updateMouseFromEvent(event);

            if (isDragging.current) {
                const deltaX = event.clientX - previousMousePosition.current.x;
                const deltaY = event.clientY - previousMousePosition.current.y;
        
                if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
                    wasDragged.current = true;
                }
        
                const ROTATION_SENSITIVITY = 0.005;
                // Rotate the orbit group based on drag
                orbitGroup.rotation.y += deltaX * ROTATION_SENSITIVITY;
                orbitGroup.rotation.x += deltaY * ROTATION_SENSITIVITY;
        
                rotationVelocity.current.set(deltaX * ROTATION_SENSITIVITY, deltaY * ROTATION_SENSITIVITY);
                previousMousePosition.current = { x: event.clientX, y: event.clientY };
            }
        };

        const onMouseDown = (event: MouseEvent) => {
            isDragging.current = true;
            wasDragged.current = false;
            previousMousePosition.current = { x: event.clientX, y: event.clientY };
            rotationVelocity.current.set(0, 0);
            // Allow controls to work if not intersecting specific interactables, 
            // but here we manually handle rotation for a cooler feel.
            if (controls) controls.enabled = false; 
            canvas.style.cursor = 'grabbing';
        };
        
        const onMouseUp = (event: MouseEvent) => {
            if (controls) controls.enabled = true;
            isDragging.current = false;
            canvas.style.cursor = 'default';

            if (wasDragged.current) return;

            // v0.1.4: refresh the pointer position from THIS event — the
            // mousemove listener may not have fired over the target.
            updateMouseFromEvent(event);
            raycaster.setFromCamera(mouse, camera);
            
            // Intersect recursive to hit children of groups
            const intersects = raycaster.intersectObjects(scene.children, true);
            const firstInteractive = intersects.length > 0 ? findInteractiveParent(intersects[0].object) : null;
             
            if (firstInteractive) {
                const { id, type } = firstInteractive.userData;
                
                if (id === 'nexus-orb') {
                    audio.nexusOrbClick();
                    // Center click effect?
                } else if (type === 'gateway') {
                    // Find the gateway object
                    const gateway = NEXUS_GATEWAYS.find(g => g.id === id);
                    if (gateway) {
                        audio.nexusOrbClick();
                        setSelectedGateway(gateway);
                        // v0.1.4: report the selection to the host (DOM
                        // gateway controls + footer status line).
                        onGatewaySelectRef.current?.(gateway.id);
                    }
                }
            }
        };
        
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            if (!renderer) return;

            const elapsedTime = clock.getElapsedTime();
            
            controls.update();

            // v0.1.4: in-scene galaxy + star shell animation (particles are
            // part of this scene now, not a hidden layer underneath it).
            if (galaxyMaterial) {
                galaxyMaterial.uniforms.uTime.value = elapsedTime;
                galaxyMaterial.uniforms.uMouse.value.lerp(mouse, 0.05);
            }
            if (galaxyPoints) galaxyPoints.rotation.y = elapsedTime * 0.05;
            if (starShell) starShell.rotation.y = -elapsedTime * 0.008;
            
            // Hover Logic
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(scene.children, true);
            const firstInteractive = intersects.length > 0 ? findInteractiveParent(intersects[0].object) : null;

            if (firstInteractive && !isDragging.current) {
                if (INTERSECTED !== firstInteractive) {
                    INTERSECTED = firstInteractive;
                    if (INTERSECTED.userData.id !== 'nexus-orb') audio.cardHover();
                }
                canvas.style.cursor = 'pointer';
            } else if (!isDragging.current) {
                INTERSECTED = null;
                canvas.style.cursor = 'default';
            }

            // Animate Gateway Nodes
            if (orbitGroup) {
                orbitGroup.children.forEach(child => {
                    if (child instanceof THREE.Group && child.userData.type === 'gateway') {
                        // Look at camera for sprites
                        child.children.forEach(c => {
                            if (c instanceof THREE.Sprite) {
                                // Scale up on hover (v0.1.4 base 7×1.75 —
                                // the 8×2 label overflowed its sphere).
                                const targetScale = (INTERSECTED && INTERSECTED.userData.id === child.userData.id) ? 1.2 : 1.0;
                                c.scale.lerp(new THREE.Vector3(7 * targetScale, 1.75 * targetScale, 1), 0.1);
                                // v0.1.4: fade the label out when its node
                                // is on the far side. A far-side label
                                // renders THROUGH the central orb (transparent
                                // back-to-front sort + additive blending),
                                // so it read as text drawn across the sphere.
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
                            sphere.rotation.y += 0.02;
                            sphere.rotation.z += 0.01;
                        }
                    }
                });

                // Auto rotation of the whole system
                if (!isDragging.current) {
                    // Apply momentum
                    if (Math.abs(rotationVelocity.current.x) > 0.0001 || Math.abs(rotationVelocity.current.y) > 0.0001) {
                        orbitGroup.rotation.y += rotationVelocity.current.x;
                        orbitGroup.rotation.x += rotationVelocity.current.y;
                        rotationVelocity.current.multiplyScalar(DAMPING_FACTOR);
                    } else {
                        // Idle rotation
                        orbitGroup.rotation.y += 0.001;
                    }
                }

                // v0.1.4: keep the ring near level — a steep X tilt swings
                // labels above the frame (THE LORE clipped at the top).
                orbitGroup.rotation.x = THREE.MathUtils.clamp(orbitGroup.rotation.x, -0.35, 0.35);
            }
            
            // Update Main Orb
            if (nexusOrb) {
                const isCoreHovered = !!(INTERSECTED && INTERSECTED.userData.id === 'nexus-orb');
                nexusOrb.update(elapsedTime, isCoreHovered);
            }
            
            composer.render();
        };

        init();
        animate();
        window.addEventListener('resize', onWindowResize);
        // v0.1.4: the panel itself resizes (phone rotation, layout) — the
        // window listener alone does not catch a panel resize.
        const resizeObserver = new ResizeObserver(onWindowResize);
        if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);
        window.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mouseup', onMouseUp);
        
        return () => {
            isMounted.current = false;
            resizeObserver.disconnect();
            window.removeEventListener('resize', onWindowResize);
            window.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mouseup', onMouseUp);
            cancelAnimationFrame(animationFrameId);
            
            if (scene) {
                scene.traverse(object => {
                    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite) {
                        object.geometry?.dispose();
                        const material = object.material as any;
                        if (material) {
                            if (Array.isArray(material)) {
                                material.forEach(m => { m.map?.dispose(); m.dispose(); });
                            } else {
                                material.map?.dispose();
                                material.dispose();
                            }
                        }
                    }
                });
            }
            renderer?.dispose();
        };
    }, [onNavigate, onNavigateExternal, onNavigateNewTab]);

    return (
      <div className={`fixed inset-0 text-gray-200 font-mono transition-opacity duration-1000 ${isReady ? 'opacity-100' : 'opacity-0'}`}>
        {/* v0.1.4: ParticleBackground NOT mounted — it rendered underneath
            this canvas at z-index -10 and the composited orb output is
            opaque, so it could never be seen. The galaxy + star shell now
            live inside this scene. The file stays in vendor/ as the asset. */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        
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
      </div>
    );
};

export default CodexOrbSystem;
