import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

export default function HologramCube() {
  const cubeRef = useRef<THREE.Mesh>(null);
  const innerCubeRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (cubeRef.current) {
      cubeRef.current.rotation.x = state.clock.elapsedTime * 0.2;
      cubeRef.current.rotation.y = state.clock.elapsedTime * 0.3;
    }
    if (innerCubeRef.current) {
      innerCubeRef.current.rotation.x = -state.clock.elapsedTime * 0.15;
      innerCubeRef.current.rotation.y = -state.clock.elapsedTime * 0.25;
    }
  });

  return (
    <group>
      {/* Outer Hologram Cube */}
      <mesh ref={cubeRef}>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial
          color="#00f2ff"
          transparent
          opacity={0.1}
          wireframe
          emissive="#00f2ff"
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Inner Glowing Cube */}
      <mesh ref={innerCubeRef} scale={0.7}>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial
          color="#ff00ff"
          transparent
          opacity={0.2}
          emissive="#ff00ff"
          emissiveIntensity={0.8}
        />
      </mesh>

      {/* Floating Title */}
      <Html
        position={[0, 3, 0]}
        center
        distanceFactor={8}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div className="hologram-title">
          <h1 className="title-main">Web IDE of the Future</h1>
          <p className="title-sub">Step in. Explore. Code Together.</p>
          <div className="title-glow"></div>
        </div>
      </Html>

      {/* Orbiting Particles */}
      {Array.from({ length: 8 }).map((_, i) => (
        <OrbitingParticle key={i} index={i} total={8} />
      ))}
    </group>
  );
}

function OrbitingParticle({ index, total }: { index: number; total: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const angle = (index / total) * Math.PI * 2;

  useFrame((state) => {
    if (ref.current) {
      const time = state.clock.elapsedTime;
      const radius = 3;
      ref.current.position.x = Math.cos(angle + time) * radius;
      ref.current.position.y = Math.sin(angle + time * 0.5) * radius;
      ref.current.position.z = Math.sin(angle + time) * radius;
    }
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.05, 16, 16]} />
      <meshStandardMaterial
        color="#00f2ff"
        emissive="#00f2ff"
        emissiveIntensity={2}
      />
    </mesh>
  );
}
