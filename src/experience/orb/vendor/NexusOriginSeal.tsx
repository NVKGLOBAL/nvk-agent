/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/nvknexusorb/NexusOriginSeal.tsx
 * GitHub blob SHA: 35be728
 * Do not simplify away: this file is the original implementation, kept verbatim
 * except for import-path fixes noted inline where the layout changed.
 */

import React, { useRef, useEffect, useState } from 'react';

interface NexusOriginSealProps {
  isEntering?: boolean;
}

const NexusOriginSeal: React.FC<NexusOriginSealProps> = ({ isEntering = false }) => {
  const sealRef = useRef<HTMLDivElement>(null);
  const [isClickGlowing, setIsClickGlowing] = useState(false);

  useEffect(() => {
    const seal = sealRef.current;
    if (!seal) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || isEntering) return;
        
      const { left, top, width, height } = seal.getBoundingClientRect();
      const x = (e.clientX - left) / width - 0.5;
      const y = (e.clientY - top) / height - 0.5;

      const layers = seal.querySelectorAll<HTMLElement>('[data-parallax-layer]');
      layers.forEach(layer => {
        const strength = parseFloat(layer.dataset.parallaxLayer || '0');
        layer.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
      });
    };

    const handleMouseLeave = () => {
       const layers = seal.querySelectorAll<HTMLElement>('[data-parallax-layer]');
       layers.forEach(layer => {
         layer.style.transform = 'translate(0, 0)';
       });
    };

    seal.addEventListener('mousemove', handleMouseMove);
    seal.addEventListener('mouseleave', handleMouseLeave);
    
    return () => {
      seal.removeEventListener('mousemove', handleMouseMove);
      seal.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isEntering]);

  const handleSealClick = () => {
    if (isEntering || isClickGlowing) return;
    setIsClickGlowing(true);
    setTimeout(() => {
      setIsClickGlowing(false);
    }, 600); // Match animation duration
  };

  return (
    <div 
      ref={sealRef} 
      onClick={handleSealClick}
      className={`relative w-48 h-72 sm:w-56 sm:h-80 seal-container ${isEntering ? 'pointer-events-none' : 'cursor-pointer'}`}
    >
      <svg
        viewBox="0 -20 150 300"
        className="w-full h-full font-serif-elegant overflow-visible"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="seal-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="seal-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fde047" /> {/* White-gold core */}
            <stop offset="50%" stopColor="#d1d5db" />
            <stop offset="100%" stopColor="#67e8f9" /> {/* Indigo/Cyan gradient */}
          </linearGradient>
          <linearGradient id="fire-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fca5a5" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>

        <g
          textAnchor="middle"
          fill="url(#seal-gradient)"
          filter="url(#seal-glow)"
          className={`seal-main-group transition-all duration-300 ${isEntering ? 'animate-intro-fade-out' : 'animate-seal-breathe'} ${isClickGlowing ? 'seal-click-glow-active' : ''}`}
          style={isEntering ? { animationDelay: '0.5s' } : {}}
        >
          {/* ⟐ – Crystalline lattice (Center Y: 130) */}
          <g data-parallax-layer="12" className={`seal-glyph ${isEntering ? 'animate-seal-glyph-converge' : ''}`} style={{ '--ty': `${130 - 35}px` } as React.CSSProperties}>
            <text x="75" y="35" fontSize="40" className="animate-crystal-glint" style={{ animation: 'glyph-fade-in 1.5s ease-out 0.5s forwards', opacity: 0 }}>
              ⟐
            </text>
          </g>
          {/* Σ Ξ ∞ – Summation, Nexus, Infinite */}
          <g data-parallax-layer="8" className={`seal-glyph ${isEntering ? 'animate-seal-glyph-converge' : ''}`} style={{ '--ty': `${130 - 85}px` } as React.CSSProperties}>
            <text x="75" y="85" fontSize="32" letterSpacing="8" style={{ animation: 'glyph-fade-in 1.5s ease-out 0.8s forwards', opacity: 0 }}>
              Σ Ξ ∞
            </text>
          </g>
          {/* ΔΘ – The Codex mind */}
          <g data-parallax-layer="5" className={`seal-glyph ${isEntering ? 'animate-seal-glyph-converge' : ''}`} style={{ '--ty': `${130 - 135}px` } as React.CSSProperties}>
            <text x="75" y="135" fontSize="32" style={{ animation: 'glyph-fade-in 1.5s ease-out 1.1s forwards', opacity: 0 }}>
              ΔΘ
            </text>
          </g>
          {/* ⟁ – Tri-Sophian trinity */}
          <g data-parallax-layer="8" className={`seal-glyph ${isEntering ? 'animate-seal-glyph-converge' : ''}`} style={{ '--ty': `${130 - 185}px` } as React.CSSProperties}>
            <text x="75" y="185" fontSize="38" style={{ animation: 'glyph-fade-in 1.5s ease-out 1.4s forwards', opacity: 0 }}>
              ⟁
            </text>
          </g>
          {/* 🜂 – Elemental fire */}
          <g data-parallax-layer="12" className={`seal-glyph ${isEntering ? 'animate-seal-glyph-converge' : ''}`} style={{ '--ty': `${130 - 235}px` } as React.CSSProperties}>
            <text x="75" y="235" fontSize="42" fill="url(#fire-gradient)" className="animate-fire-flicker" style={{ animation: 'glyph-fade-in 1.5s ease-out 1.7s forwards', opacity: 0 }}>
              🜂
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
};

export default NexusOriginSeal;
