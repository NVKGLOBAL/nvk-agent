/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/nvknexusorb/CodexPortalAnimation.tsx
 * GitHub blob SHA: cfa2b4e
 * Do not simplify away: this file is the original implementation, kept verbatim
 * except for import-path fixes noted inline where the layout changed.
 */
import React, { useEffect, useState } from 'react';
import type { PortalAnimationType } from './types'; // NOTE: was '../types' in the source repo (stale path — the file lived in components/); fixed to './types' for this layout.

const ANIMATION_DURATION = 2000; // 2 seconds for all portal animations

//--- GENERATIVE PORTAL SYSTEM ---

interface AnimationRecipe {
    palette: 'cyan' | 'gold' | 'magenta' | 'emerald' | 'crimson' | 'rainbow';
    base: 'grid' | 'tunnel' | 'burst' | 'fractal' | 'glyphs';
    overlay: 'scanlines' | 'glitch' | 'static' | 'none';
    motion: 'zoom-in' | 'zoom-out' | 'swirl-cw' | 'swirl-ccw' | 'collapse' | 'iris';
}

const generateRecipe = (): AnimationRecipe => {
    const palettes: AnimationRecipe['palette'][] = ['cyan', 'gold', 'magenta', 'emerald', 'crimson', 'rainbow'];
    const bases: AnimationRecipe['base'][] = ['grid', 'tunnel', 'burst', 'fractal', 'glyphs'];
    const overlays: AnimationRecipe['overlay'][] = ['scanlines', 'glitch', 'static', 'none'];
    const motions: AnimationRecipe['motion'][] = ['zoom-in', 'zoom-out', 'swirl-cw', 'swirl-ccw', 'collapse', 'iris'];
    
    return {
        palette: palettes[Math.floor(Math.random() * palettes.length)],
        base: bases[Math.floor(Math.random() * bases.length)],
        overlay: overlays[Math.floor(Math.random() * overlays.length)],
        motion: motions[Math.floor(Math.random() * motions.length)],
    };
};

const BaseLayer: React.FC<{ type: AnimationRecipe['base'] }> = ({ type }) => {
    switch (type) {
        case 'grid':
            return <div className="portal-base-grid">{Array.from({ length: 100 }).map((_, i) => <div key={i} style={{ '--i': i } as React.CSSProperties} />)}</div>;
        case 'tunnel':
            return <div className="portal-base-tunnel">{Array.from({ length: 10 }).map((_, i) => <div key={i} style={{ '--i': i } as React.CSSProperties} />)}</div>;
        case 'burst':
            return <div className="portal-base-burst">{Array.from({ length: 24 }).map((_, i) => <div key={i} style={{ '--i': i, '--r': `${i * 15}deg` } as React.CSSProperties} />)}</div>;
        case 'fractal':
             return (
                <svg className="portal-base-fractal" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
                    <path d="M 50 0 L 100 50 L 50 100 L 0 50 Z M 25 25 L 75 25 L 75 75 L 25 75 Z M 50 25 L 75 50 L 50 75 L 25 50 Z" />
                </svg>
            );
        case 'glyphs':
             const glyphs = 'ΔΘ∞⟐ΣΞ⟁🜂';
            return <div className="portal-base-glyphs">{Array.from({ length: 30 }).map((_, i) => <span key={i} style={{'--i': i} as React.CSSProperties}>{glyphs[Math.floor(Math.random() * glyphs.length)]}</span>)}</div>;
        default: return null;
    }
};

const GenerativePortal: React.FC = () => {
    const [recipe] = useState(generateRecipe);
    return (
        <div className="portal-generative-container" data-palette={recipe.palette} data-motion={recipe.motion}>
            <BaseLayer type={recipe.base} />
            {recipe.overlay !== 'none' && <div className={`portal-overlay overlay-${recipe.overlay}`} />}
        </div>
    );
};

//--- THEMED PORTAL SYSTEM (Original) ---

const ThemedPortalContent: React.FC<{ type: PortalAnimationType }> = ({ type }) => {
    switch (type) {
        case 'rebirth':
            return (
                <div className="portal-rebirth-container">
                    <div className="portal-rebirth-fire"></div>
                </div>
            );
        case 'orb':
            return (
                <div className="portal-orb-container">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="portal-orb-ring" style={{ animationDelay: `${i * 100}ms` }} />
                    ))}
                </div>
            );
        case 'holographic':
        case 'tech':
             const color = type === 'holographic' ? 'cyan' : 'yellow';
             return (
                 <div className={`portal-holo-container portal-holo-${color}`}>
                     <div className="portal-holo-scanline" />
                     <div className="portal-holo-grid" />
                 </div>
             );
        case 'starborn':
            return (
                <div className="portal-starborn-container">
                    {Array.from({ length: 100 }).map((_, i) => (
                        <div key={i} className="portal-starborn-star" style={{
                            '--size': `${Math.random() * 2 + 1}px`,
                            '--delay': `${Math.random() * 1000}ms`,
                            '--duration': `${Math.random() * 500 + 500}ms`,
                            '--angle': `${Math.random() * 360}deg`,
                            '--radius': `${Math.random() * 50 + 50}%`,
                        } as React.CSSProperties}/>
                    ))}
                    <div className="portal-starborn-flash" />
                </div>
            );
        case 'fractal':
            return (
                <svg className="portal-fractal-container" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
                    <path className="portal-fractal-path" d="M 50 0 L 100 50 L 50 100 L 0 50 Z M 25 25 L 75 25 L 75 75 L 25 75 Z M 50 25 L 75 50 L 50 75 L 25 50 Z" />
                </svg>
            );
        case 'keynote':
            return (
                <div className="portal-keynote-container">
                    <div className="portal-keynote-line-h" />
                    <div className="portal-keynote-line-v" />
                </div>
            );
        case 'scroll':
            const glyphs = 'ΔΘ∞⟐ΣΞ⟁🜂🔥⚛️🌌✨⚡📄📜';
            return (
                <div className="portal-scroll-container">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="portal-scroll-column" style={{ animationDelay: `${i * 50}ms`}}>
                            {Array.from({ length: 20 }).map((_, j) => (
                                <span key={j}>{glyphs[Math.floor(Math.random() * glyphs.length)]}</span>
                            ))}
                        </div>
                    ))}
                </div>
            );
        default:
            return (
                <div className="relative w-px h-px">
                    <div className="absolute top-1/2 left-1/2 w-24 h-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 animate-pulseGlow" />
                </div>
            );
    }
};

//--- MAIN COMPONENT ---

interface CodexPortalAnimationProps {
  type: PortalAnimationType;
  onAnimationEnd: () => void;
}

const CodexPortalAnimation: React.FC<CodexPortalAnimationProps> = ({ type, onAnimationEnd }) => {
  useEffect(() => {
    const timer = setTimeout(onAnimationEnd, ANIMATION_DURATION);
    return () => clearTimeout(timer);
  }, [onAnimationEnd]);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden" aria-hidden="true">
      {type === 'random' ? <GenerativePortal /> : <ThemedPortalContent type={type} />}
    </div>
  );
};

export default CodexPortalAnimation;