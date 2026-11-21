/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/nvknexusorb/FractalBurst.tsx
 * GitHub blob SHA: 1aee583
 * Do not simplify away: this file is the original implementation, kept verbatim
 * except for import-path fixes noted inline where the layout changed.
 */

import React, { useEffect } from 'react';

interface FractalBurstProps {
  onAnimationEnd: () => void;
}

const FractalBurst: React.FC<FractalBurstProps> = ({ onAnimationEnd }) => {
  useEffect(() => {
    const timer = setTimeout(onAnimationEnd, 2000); // Match animation duration
    return () => clearTimeout(timer);
  }, [onAnimationEnd]);

  return (
    <div className="absolute inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden" aria-hidden="true">
      <div className="absolute w-full h-full animate-burst-light" />
      <div className="absolute w-px h-full bg-gradient-to-b from-transparent via-cyan-300 to-transparent animate-burst-line-1" style={{ transform: 'scaleY(0)'}} />
      <div className="absolute w-full h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent animate-burst-line-2" style={{ transform: 'scaleX(0)'}}/>
    </div>
  );
};

export default FractalBurst;
