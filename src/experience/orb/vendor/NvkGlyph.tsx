/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/nvknexusorb/NvkGlyph.tsx
 * GitHub blob SHA: 10e6ee8
 * Do not simplify away: this file is the original implementation, kept verbatim
 * except for import-path fixes noted inline where the layout changed.
 */
import React from 'react';

interface NvkGlyphProps {
  className?: string;
  isPulsing?: boolean;
}

const NvkGlyph: React.FC<NvkGlyphProps> = ({ className = '', isPulsing = false }) => {
  return (
    <div
      className={`relative flex items-center justify-center w-24 h-24 sm:w-32 sm:h-32 rounded-full border border-white/80 ${isPulsing ? 'animate-pulseGlow' : 'animate-subtle-breathe'} ${className}`}
    >
      <span className="text-3xl sm:text-4xl font-bold tracking-[0.2em] text-white/90">NVK</span>
    </div>
  );
};

export default NvkGlyph;
