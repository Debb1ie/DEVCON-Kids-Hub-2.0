import { useEffect, useRef, useState } from 'react';
import { CosmicEngine } from './cosmicEngine';
import './cosmic.css';

/**
 * Decorative cosmic atmosphere rendered behind the UI.
 * mode="viewport": fixed full-screen layer (app shell). mode="container": fills its positioned parent (login panel).
 * intensity scales density (1 = full, 0.45 = restrained for data-heavy pages).
 */
export default function CosmicBackground({ mode = 'viewport', intensity = 1, seed = 11, tone = 'auto', className = '' }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  // Density at mount; later changes are applied by the second effect without rebuilding the canvas.
  const [initialIntensity] = useState(intensity);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const isDark = () => tone === 'dark' || (tone === 'auto' && document.body.classList.contains('dark-mode'));
    const engine = new CosmicEngine(canvas, { root: mode === 'container' ? canvas.parentElement : document.body, mode, intensity: initialIntensity, seed, dark: isDark() });
    engineRef.current = engine;
    engine.resize();
    engine.start();

    let measureTimer = 0;
    const remeasure = () => {
      window.clearTimeout(measureTimer);
      measureTimer = window.setTimeout(() => engine.measure(), 140);
    };
    const onResize = () => { engine.resize(); if (engine.running || engine.reduced) engine.start(); };
    const onVisibility = () => (document.hidden ? engine.stop() : engine.start());
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => { engine.reduced = motionQuery.matches; engine.stop(); engine.start(); };
    const onPointer = (event) => engine.setPointer((event.clientX / window.innerWidth - 0.5) * 2, (event.clientY / window.innerHeight - 0.5) * 2);
    const themeObserver = new MutationObserver(() => {
      const dark = isDark();
      if (dark !== engine.dark) { engine.dark = dark; engine.build(); }
    });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const interval = window.setInterval(() => { if (!document.hidden) engine.measure(); }, 2000);

    window.addEventListener('resize', onResize);
    document.addEventListener('scroll', remeasure, true);
    document.addEventListener('visibilitychange', onVisibility);
    motionQuery.addEventListener('change', onMotion);
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    if (finePointer) window.addEventListener('pointermove', onPointer, { passive: true });

    return () => {
      engine.stop();
      themeObserver.disconnect();
      window.clearInterval(interval);
      window.clearTimeout(measureTimer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('scroll', remeasure, true);
      document.removeEventListener('visibilitychange', onVisibility);
      motionQuery.removeEventListener('change', onMotion);
      if (finePointer) window.removeEventListener('pointermove', onPointer);
    };
  }, [mode, seed, tone, initialIntensity]);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine && engine.intensity !== intensity) { engine.intensity = intensity; engine.build(); }
  }, [intensity]);

  return (
    <div className={`cosmic-layer is-${mode} ${className}`} aria-hidden="true">
      <div className="cosmic-nebula" />
      <canvas ref={canvasRef} className="cosmic-canvas" />
    </div>
  );
}
