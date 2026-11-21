/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/nvknexusorb/ParticleBackground.tsx
 * GitHub blob SHA: 4d82810
 * Do not simplify away: this file is the original implementation, kept verbatim
 * except for import-path fixes noted inline where the layout changed.
 */

import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

const ParticleBackground: React.FC = () => {
    const mountRef = useRef<HTMLDivElement>(null);
    const mousePos = useRef(new THREE.Vector2(9999, 9999));

    useEffect(() => {
        if (!mountRef.current) return;
        const mount = mountRef.current;
        let animationFrameId: number;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 4, 25);

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
        
        if (!renderer) {
            return; // Exit if WebGL not supported
        }
        
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mount.appendChild(renderer.domElement);

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

        let geometry: THREE.BufferGeometry | null = null;
        let material: THREE.ShaderMaterial | null = null;
        let points: THREE.Points | null = null;

        const generateGalaxy = () => {
            if (points) {
                geometry?.dispose();
                material?.dispose();
                scene.remove(points);
            }

            geometry = new THREE.BufferGeometry();
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

            material = new THREE.ShaderMaterial({
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

            points = new THREE.Points(geometry, material);
            scene.add(points);
        };

        generateGalaxy();

        const onMouseMove = (event: MouseEvent) => {
            mousePos.current.x = (event.clientX / window.innerWidth) * 2 - 1;
            mousePos.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
        };
        const onMouseOut = () => {
             mousePos.current.x = 9999;
             mousePos.current.y = 9999;
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseout', onMouseOut);
        
        const clock = new THREE.Clock();
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            const elapsedTime = clock.getElapsedTime();
            
            if (material) {
                material.uniforms.uTime.value = elapsedTime;
                material.uniforms.uMouse.value.lerp(mousePos.current, 0.05);
            }
            
            if (points) {
                points.rotation.y = elapsedTime * 0.05;
            }
            
            // Smoother camera movement
            const targetCameraX = mousePos.current.x === 9999 ? 0 : mousePos.current.x * 2.0;
            const targetCameraY = mousePos.current.x === 9999 ? 4 : -mousePos.current.y * 2.0 + 4;

            camera.position.x += (targetCameraX - camera.position.x) * 0.05;
            camera.position.y += (targetCameraY - camera.position.y) * 0.05;
            camera.lookAt(scene.position);

            if (renderer) renderer.render(scene, camera);
        };

        animate();

        const handleResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            if (renderer) {
                renderer.setSize(window.innerWidth, window.innerHeight);
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                if(material) material.uniforms.uSize.value = 35 * renderer.getPixelRatio();
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseout', onMouseOut);
            cancelAnimationFrame(animationFrameId);
            if (renderer) {
                if (mount.contains(renderer.domElement)) {
                    mount.removeChild(renderer.domElement);
                }
                renderer.dispose();
            }
            geometry?.dispose();
            material?.dispose();
        };
    }, []);

    return <div ref={mountRef} className="fixed inset-0 -z-10 pointer-events-none" />;
};

export default ParticleBackground;
