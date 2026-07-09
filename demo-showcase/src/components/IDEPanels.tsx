import React, { useRef, useEffect } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import MonacoPlayback from './MonacoPlayback';
import TerminalPlayback from './TerminalPlayback';

interface IDEPanelsProps {
  startTyping: boolean;
  openTerminals: boolean;
  scene: number;
}

export default function IDEPanels({ startTyping, openTerminals, scene }: IDEPanelsProps) {
  const fileTreeRef = useRef<THREE.Mesh>(null);
  const editorRef = useRef<THREE.Mesh>(null);
  const terminalRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (scene === 2) {
      // Animate panels appearing
      if (fileTreeRef.current) {
        gsap.from(fileTreeRef.current.position, {
          x: -5,
          duration: 1,
          ease: 'power3.out',
        });
      }
      if (editorRef.current) {
        gsap.from(editorRef.current.position, {
          y: 3,
          duration: 1,
          delay: 0.2,
          ease: 'power3.out',
        });
      }
      if (terminalRef.current) {
        gsap.from(terminalRef.current.position, {
          x: 5,
          duration: 1,
          delay: 0.4,
          ease: 'power3.out',
        });
      }
    }
  }, [scene]);

  return (
    <group>
      {/* File Tree Panel */}
      <Panel
        ref={fileTreeRef}
        position={[-3, 0, 0]}
        size={[2, 3]}
        color="#1e1e1e"
        title="File Explorer"
      >
        <div className="file-tree-demo">
          <div className="file-item">📁 code-ta</div>
          <div className="file-item indent">📁 src</div>
          <div className="file-item indent2">📁 components</div>
          <div className="file-item indent3">📄 CollabRoom.tsx</div>
          <div className="file-item indent3">📄 FileExplorer.tsx</div>
          <div className="file-item indent3">📄 CodeEditor.tsx</div>
          <div className="file-item indent3">📄 CollabTerminal.tsx</div>
          <div className="file-item indent2">📁 context</div>
          <div className="file-item indent3">📄 AuthContext.tsx</div>
          <div className="file-item indent3">📄 CollabContext.tsx</div>
          <div className="file-item indent2">📁 pages</div>
          <div className="file-item indent3">📄 Playground.tsx</div>
          <div className="file-item indent2">📁 utils</div>
          <div className="file-item indent3">📄 socket.ts</div>
          <div className="file-item indent3">📄 docker.ts</div>
          <div className="file-item indent">📄 package.json</div>
          <div className="file-item indent">📄 docker-compose.yml</div>
        </div>
      </Panel>

      {/* Code Editor Panel */}
      <Panel
        ref={editorRef}
        position={[0, 0, 0]}
        size={[4, 3]}
        color="#1e1e1e"
        title="Code Editor"
      >
        <MonacoPlayback startTyping={startTyping} />
      </Panel>

      {/* Terminal Panel */}
      <Panel
        ref={terminalRef}
        position={[3.5, 0, 0]}
        size={[2.5, 3]}
        color="#0a0a0a"
        title="Terminal"
      >
        <TerminalPlayback startPlayback={openTerminals} />
      </Panel>

      {/* Neon Borders */}
      <NeonBorder position={[-3, 0, 0.01]} size={[2, 3]} color="#00f2ff" />
      <NeonBorder position={[0, 0, 0.01]} size={[4, 3]} color="#ff00ff" />
      <NeonBorder position={[3.5, 0, 0.01]} size={[2.5, 3]} color="#00ff88" />
    </group>
  );
}

const Panel = React.forwardRef<THREE.Mesh, any>(
  ({ position, size, color, title, children }, ref) => {
    return (
      <mesh ref={ref} position={position}>
        <planeGeometry args={size} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
        />
        <Html
          transform
          occlude
          distanceFactor={1.5}
          style={{
            width: `${size[0] * 100}px`,
            height: `${size[1] * 100}px`,
            pointerEvents: 'none',
          }}
        >
          <div className="panel-container">
            <div className="panel-header">{title}</div>
            <div className="panel-content">{children}</div>
          </div>
        </Html>
      </mesh>
    );
  }
);

function NeonBorder({ position, size, color }: any) {
  const ref = useRef<THREE.LineSegments>(null);

  useEffect(() => {
    if (ref.current) {
      gsap.to(ref.current.material, {
        opacity: 1,
        duration: 1,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    }
  }, []);

  const points = [
    new THREE.Vector3(-size[0] / 2, -size[1] / 2, 0),
    new THREE.Vector3(size[0] / 2, -size[1] / 2, 0),
    new THREE.Vector3(size[0] / 2, size[1] / 2, 0),
    new THREE.Vector3(-size[0] / 2, size[1] / 2, 0),
    new THREE.Vector3(-size[0] / 2, -size[1] / 2, 0),
  ];

  const geometry = new THREE.BufferGeometry().setFromPoints(points);

  return (
    <lineSegments ref={ref} position={position} geometry={geometry}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={0.6}
        linewidth={2}
      />
    </lineSegments>
  );
}
