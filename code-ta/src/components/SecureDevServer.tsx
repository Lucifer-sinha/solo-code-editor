import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getApiUrl } from '../config/api';
import { 
  Play, 
  Square, 
  ExternalLink, 
  Shield, 
  Clock, 
  Server,
  AlertTriangle,
  CheckCircle,
  Loader,
  RefreshCw
} from 'lucide-react';

interface DevServer {
  sessionId: string;
  proxyUrl: string;
  framework: string;
  language: string;
  expiresAt: string;
  createdAt: string;
}

interface SecureDevServerProps {
  code: string;
  language: string;
  framework?: string;
  onServerCreated?: (server: DevServer) => void;
}

export default function SecureDevServer({ 
  code, 
  language, 
  framework,
  onServerCreated 
}: SecureDevServerProps) {
  const { token } = useAuth() || {};
  const [isCreating, setIsCreating] = useState(false);
  const [activeServers, setActiveServers] = useState<DevServer[]>([]);
  const [currentServer, setCurrentServer] = useState<DevServer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Supported frameworks for dev servers
  const supportedFrameworks = ['react', 'vue', 'html', 'javascript', 'typescript'];
  const isSupported = supportedFrameworks.includes(framework || language);

  useEffect(() => {
    if (token) {
      loadActiveServers();
    }
  }, [token]);

  const loadActiveServers = async () => {
    if (!token) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(getApiUrl('dev-server/list'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setActiveServers(data.servers || []);
      }
    } catch (error) {
      console.error('Error loading active servers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createDevServer = async () => {
    if (!token || !code.trim()) {
      setError('Code is required to create a development server');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch(getApiUrl('dev-server/create'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          code,
          language,
          framework: framework || language
        })
      });

      const data = await response.json();

      if (response.ok) {
        const newServer: DevServer = {
          sessionId: data.sessionId,
          proxyUrl: data.proxyUrl,
          framework: framework || language,
          language,
          expiresAt: data.expiresAt,
          createdAt: new Date().toISOString()
        };

        setCurrentServer(newServer);
        setActiveServers(prev => [newServer, ...prev]);
        onServerCreated?.(newServer);

        // Auto-open the server in a new tab after a short delay
        setTimeout(() => {
          window.open(data.proxyUrl, '_blank', 'noopener,noreferrer');
        }, 3000);
      } else {
        setError(data.error || 'Failed to create development server');
      }
    } catch (error) {
      setError('Network error: Unable to create development server');
      console.error('Error creating dev server:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const stopDevServer = async (sessionId: string) => {
    if (!token) return;

    try {
      const response = await fetch(getApiUrl(`dev-server/${sessionId}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setActiveServers(prev => prev.filter(s => s.sessionId !== sessionId));
        if (currentServer?.sessionId === sessionId) {
          setCurrentServer(null);
        }
      }
    } catch (error) {
      console.error('Error stopping dev server:', error);
    }
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date().getTime();
    const expires = new Date(expiresAt).getTime();
    const remaining = expires - now;
    
    if (remaining <= 0) return 'Expired';
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getFrameworkIcon = (framework: string) => {
    const icons: { [key: string]: string } = {
      'react': '⚛️',
      'vue': '💚',
      'html': '🌐',
      'javascript': '🟨',
      'typescript': '🔷'
    };
    return icons[framework] || '📄';
  };

  if (!isSupported) {
    return (
      <div className="secure-dev-server-unsupported">
        <div className="unsupported-content">
          <AlertTriangle size={24} />
          <h4>Development Server Not Available</h4>
          <p>
            Development servers are only available for web frameworks:
            React, Vue, HTML, JavaScript, and TypeScript.
          </p>
          <p>Current language: <strong>{language}</strong></p>
        </div>
      </div>
    );
  }

  return (
    <div className="secure-dev-server">
      <div className="dev-server-header">
        <div className="header-title">
          <Shield size={18} />
          <h3>Secure Development Server</h3>
          <span className="security-badge">🔒 Isolated</span>
        </div>
        
        <div className="header-actions">
          <button
            onClick={loadActiveServers}
            disabled={isLoading}
            className="refresh-btn"
            title="Refresh server list"
          >
            <RefreshCw size={14} className={isLoading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="dev-server-content">
        {/* Create New Server */}
        <div className="create-server-section">
          <div className="section-header">
            <Server size={16} />
            <span>Create Development Server</span>
          </div>
          
          <div className="server-info">
            <div className="info-item">
              <span className="label">Framework:</span>
              <span className="value">
                {getFrameworkIcon(framework || language)} {framework || language}
              </span>
            </div>
            <div className="info-item">
              <span className="label">Security:</span>
              <span className="value">🛡️ Container Isolation</span>
            </div>
            <div className="info-item">
              <span className="label">Duration:</span>
              <span className="value">⏱️ 2 hours max</span>
            </div>
          </div>

          <button
            onClick={createDevServer}
            disabled={isCreating || !code.trim()}
            className="create-server-btn"
          >
            {isCreating ? (
              <>
                <Loader size={16} className="spinning" />
                Creating Server...
              </>
            ) : (
              <>
                <Play size={16} />
                Create Secure Server
              </>
            )}
          </button>

          {isCreating && (
            <div className="creation-status">
              <div className="status-steps">
                <div className="step active">
                  <CheckCircle size={12} />
                  <span>Creating container</span>
                </div>
                <div className="step active">
                  <Loader size={12} className="spinning" />
                  <span>Installing dependencies</span>
                </div>
                <div className="step">
                  <Clock size={12} />
                  <span>Starting server</span>
                </div>
              </div>
              <p className="status-note">
                This may take 30-60 seconds for npm install...
              </p>
            </div>
          )}
        </div>

        {/* Active Servers */}
        {activeServers.length > 0 && (
          <div className="active-servers-section">
            <div className="section-header">
              <Server size={16} />
              <span>Active Servers ({activeServers.length})</span>
            </div>

            <div className="servers-list">
              {activeServers.map((server) => (
                <div key={server.sessionId} className="server-card">
                  <div className="server-info">
                    <div className="server-title">
                      {getFrameworkIcon(server.framework)} {server.framework}
                    </div>
                    <div className="server-details">
                      <span className="detail">
                        <Clock size={12} />
                        {getTimeRemaining(server.expiresAt)}
                      </span>
                      <span className="detail">
                        <Shield size={12} />
                        Secure
                      </span>
                    </div>
                  </div>

                  <div className="server-actions">
                    <button
                      onClick={() => window.open(server.proxyUrl, '_blank', 'noopener,noreferrer')}
                      className="open-btn"
                      title="Open in new tab"
                    >
                      <ExternalLink size={14} />
                      Open
                    </button>
                    <button
                      onClick={() => stopDevServer(server.sessionId)}
                      className="stop-btn"
                      title="Stop server"
                    >
                      <Square size={14} />
                      Stop
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current Server Preview */}
        {currentServer && (
          <div className="current-server-section">
            <div className="section-header">
              <CheckCircle size={16} />
              <span>Server Ready!</span>
            </div>
            
            <div className="server-preview">
              <div className="preview-info">
                <p>Your secure development server is running:</p>
                <div className="server-url">
                  <code>{currentServer.proxyUrl}</code>
                  <button
                    onClick={() => navigator.clipboard.writeText(currentServer.proxyUrl)}
                    className="copy-btn"
                    title="Copy URL"
                  >
                    📋
                  </button>
                </div>
              </div>
              
              <div className="preview-actions">
                <button
                  onClick={() => window.open(currentServer.proxyUrl, '_blank', 'noopener,noreferrer')}
                  className="open-preview-btn"
                >
                  <ExternalLink size={16} />
                  Open in New Tab
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Security Information */}
        <div className="security-info">
          <div className="security-header">
            <Shield size={14} />
            <span>Security Features</span>
          </div>
          <ul className="security-features">
            <li>🔒 Container isolation with resource limits</li>
            <li>🛡️ No network access for executed code</li>
            <li>⏱️ Automatic cleanup after 2 hours</li>
            <li>🚫 No persistent data storage</li>
            <li>🔐 Authenticated access only</li>
          </ul>
        </div>
      </div>
    </div>
  );
}