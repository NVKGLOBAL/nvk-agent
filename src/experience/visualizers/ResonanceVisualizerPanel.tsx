/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/-CODEXA components/ResonanceVisualizerPanel.tsx
 * Recovered 2026-11-21 by the unification gap-fill pass; SHA not recorded in the report.
 * Do not simplify away: this file is the original implementation, kept verbatim
 * except for import-path fixes noted inline where the layout changed.
 */
// @FIX: Changed React import to namespace import to resolve framer-motion prop type errors.
import * as React from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Color, Points, BufferGeometry, BufferAttribute, ShaderMaterial, AdditiveBlending, IcosahedronGeometry, Mesh, Vector3 } from 'three';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { gsap } from 'gsap';
import type { ResonanceEffect, ResonanceVisualizerPanelProps } from './types';
import { useWebGL } from './webgl-context';

// Particle type for internal state
interface Particle {
  id: string;
  position: Vector3;
  velocity: Vector3;
  color: Color;
  life: number;
  maxLife: number;
  size: number;
}

const vertexShader = `
  attribute float size;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  void main() {
    if (length(gl_PointCoord - vec2(0.5, 0.5)) > 0.475) discard;
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

const Resonator: React.FC<{ isPlaying: boolean; effects: ResonanceEffect[] }> = ({ isPlaying, effects }) => {
    const meshRef = React.useRef<Mesh>(null!);
    const lastEffectId = React.useRef<string | null>(null);

    useFrame(({ clock }) => {
        if (!isPlaying || !meshRef.current) return;
        const time = clock.getElapsedTime();
        meshRef.current.rotation.x = time * 0.1;
        meshRef.current.rotation.y = time * 0.15;
        
        const material = meshRef.current.material as ShaderMaterial;
        material.uniforms.u_time.value = time;
    });

    React.useEffect(() => {
        if (effects.length > 0 && effects[effects.length - 1].id !== lastEffectId.current) {
             lastEffectId.current = effects[effects.length - 1].id;
             if (meshRef.current) {
                 gsap.to((meshRef.current.material as any).uniforms.u_intensity, {
                    value: 1.5,
                    duration: 0.2,
                    yoyo: true,
                    repeat: 1,
                    ease: 'power2.inOut',
                });
             }
        }
    }, [effects]);

    const resonatorMaterial = React.useMemo(() => new ShaderMaterial({
        uniforms: {
            u_time: { value: 0 },
            u_intensity: { value: 0.5 },
            u_color: { value: new Color('#00FFB3') },
        },
        vertexShader: `
            uniform float u_time;
            uniform float u_intensity;
            varying vec3 vNormal;
            void main() {
                vNormal = normal;
                float noise = sin(position.y * 5.0 + u_time * 2.0) * 0.05 + sin(position.x * 5.0 + u_time * 2.0) * 0.05;
                vec3 newPosition = position + normal * noise * u_intensity;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 u_color;
            uniform float u_intensity;
            varying vec3 vNormal;
            void main() {
                float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
                gl_FragColor = vec4(u_color * u_intensity, 1.0) * intensity;
            }
        `,
        transparent: true,
        blending: AdditiveBlending,
        wireframe: true,
    }), []);

    return (
        <mesh ref={meshRef}>
            <icosahedronGeometry args={[1.5, 3]} />
            <primitive object={resonatorMaterial} attach="material" />
        </mesh>
    );
}

const ParticleSystem: React.FC<{ effects: ResonanceEffect[], isPlaying: boolean }> = ({ effects, isPlaying }) => {
    const pointsRef = React.useRef<Points>(null!);
    const particlesRef = React.useRef<Particle[]>([]);
    const lastProcessedEffectId = React.useRef<string | null>(null);

    const particleGeometry = React.useMemo(() => new BufferGeometry(), []);

    React.useEffect(() => {
        if (effects.length === 0 && particlesRef.current.length > 0) {
            particlesRef.current = [];
        }
    }, [effects]);

    React.useEffect(() => {
        if (effects.length > 0) {
            const latestEffect = effects[effects.length - 1];
            if (latestEffect.id !== lastProcessedEffectId.current) {
                lastProcessedEffectId.current = latestEffect.id;
                const newParticles: Particle[] = [];
                const particleCount = 50 + Math.floor(latestEffect.intensity * 150);
                for (let i = 0; i < particleCount; i++) {
                    const velocity = new Vector3(
                        (Math.random() - 0.5),
                        (Math.random() - 0.5),
                        (Math.random() - 0.5)
                    ).normalize().multiplyScalar(Math.random() * 0.05 + 0.02 * latestEffect.intensity);

                    const durationSeconds = parseFloat(latestEffect.duration) || 4.0;
                    const maxLife = (durationSeconds * 60) * (0.8 + Math.random() * 0.4); // 60fps * seconds

                    newParticles.push({
                        id: `${latestEffect.id}-${i}`,
                        position: new Vector3(),
                        velocity: velocity,
                        color: new Color(latestEffect.colorProfile),
                        life: maxLife,
                        maxLife: maxLife,
                        size: (Math.random() * 1.5 + 0.5) * latestEffect.intensity,
                    });
                }
                particlesRef.current.push(...newParticles);
                if (particlesRef.current.length > 2000) {
                    particlesRef.current = particlesRef.current.slice(-2000);
                }
            }
        }
    }, [effects]);

    useFrame(() => {
        if (!isPlaying || !pointsRef.current || !particleGeometry) return;

        const particles = particlesRef.current;
        const positions: number[] = [];
        const colors: number[] = [];
        const sizes: number[] = [];
        const gravity = new Vector3(0, 0, 0); // Center pull

        particles.forEach((p) => {
            if (p.life > 0) {
                p.life -= 1;
                
                // Gravity towards center
                const pull = p.position.clone().multiplyScalar(-0.0001);
                p.velocity.add(pull);
                p.position.add(p.velocity);
                
                positions.push(p.position.x, p.position.y, p.position.z);
                
                const lifeRatio = p.life / p.maxLife;
                const color = p.color.clone().multiplyScalar(lifeRatio);
                colors.push(color.r, color.g, color.b);
                sizes.push(p.size * lifeRatio);
            }
        });

        particlesRef.current = particles.filter(p => p.life > 0);

        particleGeometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
        particleGeometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
        particleGeometry.setAttribute('size', new BufferAttribute(new Float32Array(sizes), 1));
    });

    return (
        <points ref={pointsRef} geometry={particleGeometry}>
            <shaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                transparent={true}
                depthWrite={false}
                blending={AdditiveBlending}
                vertexColors={true}
            />
        </points>
    );
};

export const ResonanceVisualizerPanel: React.FC<ResonanceVisualizerPanelProps> = ({ effects, isPlaying, onTogglePlay, onClearEffects }) => {
    const { isWebGLSupported } = useWebGL();

    return (
        <div className="resonance-visualizer-panel bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-lg p-4 h-[450px] flex flex-col">
            <div className="flex justify-between items-center mb-4">
                 <h3 className="text-lg font-['Cinzel'] font-semibold text-slate-200">Resonance Field Visualizer</h3>
                <div className="flex space-x-3">
                    <button onClick={onTogglePlay} className="px-3 py-1.5 text-sm transition flex items-center whitespace-nowrap bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md">
                        <i className={`ri-${isPlaying ? 'pause' : 'play'}-line mr-2`}></i>{isPlaying ? 'Pause' : 'Play'}
                    </button>
                    <button onClick={onClearEffects} className="px-3 py-1.5 text-sm transition flex items-center whitespace-nowrap bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md">
                        <i className="ri-delete-bin-line mr-2"></i>Clear
                    </button>
                </div>
            </div>
            <div className="flex-grow bg-black rounded-md border border-slate-800 relative">
                {isWebGLSupported && (
                    <Canvas 
                        camera={{ position: [0, 0, 12], fov: 60 }}
                        gl={{ failIfMajorPerformanceCaveat: false }}
                    >
                        <ambientLight intensity={0.5} />
                        <pointLight position={[10, 10, 10]} />
                        <Resonator isPlaying={isPlaying} effects={effects} />
                        <ParticleSystem effects={effects} isPlaying={isPlaying} />
                        <EffectComposer>
                            <Bloom intensity={1.2} luminanceThreshold={0.1} luminanceSmoothing={0.9} height={300} />
                        </EffectComposer>
                    </Canvas>
                )}
            </div>
        </div>
    );
}

export default ResonanceVisualizerPanel;