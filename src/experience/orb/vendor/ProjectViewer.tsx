/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/nvknexusorb/ProjectViewer.tsx
 * Recovered 2026-11-21 by the unification gap-fill pass; SHA not recorded in the report.
 * Do not simplify away: this file is the original implementation, kept verbatim
 * except for import-path fixes noted inline where the layout changed.
 */

import React, { useEffect, useRef } from 'react';
import { allProjects } from './constants';
import { audio } from './audio';
import type { PortalAnimationType, ActiveView, NexusGateway, ProjectCard } from './types';

// A provider component for the interactive mouse-tracking glow effect
const InteractiveGlowProvider: React.FC<{ children: React.ReactNode; className?: string; as?: React.ElementType; [x: string]: any; }> = ({ children, className, as: Component = 'div', ...props }) => {
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      container.style.setProperty('--mouse-x', `${x}px`);
      container.style.setProperty('--mouse-y', `${y}px`);
    };
    
    const handleMouseEnter = () => audio.cardHover();

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseenter', handleMouseEnter);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, []);

  return (
    <Component ref={containerRef} className={`interactive-glow-provider ${className}`} {...props}>
      <div className="interactive-glow-content h-full">{children}</div>
    </Component>
  );
};

// The card component for displaying a single project
const ProjectDisplayCard: React.FC<{ 
  project: ProjectCard; 
  onNavigate: (view: ActiveView, animationType: PortalAnimationType) => void; 
  onNavigateExternal: (url: string, animationType: PortalAnimationType) => void;
  onClose: () => void;
}> = ({ project, onNavigate, onNavigateExternal, onClose }) => {
  const commonClasses = "group p-6 bg-gray-900/60 backdrop-blur-sm border border-white/10 rounded-lg motion-safe:transition-all motion-safe:duration-300 motion-reduce:transform-none flex flex-col h-full";
  const interactiveClasses = "motion-safe:hover:bg-gray-900/80 motion-safe:hover:border-cyan-400/50 motion-safe:hover:shadow-[0_0_20px_rgba(0,190,255,0.3)] motion-safe:hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black";
  const disabledClasses = "opacity-70 cursor-default";

  const cardContent = (
    <>
      <div className="flex-grow">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-full bg-cyan-900/50 border border-cyan-500/30">
            <span className="text-3xl" role="img" aria-label="">{project.icon}</span>
          </div>
          <div className="flex-grow">
            <h3 className="text-xl font-semibold text-white">{project.title}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {project.tags.map(tag => (
                  <span key={tag} className="px-2 py-1 text-xs bg-cyan-900/50 text-cyan-300 rounded-full">{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-4 text-gray-200 text-sm brightness-110">{project.description}</p>
      </div>
      <div className="mt-4 text-sm font-semibold">
        {project.link ? (
          <span className="text-cyan-400 opacity-0 motion-safe:group-hover:opacity-100 motion-safe:transition-opacity motion-safe:duration-300">
            {project.isInternal ? 'Engage →' : (project.openInNewTab ? 'Open External ↗' : 'Explore →')}
          </span>
        ) : (
          <span className="text-gray-500">
            Coming Soon
          </span>
        )}
      </div>
    </>
  );

  const handleClick = () => {
    if (!project.link) return;

    // Always close the viewer when a project is clicked.
    onClose();

    // If the project link is for the current view, don't trigger navigation.
    if (project.isInternal && project.link === 'codexOrbSystem') {
        return;
    }

    const animation = project.animationType || 'random';
    
    if (project.openInNewTab) {
        window.open(project.link, '_blank', 'noopener,noreferrer');
    } else if (project.isInternal) {
      onNavigate(project.link as ActiveView, animation);
    } else {
      onNavigateExternal(project.link, animation);
    }
  };

  if (project.link) {
    return (
      <InteractiveGlowProvider as="button" onClick={handleClick} className={`${commonClasses} ${interactiveClasses} text-left w-full`} aria-label={`Engage with ${project.title}`}>
        {cardContent}
      </InteractiveGlowProvider>
    );
  }

  return (
    <InteractiveGlowProvider className={`${commonClasses} ${disabledClasses}`}>
      {cardContent}
    </InteractiveGlowProvider>
  );
};


// The modal/overlay for displaying projects of a selected gateway
const ProjectViewer: React.FC<{ gateway: NexusGateway; onClose: () => void; onNavigate: (view: ActiveView, animationType: PortalAnimationType) => void; onNavigateExternal: (url: string, animationType: PortalAnimationType) => void; }> = ({ gateway, onClose, onNavigate, onNavigateExternal }) => {
  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-modal-backdrop-fade-in" onClick={onClose}></div>
      <div className="relative z-50 w-full h-full max-w-7xl mx-auto flex flex-col p-4 sm:p-8 animate-modal-fade-in">
        <header className="flex-shrink-0 flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-4">
            <span className="text-4xl">{gateway.icon}</span>
            <div>
                <h2 className="text-3xl sm:text-4xl font-serif-elegant text-cyan-300 tracking-wide">{gateway.title}</h2>
                <p className="text-base sm:text-lg text-gray-400">{gateway.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-4xl text-gray-400 hover:text-white transition-colors" aria-label="Close project viewer">&times;</button>
        </header>
        <div className="flex-grow overflow-y-auto py-8">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {gateway.projects.map(key => {
                const project = allProjects[key];
                if (!project) return null;
                return <ProjectDisplayCard key={key} project={project} onNavigate={onNavigate} onNavigateExternal={onNavigateExternal} onClose={onClose} />
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectViewer;