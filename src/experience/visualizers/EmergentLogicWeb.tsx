/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/-CODEXA components/EmergentLogicWeb.tsx
 * Recovered 2026-11-21 by the unification gap-fill pass; SHA not recorded in the report.
 * Do not simplify away: this file is the original implementation, kept verbatim
 * except for import-path fixes noted inline where the layout changed.
 */

import * as React from 'react';
// @fiX: Replaced wildcard import with named imports to resolve TypeScript namespace errors.
import {
  Group, Vector3, Mesh, Color, WebGLRenderer, Scene, PerspectiveCamera, MeshStandardMaterial,
  SphereGeometry, IcosahedronGeometry, CylinderGeometry, AmbientLight, PointLight, Raycaster,
  Vector2, Plane, BackSide, Material, Line, LineSegments, Points, Object3D, BufferAttribute, MeshPhongMaterial
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { GlyphMutationNode, Axiom, RewovenGlyph } from './types';
import { gsap } from 'gsap';

// --- PROPS & INTERNAL TYPES ---
interface EmergentLogicWebProps {
  glyphNodesData: GlyphMutationNode[];
  axiomsData: Axiom[];
  rewovenGlyphsData: RewovenGlyph[];
  width: number;
  height: number;
  showDebugOverlay?: boolean;
}

// @fiX: Changed THREE.Group to Group, THREE.Vector3 to Vector3, etc.
type GraphNode = Group & {
  velocity: Vector3;
  nodeId: string;
  nodeType: 'glyph' | 'axiom';
  data: GlyphMutationNode | Axiom;
  coreMesh: Mesh;
  auraMesh?: Mesh;
};

interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  mesh: Mesh;
}

// --- CONSTANTS ---
const REPULSION_STRENGTH = 20.0;
const SPRING_STRENGTH = 0.08;
const DAMPING = 0.95;
const IDEAL_EDGE_LENGTH = 15;
const NODE_SIZE = 0.5;
const AXIOM_SIZE = 0.8;
const EDGE_RADIUS = 0.05;

// @fiX: Changed THREE.Color to Color
// FIX: Added 'A' to layerColors to satisfy the Record type for all possible Axiom layers.
const layerColors: Record<Axiom['layer'], Color> = {
  'I': new Color('#06b6d4'),
  'II': new Color('#f59e0b'),
  'III': new Color('#8b5cf6'),
  'IV': new Color('#ec4899'),
  'V': new Color('#10b981'),
  'Ω': new Color('#84cc16'),
  'P': new Color('#38bdf8'),
  'A': new Color('#ffffff'), // Luminous white for Atlas layer
};
const GLYPH_COLOR = new Color('#ffbf00'); // Amber
const REWOVEN_GLYPH_COLOR = new Color('#a855f7'); // Purple

// --- Helper Functions ---
const disposeNode = (node: GraphNode) => {
    if (node.coreMesh) {
        node.coreMesh.geometry.dispose();
        (node.coreMesh.material as Material).dispose();
    }
    if (node.auraMesh) {
        node.auraMesh.geometry.dispose();
        (node.auraMesh.material as Material).dispose();
    }
};

const disposeEdge = (edge: GraphEdge) => {
    edge.mesh.geometry.dispose();
    (edge.mesh.material as Material).dispose();
};

