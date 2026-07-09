import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import Editor from '@monaco-editor/react'
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';

interface CodeEditorProps {
  code: string
  onCodeChange: (newCode: string) => void
  filePath: string
  userId: string
  username: string
  onFileOpen?: (path: string) => void
  availableFiles?: string[]
  collabId: string
}

const CodeEditor = forwardRef(function CodeEditor(props: CodeEditorProps, ref) {
  const editorRef = useRef<any>(null)
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const bindingRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);

  useEffect(() => {
    if (props.filePath && props.userId && props.username && props.collabId) {
      // --- Yjs CRDT Setup ---
      if (providerRef.current) {
        providerRef.current.destroy();
        ydocRef.current?.destroy();
      }
      const ydoc = new Y.Doc();
      ydocRef.current = ydoc;
      // Use collabId+filePath as unique doc name
      const docName = `${props.collabId}:${props.filePath}`;
      // Determine Yjs WebSocket URL: use env var in dev, same host in prod
      const yjsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const yjsHost = import.meta.env.VITE_YJS_URL || `${yjsProtocol}//${window.location.host}/yjs`;
      const provider = new WebsocketProvider(
        yjsHost,
        docName,
        ydoc
      );
      providerRef.current = provider;
      provider.awareness.setLocalStateField('user', {
        name: props.username,
        color: '#'+((1<<24)*Math.random()|0).toString(16),
        userId: props.userId
      });
      // --- IMPORTANT: Initialize Yjs doc with file content if empty ---
      const yText = ydoc.getText('monaco');
      const yTextString = yText && typeof yText.toString === 'function' ? yText.toString() : '';
      console.log('[YJS INIT]', { yText, yTextString, code: props.code });
      if (typeof yTextString === 'string' && props.code && yTextString !== props.code) {
        yText.delete(0, yText.length); // Clear Yjs doc
        yText.insert(0, props.code);   // Insert backend file content
      }
      // --------------------------------------------------------------
      provider.on('status', event => {
        // Optionally show connection status
        // console.log('Yjs status:', event.status);
      });
      // Monaco binding will be set in handleEditorDidMount
    }
    return () => {
      providerRef.current?.destroy();
      ydocRef.current?.destroy();
    };
    // eslint-disable-next-line
  }, [props.filePath, props.userId, props.username, props.collabId, props.code]);

  useImperativeHandle(ref, () => ({
    getCurrentCode: () => {
      if (ydocRef.current) {
        return ydocRef.current.getText('monaco').toString();
      }
      return '';
    }
  }));

  // Broadcast local cursor position via Yjs awareness
  useEffect(() => {
    if (!editorRef.current || !providerRef.current) return;
    const editor = editorRef.current;
    const provider = providerRef.current;

    const updateAwareness = () => {
      const position = editor.getPosition();
      provider.awareness.setLocalStateField('cursor', {
        position,
        name: props.username,
        color: provider.awareness.getLocalState()?.user?.color || '#00f'
      });
    };

    const disposable = editor.onDidChangeCursorPosition(updateAwareness);
    updateAwareness();

    return () => {
      disposable?.dispose();
    };
  }, [props.username]);

  // Render remote users' cursors
  useEffect(() => {
    if (!editorRef.current || !providerRef.current) return;
    const editor = editorRef.current;
    const provider = providerRef.current;
    let decorations: string[] = [];

    const updateDecorations = () => {
      const states = Array.from(provider.awareness.getStates().entries());
      const myClientId = provider.awareness.clientID;
      const newDecorations: any[] = [];

      states.forEach(([clientId, state]: [number, any]) => {
        if (clientId === myClientId) return; // skip self by client ID
        if (!state) return;
        if (state.cursor && (state.user || state.name)) {
          const { position, name, color } = state.cursor;
          if (position) {
            newDecorations.push({
              range: new window.monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
              options: {
                className: 'remote-cursor',
                afterContentClassName: 'remote-cursor-label',
                after: {
                  content: ` ${name || (state.user && state.user.name) || 'User'}`,
                  inlineClassName: 'remote-cursor-label',
                  color: color || (state.user && state.user.color) || '#00f'
                }
              }
            });
          }
        }
      });

      decorations = editor.deltaDecorations(decorations, newDecorations);
      decorationsRef.current = decorations;
    };

    provider.awareness.on('change', updateDecorations);
    return () => {
      provider.awareness.off('change', updateDecorations);
      if (editor && decorations.length) {
        editor.deltaDecorations(decorations, []);
      }
    };
  }, [props.userId]);

  const handleEditorDidMount = (editor: any) => {
    try {
    editorRef.current = editor
    editor.focus()

    // Add import auto-completion
      if (props.availableFiles && props.availableFiles.length > 0) {
        const model = editor.getModel();
        if (model) {
          model.updateOptions({
        tabSize: 2,
        insertSpaces: true
          });
        }
      editor.onMouseDown((e: any) => {
        if (e.event.ctrlKey && e.target.type === 1) { // 1 = text
          const position = e.target.position
            const word = editor.getModel()?.getWordAtPosition(position)
          if (word) {
              const lineContent = editor.getModel()?.getLineContent(position.lineNumber)
              if (lineContent && (lineContent.includes('import') || lineContent.includes('from'))) {
              const importMatch = lineContent.match(/(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_]*)/)
              if (importMatch) {
                const moduleName = importMatch[1]
                  const matchingFile = props.availableFiles.find(file => 
                  file.replace('.py', '') === moduleName || 
                  file.endsWith(`/${moduleName}.py`)
                )
                if (matchingFile) {
                  const filePath = '/user_files/' + matchingFile
                    props.onFileOpen?.(filePath)
                }
              }
            }
          }
        }
      })
    }

    // --- Yjs Monaco Binding ---
    if (ydocRef.current && providerRef.current) {
      const yText = ydocRef.current.getText('monaco');
        if (yText && editor.getModel()) {
      bindingRef.current = new MonacoBinding(
        yText,
        editor.getModel(),
        new Set([editor]),
        providerRef.current.awareness
      );
        }
      }
    } catch (err) {
      console.error('[CodeEditor] handleEditorDidMount error:', err);
    }
  }

  return (
    <Editor
      height="500px"
      language="python"
      onMount={handleEditorDidMount}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        theme: 'vs-dark',
        automaticLayout: true,
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        wordBasedSuggestions: true,
        parameterHints: { enabled: true },
        hover: { enabled: true },
        contextmenu: true,
        folding: true,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        renderLineHighlight: 'all',
        selectOnLineNumbers: true,
        roundedSelection: false,
        readOnly: false,
        cursorStyle: 'line',
        automaticLayout: true,
        scrollbar: {
          vertical: 'visible',
          horizontal: 'visible'
        }
      }}
    />
  )
});

export default CodeEditor;
