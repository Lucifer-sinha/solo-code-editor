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
          <h2 className="cta-title">CollabRoom: The Future of Collaborative Coding</h2>
          <p className="cta-subtitle">Built with React, TypeScript, Socket.IO, Yjs CRDT, Docker & MongoDB</p>
          <div className="cta-buttons">
            <button className="cta-btn primary" onClick={() => window.open('http://localhost:5173', '_blank')}>
              <span className="btn-icon">🚀</span>
              Launch CollabRoom
            </button>
            <button className="cta-btn secondary" onClick={() => window.open('https://github.com/your-repo/code-ta', '_blank')}>
              <span className="btn-icon">💻</span>
              View on GitHub
            </button>
            <button className="cta-btn tertiary" onClick={() => window.open('mailto:contact@collabroom.dev', '_blank')}>
              <span className="btn-icon">📧</span>
              Contact Us
            </button>
          </div>
          <div className="cta-stats">
            <div className="stat">
              <div className="stat-value">14+</div>
              <div className="stat-label">Programming Languages</div>
            </div>
            <div className="stat">
              <div className="stat-value">200+</div>
              <div className="stat-label">Concurrent Users</div>
            </div>
            <div className="stat">
              <div className="stat-value">&lt;50ms</div>
              <div className="stat-label">CRDT Sync Latency</div>
            </div>
            <div className="stat">
              <div className="stat-value">99.8%</div>
              <div className="stat-label">Docker Security</div>
            </div>
            <div className="stat">
              <div className="stat-value">Real-time</div>
              <div className="stat-label">Collaboration</div>
            </div>
            <div className="stat">
              <div className="stat-value">MongoDB</div>
              <div className="stat-label">Database</div>
            </div>
            <div className="stat">
              <div className="stat-value">Socket.IO</div>
              <div className="stat-label">WebSocket</div>
            </div>
            <div className="stat">
              <div className="stat-value">Yjs CRDT</div>
              <div className="stat-label">Conflict Resolution</div>
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
