import { useEffect, useRef, useState, useCallback } from 'react'
import Editor from '@monaco-editor/react'

interface MultiLanguageEditorProps {
  code: string
  language: string
  onCodeChange: (newCode: string) => void
  onSave?: () => void
  onRunCode?: () => void
  onStopExecution?: () => void
  isDirty?: boolean
  onFileOpen?: (path: string) => void
  availableFiles?: string[]
}

export type { MultiLanguageEditorProps };

const getMonacoLanguage = (language: string): string => {
  switch (language.toLowerCase()) {
    case 'python':
      return 'python'
    case 'javascript':
      return 'javascript'
    case 'typescript':
      return 'typescript'
    case 'bash':
      return 'shell'
    case 'html':
      return 'html'
    case 'css':
      return 'css'
    case 'json':
      return 'json'
    case 'markdown':
      return 'markdown'
    case 'sql':
      return 'sql'
    case 'java':
      return 'java'
    case 'cpp':
    case 'c++':
      return 'cpp'
    case 'c':
      return 'c'
    case 'csharp':
    case 'c#':
      return 'csharp'
    case 'php':
      return 'php'
    case 'ruby':
      return 'ruby'
    case 'go':
      return 'go'
    case 'rust':
      return 'rust'
    case 'swift':
      return 'swift'
    case 'kotlin':
      return 'kotlin'
    case 'scala':
      return 'scala'
    case 'r':
      return 'r'
    case 'matlab':
      return 'matlab'
    default:
      return 'plaintext'
  }
}

export default function MultiLanguageEditor({
  code,
  language,
  onCodeChange,
  onSave,
  onRunCode,
  onStopExecution,
  isDirty = false,
  onFileOpen,
  availableFiles = []
}: MultiLanguageEditorProps) {
  const editorRef = useRef<any>(null)
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving'>('idle')

  // Auto-save function - completely silent
  const performAutoSave = useCallback(async () => {
    if (onSave && isDirty) {
      try {
        onSave() // Silent auto-save without any UI feedback
      } catch (error) {
        console.error('Auto-save failed:', error)
      }
    }
  }, [onSave, isDirty])

  // Manual save function for run button - shows saving status
  const performManualSave = useCallback(async () => {
    if (onSave && isDirty) {
      setAutoSaveStatus('saving')
      try {
        onSave()
        setAutoSaveStatus('idle')
      } catch (error) {
        setAutoSaveStatus('idle')
        console.error('Manual save failed:', error)
      }
    }
  }, [onSave, isDirty])

  // Enhanced run code function that saves first
  const handleRunCode = useCallback(async () => {
    if (isDirty && onSave) {
      await performManualSave()
    }
    onRunCode?.()
  }, [isDirty, onSave, performManualSave, onRunCode])

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.focus()
    }
  }, [code])

  // Auto-save effect - triggers 3 seconds after code changes
  useEffect(() => {
    if (isDirty) {
      // Clear existing timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }

      // Set new timeout for auto-save
      autoSaveTimeoutRef.current = setTimeout(() => {
        performAutoSave()
      }, 3000) // 3 seconds delay
    }

    // Cleanup timeout on unmount or when isDirty changes
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [isDirty, performAutoSave])

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor
    editor.focus()

    // Add language-specific features
    if (availableFiles.length > 0) {
      // Register completion provider for imports
      editor.getModel()?.updateOptions({
        tabSize: 2,
        insertSpaces: true
      })

      // Add Ctrl+Click handler for imports (Python specific)
      if (language.toLowerCase() === 'python') {
        editor.onMouseDown((e: any) => {
          if (e.event.ctrlKey && e.target.type === 1) {
            const position = e.target.position
            const word = editor.getModel().getWordAtPosition(position)
            if (word) {
              const lineContent = editor.getModel().getLineContent(position.lineNumber)
              if (lineContent.includes('import') || lineContent.includes('from')) {
                const importMatch = lineContent.match(/(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_]*)/)
                if (importMatch) {
                  const moduleName = importMatch[1]
                  const matchingFile = availableFiles.find(file =>
                    file.replace('.py', '') === moduleName ||
                    file.endsWith(`/${moduleName}.py`)
                  )
                  if (matchingFile) {
                    const filePath = '/user_files/' + matchingFile
                    onFileOpen?.(filePath)
                  }
                }
              }
            }
          }
        })
      }
    }
  }

  const monacoLanguage = getMonacoLanguage(language)

  // Auto-save status indicator
  const getAutoSaveIndicator = () => {
    switch (autoSaveStatus) {
      case 'saving':
        return { text: 'Saving...', color: '#fbbf24' }
      default:
        return isDirty ? { text: 'Unsaved changes', color: '#f87171' } : { text: '', color: '' }
    }
  }

  const autoSaveIndicator = getAutoSaveIndicator()

  return (
    <>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#23272e', padding: '8px 8px', borderBottom: '1px solid #333', zIndex: 2 }}>
          <button
            onClick={handleRunCode}
            style={{ background: '#23272E', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 500, cursor: 'pointer' }}
            title="Run Code (Ctrl+Enter) - Auto-saves before running"
          >
            ▶
          </button>
          <button
            onClick={onSave}
            disabled={!isDirty}
            style={{ background: isDirty ? '#23272E' : '#444', color: '#fff', border: 'none', borderRadius: 4, padding: '1px 6px', fontWeight: 500, cursor: isDirty ? 'pointer' : 'not-allowed' }}
            title="Save File (Ctrl+S)"
          >
            ⛉
          </button>
          <button
            onClick={onStopExecution}
            style={{ background: '#23272E', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 16px', fontWeight: 500, cursor: 'pointer' }}
            title="Stop Execution"
          >
            ■
          </button>
          {autoSaveIndicator.text && (
            <div style={{
              marginLeft: 'auto',
              fontSize: '12px',
              color: autoSaveIndicator.color,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              {autoSaveStatus === 'saving' && (
                <div style={{
                  width: '12px',
                  height: '12px',
                  border: '2px solid transparent',
                  borderTop: '2px solid currentColor',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
              )}
              {autoSaveIndicator.text}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <Editor
            height="100%"
            language={monacoLanguage}
            value={code}
            onChange={(value) => onCodeChange(value || '')}
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
              scrollbar: {
                vertical: 'visible',
                horizontal: 'visible'
              },
              // Language-specific options
              ...(language.toLowerCase() === 'python' && {
                tabSize: 4,
                insertSpaces: true
              }),
              ...(language.toLowerCase() === 'javascript' && {
                tabSize: 2,
                insertSpaces: true
              }),
              ...(language.toLowerCase() === 'typescript' && {
                tabSize: 2,
                insertSpaces: true
              })
            }}
          />
        </div>
      </div>
    </>
  )
} 