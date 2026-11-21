/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/nvknexusorb/NexusOrb.tsx
 * GitHub blob SHA: 20410bb0f5fde5fc8740581d0a52c16a9caed8b0
 * Do not simplify away: this file is the original implementation, kept verbatim
 * except for import-path fixes noted inline where the layout changed.
 */
import * as THREE from 'three';

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uHover; // 0.0 when not hovered, 1.0 when hovered
  varying vec3 vNormal;
  varying vec3 vPosition;

  // 3D Simplex noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 =   v - i + dot(i, C.xxx) ;
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
    vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y
    i = mod289(i);
    vec4 p = permute( permute( permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 0.142857142857; // 1.0/7.0
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }

  void main() {
    float totalGlow = 0.0;
    vec3 p = vPosition * 2.5;

    // Base swirling plasma
    float noise = snoise(p + uTime * 0.2);
    totalGlow += noise * 0.2;

    // Crackling energy arcs
    float energyTime = uTime * (1.0 + uHover * 2.0);
    float energyNoise = snoise(p * 2.0 + energyTime * 0.5);
    float arcs = smoothstep(0.7, 1.0, energyNoise) * (0.5 + uHover * 0.5);
    totalGlow += arcs;

    // Main energy rings
    for (float i = 0.0; i < 3.0; i++) {
        float time = uTime * (0.5 + i * 0.2) + i * 3.14;
        vec3 planeNormal = normalize(vec3(sin(time), cos(time), sin(time*0.7)));
        float dist = abs(dot(vPosition, planeNormal));
        float ring = smoothstep(0.02, 0.0, dist);
        ring *= 0.5 + 0.5 * sin(dot(vPosition, planeNormal) * 30.0 + time);
        totalGlow += ring * 0.5;
    }
    
    // Fresnel effect for rim lighting
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 4.0);
    totalGlow += fresnel * 0.6;
    
    // Inner core glow shining through
    float coreGlow = smoothstep(0.6, 0.0, length(vPosition));
    totalGlow += coreGlow * (0.3 + uHover * 0.5);

    vec3 color = vec3(0.1, 0.7, 1.0) * (totalGlow + 0.2);

    gl_FragColor = vec4(color, 1.0);
  }
`;

const coronaFragmentShader = `
  uniform float uHover;
  varying vec3 vNormal;
  void main() {
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
    float opacity = fresnel * (0.3 + uHover * 0.4);
    gl_FragColor = vec4(0.1, 0.8, 1.0, opacity);
  }
`;

export const createNexusOrb = () => {
    const group = new THREE.Group();
    group.userData = { id: 'nexus-orb' };

    // Inner Core - Intense and pulsing
    const innerCoreGeom = new THREE.SphereGeometry(0.5, 32, 32);
    const innerCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const innerCore = new THREE.Mesh(innerCoreGeom, innerCoreMat);
    group.add(innerCore);

    // Main Orb - Complex energy patterns
    const orbGeometry = new THREE.SphereGeometry(1, 128, 128);
    const orbMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uHover: { value: 0 },
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        blending: THREE.AdditiveBlending,
        transparent: true,
    });
    const mainOrb = new THREE.Mesh(orbGeometry, orbMaterial);
    mainOrb.scale.set(2.5, 2.5, 2.5);
    mainOrb.name = 'mainOrb';
    group.add(mainOrb);

    // Outer Corona - Soft atmospheric glow
    const coronaGeom = new THREE.SphereGeometry(1, 64, 64);
    const coronaMat = new THREE.ShaderMaterial({
        uniforms: {
            uHover: { value: 0 },
        },
        vertexShader: vertexShader,
        fragmentShader: coronaFragmentShader,
        blending: THREE.AdditiveBlending,
        transparent: true,
        side: THREE.BackSide,
    });
    const corona = new THREE.Mesh(coronaGeom, coronaMat);
    corona.scale.set(3.5, 3.5, 3.5);
    corona.name = 'corona';
    group.add(corona);

    const update = (elapsedTime: number, isHovered: boolean) => {
        orbMaterial.uniforms.uTime.value = elapsedTime;
        orbMaterial.uniforms.uHover.value = THREE.MathUtils.lerp(orbMaterial.uniforms.uHover.value, isHovered ? 1.0 : 0.0, 0.1);
        coronaMat.uniforms.uHover.value = orbMaterial.uniforms.uHover.value;

        const pulseSpeed = isHovered ? 10.0 : 4.0;
        const pulse = 1.0 + Math.sin(elapsedTime * pulseSpeed) * 0.2;
        innerCore.scale.set(pulse, pulse, pulse);
    };

    return { object: group, update };
};