// --- COMPONENT ---
const EmergentLogicWeb: React.FC<EmergentLogicWebProps> = ({
  glyphNodesData,
  axiomsData,
  rewovenGlyphsData,
  width,
  height,
  showDebugOverlay = false,
}) => {
  const mountRef = React.useRef<HTMLDivElement>(null);
  // @fiX: Changed THREE.WebGLRenderer to WebGLRenderer, etc.
  const rendererRef = React.useRef<WebGLRenderer | null>(null);
  const sceneRef = React.useRef<Scene | null>(null);
  const cameraRef = React.useRef<PerspectiveCamera | null>(null);
  const controlsRef = React.useRef<OrbitControls | null>(null);
  const composerRef = React.useRef<EffectComposer | null>(null);

  const graphNodesRef = React.useRef<GraphNode[]>([]);
  const graphEdgesRef = React.useRef<GraphEdge[]>([]);
  
  const nodesGroupRef = React.useRef(new Group());
  const edgesGroupRef = React.useRef(new Group());
  
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const draggedNodeRef = React.useRef<GraphNode | null>(null);
  const raycasterRef = React.useRef(new Raycaster());
  const mouseRef = React.useRef(new Vector2(1,1));
  const hasDraggedRef = React.useRef(false);

  const [hoveredNodeInfo, setHoveredNodeInfo] = React.useState<{ content: React.ReactNode; x: number; y: number } | null>(null);
  const hoveredNodeRef = React.useRef<GraphNode | null>(null);

  const getTooltipContent = React.useCallback((node: GraphNode): React.ReactNode => {
    if (node.nodeType === 'glyph') {
      const data = node.data as GlyphMutationNode;
      const parentIds = Array.isArray(data.parentId) ? data.parentId : (data.parentId ? [data.parentId] : []);
      const parents = parentIds.map(pId => glyphNodesData.find(n => n.id === pId)?.label).filter(Boolean);
      return (
        <>
          <div className="font-bold text-base mb-1">{data.label}</div>
          <div className="text-xs space-y-1">
            <p><strong className="text-slate-400">Type:</strong> Glyph Node</p>
            <p><strong className="text-slate-400">Entropy:</strong> {data.entropyLevel.toFixed(3)}δ</p>
            {parents.length > 0 && <p><strong className="text-slate-400">Parent(s):</strong> {parents.join(', ')}</p>}
            {data.traits.length > 0 && <p><strong className="text-slate-400">Traits:</strong> {data.traits.join(', ')}</p>}
          </div>
        </>
      );
    } else { // Axiom
      const data = node.data as Axiom;
      return (
        <>
          <div className="font-bold text-base mb-1">{data.title}</div>
           <div className="text-xs space-y-1">
             <p><strong className="text-slate-400">Type:</strong> Axiom</p>
             <p><strong className="text-slate-400">Layer/Series:</strong> {data.layer} / {data.series}</p>
             <p><strong className="text-slate-400">Resonance:</strong> {data.resonanceFrequency.toFixed(1)} Hz</p>
           </div>
        </>
      );
    }
  }, [glyphNodesData]);


  // --- BUILD/UPDATE GRAPH ---
  React.useEffect(() => {
    // Combine all node data sources into a map for efficient lookup
    const allDataMap = new Map<string, GlyphMutationNode | Axiom>();
    glyphNodesData.forEach(d => allDataMap.set(d.id, d));
    axiomsData.forEach(d => allDataMap.set(d.id, d));

    const rewovenGlyphIds = new Set(rewovenGlyphsData.map(rg => rg.baseGlyphId));

    // --- NODE DIFFING AND UPDATING ---
    const dataIds = new Set(allDataMap.keys());

    // 1. Remove old nodes that no longer exist in the data
    const nodesToRemove = graphNodesRef.current.filter(n => !dataIds.has(n.nodeId));
    nodesToRemove.forEach(node => {
      nodesGroupRef.current.remove(node);
      disposeNode(node);
    });

    // Update the ref array after removals
    graphNodesRef.current = graphNodesRef.current.filter(n => dataIds.has(n.nodeId));

    // 2. Update existing nodes and add new ones
    allDataMap.forEach((dataItem, id) => {
      const existingNode = graphNodesRef.current.find(n => n.nodeId === id);

      if (existingNode) {
        // --- UPDATE EXISTING NODE ---
        existingNode.data = dataItem;
        if ('entropyLevel' in dataItem) { // It's a Glyph
          const isRewoven = rewovenGlyphIds.has(id) || (dataItem.traits.includes('Ω-Bound'));
          const coreMat = existingNode.coreMesh.material as MeshStandardMaterial;
          const targetColor = isRewoven ? REWOVEN_GLYPH_COLOR : GLYPH_COLOR;
          if (!coreMat.color.equals(targetColor)) {
            gsap.to(coreMat.color, { r: targetColor.r, g: targetColor.g, b: targetColor.b, duration: 0.5 });
            gsap.to(coreMat.emissive, { r: targetColor.r, g: targetColor.g, b: targetColor.b, duration: 0.5 });
          }
        }
      } else {
        // --- ADD NEW NODE ---
        let newNode: GraphNode;
        if ('entropyLevel' in dataItem) { // It's a Glyph
          const gn = dataItem as GlyphMutationNode;
          const isRewoven = rewovenGlyphIds.has(gn.id) || (gn.traits.includes('Ω-Bound'));
          const coreGeo = new SphereGeometry(NODE_SIZE, 24, 24);
          const coreMat = new MeshStandardMaterial({ color: isRewoven ? REWOVEN_GLYPH_COLOR : GLYPH_COLOR, emissive: isRewoven ? REWOVEN_GLYPH_COLOR : GLYPH_COLOR, emissiveIntensity: 0.4, metalness: 0.2, roughness: 0.5 });
          const auraGeo = new SphereGeometry(NODE_SIZE * 1.3, 24, 24);
          const auraMat = new MeshStandardMaterial({ emissive: new Color().setHSL(0.66 - gn.entropyLevel * 0.5, 0.8, 0.5), emissiveIntensity: 1.0, transparent: true, opacity: 0.3, side: BackSide });
          const coreMesh = new Mesh(coreGeo, coreMat);
          const auraMesh = new Mesh(auraGeo, auraMat);
          newNode = new Group() as GraphNode;
          newNode.add(coreMesh, auraMesh);
          newNode.coreMesh = coreMesh;
          newNode.auraMesh = auraMesh;
          newNode.nodeType = 'glyph';
        } else { // It's an Axiom
          const ax = dataItem as Axiom;
          const geo = new IcosahedronGeometry(AXIOM_SIZE, 1);
          const mat = new MeshStandardMaterial({ color: layerColors[ax.layer] || '#ffffff', emissive: layerColors[ax.layer] || '#ffffff', emissiveIntensity: 0.5, metalness: 0.1, roughness: 0.3 });
          const coreMesh = new Mesh(geo, mat);
          newNode = new Group() as GraphNode;
          newNode.add(coreMesh);
          newNode.coreMesh = coreMesh;
          newNode.nodeType = 'axiom';
        }
        newNode.position.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
        newNode.velocity = new Vector3();
        newNode.nodeId = id;
        newNode.data = dataItem;
        
        graphNodesRef.current.push(newNode);
        nodesGroupRef.current.add(newNode);
      }
    });

    // --- EDGE REBUILDING --- (Simpler than full diffing, but much better than rebuilding nodes)
    graphEdgesRef.current.forEach(disposeEdge);
    edgesGroupRef.current.clear();
    
    const newGraphEdgesDef: { id: string, sourceId: string, targetId: string, type: 'mutation' | 'axiomBinding' }[] = [];
    glyphNodesData.forEach(gn => {
      if (gn.parentId) {
        (Array.isArray(gn.parentId) ? gn.parentId : [gn.parentId]).forEach(pId => {
          if (allDataMap.has(pId)) {
            newGraphEdgesDef.push({ id: `e-mut-${gn.id}-${pId}`, sourceId: pId, targetId: gn.id, type: 'mutation' });
          }
        });
      }
    });
    rewovenGlyphsData.forEach(rg => {
      if (allDataMap.has(rg.boundAxiomKey) && allDataMap.has(rg.baseGlyphId)) {
        newGraphEdgesDef.push({ id: `e-bind-${rg.baseGlyphId}-${rg.boundAxiomKey}`, sourceId: rg.boundAxiomKey, targetId: rg.baseGlyphId, type: 'axiomBinding' });
      }
    });

    graphEdgesRef.current = newGraphEdgesDef.map(edgeData => {
      const material = edgeData.type === 'axiomBinding'
        ? new MeshStandardMaterial({ color: 0x00FFB3, emissive: 0x00FFB3, emissiveIntensity: 0.6, transparent: true, opacity: 0.75 })
        : new MeshStandardMaterial({ color: 0x00A4FF, emissive: 0x00A4FF, emissiveIntensity: 0.4, transparent: true, opacity: 0.5 });
      const geometry = new CylinderGeometry(EDGE_RADIUS, EDGE_RADIUS, 1, 5, 1);
      const mesh = new Mesh(geometry, material);
      edgesGroupRef.current.add(mesh);
      return { ...edgeData, mesh };
    });

  }, [glyphNodesData, axiomsData, rewovenGlyphsData]);


  // --- RENDERER & SCENE SETUP ---
  React.useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount || rendererRef.current) return;

    const scene = new Scene();
    sceneRef.current = scene;
    const camera = new PerspectiveCamera(75, width / height, 0.1, 1000);
    cameraRef.current = camera;
    camera.position.z = 35; // Adjusted for larger scale

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    rendererRef.current = renderer;
    currentMount.appendChild(renderer.domElement);
    
    scene.add(new AmbientLight(0xffffff, 0.2));
    const pointLight = new PointLight(0xffffff, 0.8);
    camera.add(pointLight);
    scene.add(camera);
    
    scene.add(nodesGroupRef.current);
    scene.add(edgesGroupRef.current);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 10;
    controls.maxDistance = 80;
    controlsRef.current = controls;

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new Vector2(width, height), 0.8, 0.6, 0.1);
    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
    composerRef.current = composer;

    const handleResize = () => {
        if(!mountRef.current || !cameraRef.current || !rendererRef.current || !composerRef.current) return;
        const w = mountRef.current.clientWidth;
        const h = mountRef.current.clientHeight;
        cameraRef.current.aspect = w/h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(w,h);
        composerRef.current.setSize(w,h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        if (rendererRef.current && currentMount && rendererRef.current.domElement) {
            currentMount.removeChild(rendererRef.current.domElement);
        }
        controlsRef.current?.dispose();
        sceneRef.current?.traverse(object => {
            if ((object as any).isMesh || (object as any).isPoints || (object as any).isLineSegments) {
                if ((object as any).geometry) (object as any).geometry.dispose();
                if ((object as any).material) {
                    if (Array.isArray((object as any).material)) {
                        (object as any).material.forEach((material: Material) => material.dispose());
                    } else {
                        ((object as any).material as Material).dispose();
                    }
                }
            }
        });
        rendererRef.current?.dispose();
        rendererRef.current = null;
        sceneRef.current = null;
        cameraRef.current = null;
        controlsRef.current = null;
        composerRef.current = null;
    };

  }, [width, height]);


  // --- ANIMATION LOOP & PHYSICS ---
  React.useEffect(() => {
    let animationId: number;
    const animate = (time: number) => {
      animationId = requestAnimationFrame(animate);

      // Physics
      const nodes = graphNodesRef.current;
      nodes.forEach(nodeA => {
        if (nodeA === draggedNodeRef.current) return;
        const totalForce = new Vector3();
        
        nodes.forEach(nodeB => {
          if (nodeA === nodeB) return;
          const direction = new Vector3().subVectors(nodeA.position, nodeB.position);
          const distanceSq = direction.lengthSq();
          if (distanceSq > 0.1) {
            const force = REPULSION_STRENGTH / distanceSq;
            totalForce.add(direction.normalize().multiplyScalar(force));
          }
        });
        
        graphEdgesRef.current.forEach(edge => {
          let otherNode: GraphNode | undefined;
          if (edge.sourceId === nodeA.nodeId) otherNode = nodes.find(n => n.nodeId === edge.targetId);
          else if (edge.targetId === nodeA.nodeId) otherNode = nodes.find(n => n.nodeId === edge.sourceId);
          
          if (otherNode) {
            const direction = new Vector3().subVectors(otherNode.position, nodeA.position);
            const displacement = direction.length() - IDEAL_EDGE_LENGTH;
            const force = SPRING_STRENGTH * displacement;
            totalForce.add(direction.normalize().multiplyScalar(force));
          }
        });

        nodeA.velocity.add(totalForce);
        nodeA.velocity.multiplyScalar(DAMPING);
        nodeA.position.add(nodeA.velocity);
      });

      // Update Edges
      graphEdgesRef.current.forEach(edge => {
        const source = nodes.find(n => n.nodeId === edge.sourceId);
        const target = nodes.find(n => n.nodeId === edge.targetId);
        if (source && target) {
          const distance = source.position.distanceTo(target.position);
          edge.mesh.scale.y = Math.max(0.001, distance);
          edge.mesh.position.copy(source.position).lerp(target.position, 0.5);
          edge.mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3().subVectors(target.position, source.position).normalize());
        }
      });
      
      // Update Node Visuals (Aura Pulse)
      nodes.forEach(node => {
        if (node.auraMesh) {
            const entropy = (node.data as GlyphMutationNode).entropyLevel || 0;
            const pulseSpeed = 1.0 + entropy * 4.0;
            const pulseAmount = 1.0 + entropy * 0.2;
            const scale = 1 + Math.sin(time * 0.001 * pulseSpeed) * 0.1 * pulseAmount;
            node.auraMesh.scale.set(scale, scale, scale);
        }
        if (node.nodeType === 'axiom') {
            const scale = 1 + Math.sin(time * 0.0005) * 0.05;
            node.coreMesh.scale.set(scale, scale, scale);
        }
      });
      
      controlsRef.current?.update();
      composerRef.current?.render();
    };
    animate(0);
    return () => { if (animationId) cancelAnimationFrame(animationId); };
  }, []);

  // --- INTERACTIONS ---
  React.useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const onPointerMove = (event: PointerEvent) => {
      const rect = currentMount.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      if (draggedNodeRef.current) {
        hasDraggedRef.current = true;
        controlsRef.current!.enabled = false;
        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current!);
        const plane = new Plane().setFromNormalAndCoplanarPoint(
          cameraRef.current!.getWorldDirection(new Vector3()),
          draggedNodeRef.current.position
        );
        const intersectPoint = new Vector3();
        raycasterRef.current.ray.intersectPlane(plane, intersectPoint);
        if (intersectPoint) {
            draggedNodeRef.current.position.copy(intersectPoint);
            draggedNodeRef.current.velocity.set(0, 0, 0);
        }
      } else { // Hover logic
        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current!);
        const intersects = raycasterRef.current.intersectObjects(nodesGroupRef.current.children, true);
        const newHoveredObject = intersects.length > 0 ? (intersects[0].object.parent as GraphNode) : null;

        if (newHoveredObject !== hoveredNodeRef.current) {
            if (hoveredNodeRef.current) {
                gsap.to(hoveredNodeRef.current.scale, { x: 1, y: 1, z: 1, duration: 0.2 });
            }
            hoveredNodeRef.current = newHoveredObject;
            if (hoveredNodeRef.current) {
                gsap.to(hoveredNodeRef.current.scale, { x: 1.3, y: 1.3, z: 1.3, duration: 0.2 });
            }
        }
        
        if (hoveredNodeRef.current) {
            setHoveredNodeInfo({
                content: getTooltipContent(hoveredNodeRef.current),
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
            });
        } else {
            setHoveredNodeInfo(null);
        }
      }
    };

    const onPointerDown = () => {
        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current!);
        const intersects = raycasterRef.current.intersectObjects(nodesGroupRef.current.children, true);
        if (intersects.length > 0) {
            draggedNodeRef.current = intersects[0].object.parent as GraphNode;
        }
    };

    const onPointerUp = () => {
        if (!hasDraggedRef.current && draggedNodeRef.current) {
            const clickedNodeId = draggedNodeRef.current.nodeId;
            setSelectedNodeId(prev => prev === clickedNodeId ? null : clickedNodeId);
        }
        draggedNodeRef.current = null;
        controlsRef.current!.enabled = true;
        setTimeout(() => hasDraggedRef.current = false, 50);
    };

    currentMount.addEventListener('pointermove', onPointerMove);
    currentMount.addEventListener('pointerdown', onPointerDown);
    currentMount.addEventListener('pointerup', onPointerUp);

    return () => {
        currentMount.removeEventListener('pointermove', onPointerMove);
        currentMount.removeEventListener('pointerdown', onPointerDown);
        currentMount.removeEventListener('pointerup', onPointerUp);
    }
  }, [getTooltipContent]);


  return (
    <div className="relative" style={{ width: `${width}px`, height: `${height}px` }}>
        <div 
          ref={mountRef} 
          className="w-full h-full border border-slate-700/50 rounded-lg shadow-lg overflow-hidden" 
          style={{ cursor: draggedNodeRef.current ? 'grabbing' : (hoveredNodeRef.current ? 'pointer' : 'grab') }}
        ></div>
        {hoveredNodeInfo && (
            <div
              className="absolute p-2 rounded bg-slate-900/90 backdrop-blur-sm border border-slate-600 text-white pointer-events-none shadow-lg z-10 animate-fade-in-up"
              style={{
                top: `${hoveredNodeInfo.y}px`,
                left: `${hoveredNodeInfo.x}px`,
                transform: 'translate(15px, -50%)',
                maxWidth: '250px'
              }}
            >
              {hoveredNodeInfo.content}
            </div>
        )}
        {showDebugOverlay && (
        <div className="absolute top-2 left-2 bg-black/50 text-white text-xs font-mono p-2 rounded pointer-events-none">
          <div>Nodes: {graphNodesRef.current.length}</div>
          <div>Edges: {graphEdgesRef.current.length}</div>
          <div>Selected: {selectedNodeId || 'None'}</div>
          <div>Hovered: {hoveredNodeRef.current?.nodeId || 'None'}</div>
        </div>
      )}
    </div>
  );
};

export default React.memo(EmergentLogicWeb);
