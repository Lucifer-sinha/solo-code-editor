import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import IDEExperience from '../components/3D/IDEExperience';
import LoadingScreen from '../components/3D/LoadingScreen';
import '../styles/demo3d.css';

export default function Demo3D() {
  return (
    <div className="demo-3d-container">
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 0, 5], fov: 75 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          {/* Lighting */}
          <ambientLight intensity={0.3} />
          <pointLight position={[10, 10, 10]} intensity={1} />
          <pointLight position={[-10, -10, -10]} intensity={0.5} color="#00f2ff" />
          
          {/* Main Experience */}
          <IDEExperience />
          
          {/* Post Processing Effects */}
          <EffectComposer>
            <Bloom
              intensity={0.5}
              luminanceThreshold={0.2}
              luminanceSmoothing={0.9}
            />
          </EffectComposer>
        </Suspense>
      </Canvas>
      
      {/* Loading Screen */}
      <LoadingScreen />
      
      {/* Scroll Indicator */}
      <div className="scroll-indicator">
        <div className="scroll-arrow">↓</div>
        <p>Scroll to explore</p>
      </div>
    </div>
  );
}
