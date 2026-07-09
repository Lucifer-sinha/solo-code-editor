import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export default function Demo3DButton() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate('/demo')}
      className="demo-3d-button"
      title="Experience 3D Interactive Demo"
    >
      <Sparkles className="w-5 h-5" />
      <span>3D Demo</span>
      <div className="button-glow"></div>
    </button>
  );
}
