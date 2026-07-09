import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';

export default function ArchitectureDiagram() {
  return (
    <group>
      {/* Docker Containers */}
      <DockerContainer position={[-3, 2, 0]} label="Python Container" color="#3776ab" />
      <DockerContainer position={[0, 2, 0]} label="Node.js Container" color="#68a063" />
      <DockerContainer position={[3, 2, 0]} label="Java Container" color="#f89820" />

      {/* Backend Services */}
      <ServiceNode position={[-2, 0, 0]} label="WebSocket Server" color="#00f2ff" />
      <ServiceNode position={[0, 0, 0]} label="File System API" color="#ff00ff" />
      <ServiceNode position={[2, 0, 0]} label="Execution Engine" color="#00ff88" />

      {/* Database */}
      <DatabaseNode position={[0, -2, 0]} label="MongoDB" />

      {/* Connection Lines */}
      <ConnectionLine start={[-3, 2, 0]} end={[-2, 0, 0]} color="#3776ab" />
      <ConnectionLine start={[0, 2, 0]} end={[0, 0, 0]} color="#68a063" />
      <ConnectionLine start={[3, 2, 0]} end={[2, 0, 0]} color="#f89820" />
      
      <ConnectionLine start={[-2, 0, 0]} end={[0, -2, 0]} color="#00f2ff" />
      <ConnectionLine start={[0, 0, 0]} end={[0, -2, 0]} color="#ff00ff" />
      <ConnectionLine start={[2, 0, 0]} end={[0, -2, 0]} color="#00ff88" />

      {/* Data Packets */}
      <DataPacket path={[[-3, 2, 0], [-2, 0, 0], [0, -2, 0]]} />
      <DataPacket path={[[0, 2, 0], [0, 0, 0], [0, -2, 0]]} delay={0.5} />
      <DataPacket path={[[3, 2, 0], [2, 0, 0], [0, -2, 0]]} delay={1} />

      {/* Metrics Holograms */}
      <MetricHologram position={[-4, 0, 0]} metric="CPU" value="45%" />
      <MetricHologram position={[4, 0, 0]} metric="Memory" value="2.1GB" />
      <MetricHologram position={[0, 3, 0]} metric="Users" value="200+" />
    </group>
  );
}

function DockerContainer({ position, label, color }: any) {
  const ref = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (ref.current) {
      gsap.from(ref.current.scale, {
        x: 0,
        y: 0,
        z: 0,
        duration: 1,
        ease: 'elastic.out(1, 0.5)',
      });
    }
  }, []);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = Math.sin(state.clock.elapsedTime) * 0.1;
    }
  });

  return (
    <group position={position}>
      <mesh ref={ref}>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          transparent
          opacity={0.8}
        />
      </mesh>
      <Html center distanceFactor={8}>
        <div className="arch-label">{label}</div>
      </Html>
    </group>
  );
}

function ServiceNode({ position, label, color }: any) {
  const ref = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (ref.current) {
      gsap.from(ref.current.scale, {
        x: 0,
        y: 0,
        z: 0,
        duration: 1,
        delay: 0.3,
        ease: 'back.out(1.7)',
      });
    }
  }, []);

  useFrame((state) => {
    if (ref.current) {
      ref.current.position.y += Math.sin(state.clock.elapsedTime * 2) * 0.001;
    }
  });

  return (
    <group position={position}>
      <mesh ref={ref}>
        <sphereGeometry args={[0.4, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1}
          transparent
          opacity={0.9}
        />
      </mesh>
      <Html center distanceFactor={8}>
        <div className="arch-label">{label}</div>
      </Html>
    </group>
  );
}

function DatabaseNode({ position, label }: any) {
  const ref = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (ref.current) {
      gsap.from(ref.current.scale, {
        x: 0,
        y: 0,
        z: 0,
        duration: 1,
        delay: 0.6,
        ease: 'elastic.out(1, 0.5)',
      });
    }
  }, []);

  return (
    <group position={position}>
      <mesh ref={ref}>
        <cylinderGeometry args={[0.6, 0.6, 0.4, 32]} />
        <meshStandardMaterial
          color="#47a248"
          emissive="#47a248"
          emissiveIntensity={0.8}
        />
      </mesh>
      <Html center distanceFactor={8}>
        <div className="arch-label">{label}</div>
      </Html>
    </group>
  );
}

function ConnectionLine({ start, end, color }: any) {
  return (
    <Line
      points={[start, end]}
      color={color}
      lineWidth={2}
      transparent
      opacity={0.6}
      dashed
      dashScale={50}
      dashSize={0.1}
      gapSize={0.05}
    />
  );
}

function DataPacket({ path, delay = 0 }: any) {
  const ref = useRef<THREE.Mesh>(null);
  const [currentPoint, setCurrentPoint] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPoint((prev) => (prev + 1) % path.length);
    }, 1000);

    return () => clearInterval(interval);
  }, [path.length]);

  useEffect(() => {
    if (ref.current && path[currentPoint]) {
      gsap.to(ref.current.position, {
        x: path[currentPoint][0],
        y: path[currentPoint][1],
        z: path[currentPoint][2],
        duration: 0.8,
        delay,
        ease: 'power2.inOut',
      });
    }
  }, [currentPoint, path, delay]);

  return (
    <mesh ref={ref} position={path[0]}>
      <sphereGeometry args={[0.1, 16, 16]} />
      <meshStandardMaterial
        color="#ffffff"
        emissive="#ffffff"
        emissiveIntensity={2}
      />
    </mesh>
  );
}

function MetricHologram({ position, metric, value }: any) {
  return (
    <Html position={position} center distanceFactor={8}>
      <div className="metric-hologram">
        <div className="metric-label">{metric}</div>
        <div className="metric-value">{value}</div>
      </div>
    </Html>
  );
}

// Add missing import
import { useState } from 'react';
