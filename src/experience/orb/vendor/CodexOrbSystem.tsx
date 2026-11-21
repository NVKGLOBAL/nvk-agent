/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/nvknexusorb/CodexOrbSystem.tsx
 * GitHub blob SHA: b65184e
 * Do not simplify away: this file is the original implementation, kept verbatim
 * except for import-path fixes noted inline where the layout changed.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import ParticleBackground from './ParticleBackground';
import { NEXUS_GATEWAYS } from './constants';
import type { PortalAnimationType, ActiveView, NexusGateway } from './types';
import { audio } from './audio';
import ProjectViewer from './ProjectViewer';
import { createNexusOrb } from './NexusOrb';

interface CodexOrbSystemProps {
  onNavigate: (view: ActiveView, animationType: PortalAnimationType) => void;
  onNavigateExternal: (url: string, animationType: PortalAnimationType) => void;
  onNavigateNewTab: (url: string, animationType: PortalAnimationType) => void;
}

const CodexOrbSystem: React.FC<CodexOrbSystemProps> = ({ onNavigate, onNavigateExternal, onNavigateNewTab }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isMounted = useRef(false);
    const [isReady, setIsReady] = useState(false);
    const [selectedGateway, setSelectedGateway] = useState<NexusGateway | null>(null);
    
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
            sprite.scale.set(8, 2, 1);
            sprite.position.y = 2.5;

            group.add(sphere);
            group.add(inner);
            group.add(sprite);

            // Add subtle pulsing animation to user data for the render loop
            group.userData.originalScale = 1;
            
            return group;
        };
        
        const init = () => {
            scene = new THREE.Scene();
            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
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
            
            renderer.setSize(window.innerWidth, window.innerHeight);
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
            
            // Post Processing
            const renderScene = new RenderPass(scene, camera);
            const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.5, 0.1);
            composer = new EffectComposer(renderer);
            composer.addPass(renderScene);
            composer.addPass(bloomPass);
        };

        const onWindowResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            if (renderer) {
                renderer.setSize(window.innerWidth, window.innerHeight);
                composer.setSize(window.innerWidth, window.innerHeight);
            }
        };

        const onMouseMove = (event: MouseEvent) => {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

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
        
        const onMouseUp = () => {
            if (controls) controls.enabled = true;
            isDragging.current = false;
            canvas.style.cursor = 'default';

            if (wasDragged.current) return;
             
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
                    }
                }
            }
        };
        
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            if (!renderer) return;

            const elapsedTime = clock.getElapsedTime();
            
            controls.update();
            
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
                                // Scale up on hover
                                const targetScale = (INTERSECTED && INTERSECTED.userData.id === child.userData.id) ? 1.2 : 1.0;
                                c.scale.lerp(new THREE.Vector3(8 * targetScale, 2 * targetScale, 1), 0.1);
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
        window.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mouseup', onMouseUp);
        
        return () => {
            isMounted.current = false;
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
        <ParticleBackground />
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
