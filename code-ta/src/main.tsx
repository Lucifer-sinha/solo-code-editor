import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/main.css'
import './index.css';
import App from './App'
import * as monaco from 'monaco-editor';

// Configure Monaco Editor workers manually
// This is crucial for fixing the "Cannot use import statement outside a module" errors
// and loading web workers correctly when not using vite-plugin-monaco-editor
(self as any).MonacoEnvironment = {
  getWorkerUrl: function (_moduleId: string, label: string) {
    if (label === 'json') {
      return new URL('./monaco/json.worker.js', import.meta.url).toString();
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new URL('./monaco/css.worker.js', import.meta.url).toString();
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new URL('./monaco/html.worker.js', import.meta.url).toString();
    }
    if (label === 'typescript' || label === 'javascript') {
      return new URL('./monaco/ts.worker.js', import.meta.url).toString();
    }
    return new URL('./monaco/editor.worker.js', import.meta.url).toString();
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  // <React.StrictMode>
  <App />
  // </React.StrictMode>
)
