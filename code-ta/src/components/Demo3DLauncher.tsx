import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, Play, Zap } from 'lucide-react';

export default function Demo3DLauncher() {
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  const handleLaunch = () => {
    navigate('/demo');
  };

  return (
    <>
      {/* Floating Launch Button */}
      <button
        onClick={() => setShowModal(true)}
        className="demo-launcher-button"
        title="Experience 3D Interactive Demo"
      >
        <Sparkles className="w-5 h-5" />
        <span className="button-text">3D Demo</span>
        <div className="button-pulse"></div>
      </button>

      {/* Modal */}
      {showModal && (
        <div className="demo-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="demo-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setShowModal(false)}
            >
              <X size={20} />
            </button>

            <div className="modal-content">
              <div className="modal-icon">
                <Sparkles size={48} />
              </div>

              <h2 className="modal-title">
                Experience CollabRoom in 3D
              </h2>

              <p className="modal-description">
                Take an immersive journey through our IDE with:
              </p>

              <ul className="modal-features">
                <li>
                  <Zap size={16} />
                  <span>Interactive 3D visualization</span>
                </li>
                <li>
                  <Zap size={16} />
                  <span>Live code and terminal animations</span>
                </li>
                <li>
                  <Zap size={16} />
                  <span>Architecture exploration</span>
                </li>
                <li>
                  <Zap size={16} />
                  <span>Scroll-based storytelling</span>
                </li>
              </ul>

              <div className="modal-actions">
                <button
                  className="modal-btn primary"
                  onClick={handleLaunch}
                >
                  <Play size={20} />
                  Launch 3D Demo
                </button>
                <button
                  className="modal-btn secondary"
                  onClick={() => setShowModal(false)}
                >
                  Maybe Later
                </button>
              </div>

              <p className="modal-note">
                Best experienced on desktop with a modern browser
              </p>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .demo-launcher-button {
          position: fixed;
          bottom: 30px;
          right: 30px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 24px;
          background: linear-gradient(135deg, #00f2ff 0%, #0088ff 100%);
          color: #000;
          border: none;
          border-radius: 50px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(0, 242, 255, 0.4);
          transition: all 0.3s ease;
          z-index: 1000;
          overflow: hidden;
          position: relative;
        }

        .demo-launcher-button:hover {
          transform: translateY(-2px) scale(1.05);
          box-shadow: 0 6px 30px rgba(0, 242, 255, 0.6);
        }

        .demo-launcher-button:active {
          transform: translateY(0) scale(0.98);
        }

        .button-text {
          position: relative;
          z-index: 2;
        }

        .button-pulse {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 100%;
          height: 100%;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.3) 0%, transparent 70%);
          animation: pulse 2s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes pulse {
          0%, 100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.5;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.5);
            opacity: 0;
          }
        }

        .demo-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .demo-modal {
          background: linear-gradient(135deg, #1a1a1a 0%, #2a1a2a 100%);
          border: 2px solid rgba(0, 242, 255, 0.3);
          border-radius: 16px;
          padding: 40px;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 20px 60px rgba(0, 242, 255, 0.3);
          position: relative;
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from {
            transform: translateY(50px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          cursor: pointer;
          transition: all 0.2s;
        }

        .modal-close:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: rotate(90deg);
        }

        .modal-content {
          text-align: center;
        }

        .modal-icon {
          display: inline-flex;
          padding: 20px;
          background: linear-gradient(135deg, rgba(0, 242, 255, 0.2) 0%, rgba(255, 0, 255, 0.2) 100%);
          border-radius: 50%;
          margin-bottom: 24px;
          color: #00f2ff;
          animation: float 3s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        .modal-title {
          font-size: 28px;
          font-weight: 900;
          background: linear-gradient(135deg, #00f2ff 0%, #ff00ff 50%, #00ff88 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 16px;
        }

        .modal-description {
          color: #ccc;
          font-size: 16px;
          margin-bottom: 24px;
        }

        .modal-features {
          list-style: none;
          padding: 0;
          margin: 0 0 32px 0;
          text-align: left;
        }

        .modal-features li {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: rgba(0, 242, 255, 0.05);
          border-left: 3px solid #00f2ff;
          margin-bottom: 8px;
          border-radius: 4px;
          color: #fff;
          transition: all 0.2s;
        }

        .modal-features li:hover {
          background: rgba(0, 242, 255, 0.1);
          transform: translateX(4px);
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
        }

        .modal-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px 24px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .modal-btn.primary {
          background: linear-gradient(135deg, #00f2ff 0%, #0088ff 100%);
          color: #000;
          box-shadow: 0 4px 20px rgba(0, 242, 255, 0.4);
        }

        .modal-btn.primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 30px rgba(0, 242, 255, 0.6);
        }

        .modal-btn.secondary {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .modal-btn.secondary:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .modal-note {
          color: #999;
          font-size: 12px;
          font-style: italic;
        }

        @media (max-width: 768px) {
          .demo-modal {
            padding: 24px;
          }

          .modal-title {
            font-size: 24px;
          }

          .modal-actions {
            flex-direction: column;
          }

          .button-text {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
