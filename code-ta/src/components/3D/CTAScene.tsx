import { useRef, useEffect } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';

export default function CTAScene() {
  const logoRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (logoRef.current) {
      gsap.from(logoRef.current.scale, {
        x: 0,
        y: 0,
        z: 0,
        duration: 1.5,
        ease: 'elastic.out(1, 0.5)',
      });
    }
  }, []);

  return (
    <group ref={logoRef}>
      {/* Logo Formation */}
      <LogoParticles />

      {/* CTA Buttons */}
      <Html center distanceFactor={8} position={[0, -2, 0]}>
        <div className="cta-container">
          <h2 className="cta-title">Ready to Transform Your Coding Experience?</h2>
          <div className="cta-buttons">
            <button className="cta-btn primary">
              <span className="btn-icon">🚀</span>
              Try Demo
            </button>
            <button className="cta-btn secondary">
              <span className="btn-icon">👥</span>
              Join Team
            </button>
            <button className="cta-btn tertiary">
              <span className="btn-icon">📊</span>
              Investor Deck
            </button>
          </div>
          <div className="cta-stats">
            <div className="stat">
              <div className="stat-value">200+</div>
              <div className="stat-label">Concurrent Users</div>
            </div>
            <div className="stat">
              <div className="stat-value">14+</div>
              <div className="stat-label">Languages</div>
            </div>
            <div className="stat">
              <div className="stat-value">99.8%</div>
              <div className="stat-label">Security</div>
            </div>
            <div className="stat">
              <div className="stat-value">&lt;50ms</div>
              <div className="stat-label">Sync Latency</div>
            </div>
          </div>
        </div>
      </Html>
    </group>
  );
}

function LogoParticles() {
  const particlesRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (particlesRef.current) {
      particlesRef.current.children.forEach((child, i) => {
        gsap.from(child.position, {
          x: (Math.random() - 0.5) * 10,
          y: (Math.random() - 0.5) * 10,
          z: (Math.random() - 0.5) * 10,
          duration: 2,
          delay: i * 0.05,
          ease: 'power3.out',
        });
      });
    }
  }, []);

  // Create logo shape with particles
  const logoPoints = [
    // C shape
    [-1, 1, 0], [-0.5, 1.5, 0], [0, 1.5, 0],
    [-1, 0.5, 0], [-1.5, 0, 0], [-1, -0.5, 0],
    [-0.5, -1.5, 0], [0, -1.5, 0],
    // T shape
    [0.5, 1.5, 0], [1, 1.5, 0], [1.5, 1.5, 0],
    [1, 1, 0], [1, 0.5, 0], [1, 0, 0],
    [1, -0.5, 0], [1, -1, 0], [1, -1.5, 0],
  ];

  return (
    <group ref={particlesRef}>
      {logoPoints.map((point, i) => (
        <mesh key={i} position={point}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? '#00f2ff' : i % 3 === 1 ? '#ff00ff' : '#00ff88'}
            emissive={i % 3 === 0 ? '#00f2ff' : i % 3 === 1 ? '#ff00ff' : '#00ff88'}
            emissiveIntensity={2}
          />
        </mesh>
      ))}
    </group>
  );
}
