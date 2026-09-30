import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandLockup } from '../components/brand/SparkHub';
import HeaderAtmosphere from '../components/brand/HeaderAtmosphere';
import './LandingPage.css';

export default function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const transitionDelay = reducedMotion ? 150 : 1100;
    const timer = window.setTimeout(() => navigate('/login', { replace: true }), transitionDelay);

    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <main className="brand-intro" aria-labelledby="brand-intro-status">
      <HeaderAtmosphere />
      <div className="brand-intro-mark">
        <BrandLockup layout="stacked" size={72} />
      </div>
      <p id="brand-intro-status" role="status" aria-live="polite">
        DEVCON Kids is loading
      </p>
      <span className="brand-intro-progress" aria-hidden="true" />
    </main>
  );
}
