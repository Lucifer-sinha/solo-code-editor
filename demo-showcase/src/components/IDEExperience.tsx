import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { ScrollControls, useScroll, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import IDEPanels from './IDEPanels';
import HologramCube from './HologramCube';
import ArchitectureDiagram from './ArchitectureDiagram';
import FloatingParticles from './FloatingParticles';
import CTAScene from './CTAScene';

export default function IDEExperience() {
  return (
    <ScrollControls pages={5} damping={0.1}>
      <ExperienceContent />
    </ScrollControls>
  );
}

function ExperienceContent() {
  const scroll = useScroll();
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const [currentScene, setCurrentScene] = useState(0);
  const [startedTyping, setStartedTyping] = useState(false);
  const [terminalsOpened, setTerminalsOpened] = useState(false);
  const [archVisible, setArchVisible] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);

  useFrame(() => {
    if (!cameraRef.current) return;
    
    const scrollOffset = scroll.offset;
    
    // Scene 0: Landing (0-20%)
    if (scrollOffset < 0.2) {
      setCurrentScene(0);
      // Camera orbits around the hologram cube
      cameraRef.current.position.x = Math.sin(scrollOffset * Math.PI * 2) * 3;
      cameraRef.current.position.y = scrollOffset * 2;
      cameraRef.current.position.z = 5 - scrollOffset * 5;
      cameraRef.current.lookAt(0, 0, 0);
    }
    
    // Scene 1: Enter Cube (20-40%)
    else if (scrollOffset >= 0.2 && scrollOffset < 0.4) {
      if (currentScene !== 1) setCurrentScene(1);
      const localProgress = (scrollOffset - 0.2) / 0.2;
      
      // Camera zooms into the cube
      cameraRef.current.position.z = 5 - localProgress * 8;
      cameraRef.current.position.y = 2 - localProgress * 2;
      cameraRef.current.lookAt(0, 0, 0);
    }
    
    // Scene 2: Panels Wake Up (40-60%)
    else if (scrollOffset >= 0.4 && scrollOffset < 0.6) {
      if (currentScene !== 2) {
        setCurrentScene(2);
        if (!startedTyping) setStartedTyping(true);
      }
      const localProgress = (scrollOffset - 0.4) / 0.2;
      
      // Camera pans to show all panels
      cameraRef.current.position.x = localProgress * 2;
      cameraRef.current.position.z = -3;
      cameraRef.current.lookAt(0, 0, 0);
    }
    
    // Scene 3: Terminal Showcase (60-80%)
    else if (scrollOffset >= 0.6 && scrollOffset < 0.8) {
      if (currentScene !== 3) {
        setCurrentScene(3);
        if (!terminalsOpened) setTerminalsOpened(true);
      }
      const localProgress = (scrollOffset - 0.6) / 0.2;
      
      // Camera pans right to terminals
      cameraRef.current.position.x = 2 + localProgress * 2;
      cameraRef.current.position.y = localProgress * 1;
      cameraRef.current.lookAt(3, 0, 0);
    }
    
    // Scene 4: Architecture Explosion (80-100%)
    else if (scrollOffset >= 0.8) {
      if (currentScene !== 4) {
        setCurrentScene(4);
        if (!archVisible) setArchVisible(true);
      }
      const localProgress = (scrollOffset - 0.8) / 0.2;
      
      // Camera zooms out for architecture view
      cameraRef.current.position.z = -3 + localProgress * 8;
      cameraRef.current.position.y = 1 + localProgress * 3;
      cameraRef.current.lookAt(0, 0, 0);
      
      if (scrollOffset > 0.95 && !ctaVisible) {
        setCtaVisible(true);
      }
    }
  });

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 0, 5]} fov={75} />
      
      {/* Scene 0: Hologram Cube Landing */}
      {currentScene === 0 && <HologramCube />}
      
      {/* Scene 1-3: IDE Panels */}
      {currentScene >= 1 && currentScene <= 3 && (
        <IDEPanels 
          startTyping={startedTyping}
          openTerminals={terminalsOpened}
          scene={currentScene}
        />
      )}
      
      {/* Scene 4: Architecture Diagram */}
      {currentScene === 4 && archVisible && <ArchitectureDiagram />}
      
      {/* CTA Scene */}
      {ctaVisible && <CTAScene />}
      
      {/* Ambient Particles */}
      <FloatingParticles count={100} />
    </>
  );
}
