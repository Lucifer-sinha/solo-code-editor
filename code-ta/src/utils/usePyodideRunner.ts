import { useEffect, useState } from 'react'
import { getApiUrl } from '../config/api'

declare global {
  interface Window {
    loadPyodide: any
  }
}

export const usePyodideRunner = () => {
  const [output, setOutput] = useState<string[]>([])
  const [pyodide, setPyodide] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')

  useEffect(() => {
    const loadPyodide = async () => {
      if (!window.loadPyodide) {
        setOutput(prev => [...prev, 'Error: Pyodide not loaded! Check CDN script'])
        return
      }
      
      try {
        const pyodide = await window.loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/'
        })
        setPyodide(pyodide)
        setLoading(false)
        setOutput(prev => [...prev, 'Pyodide initialized successfully!'])
      } catch (e) {
        setOutput(prev => [...prev, `Pyodide load error: ${e}`])
      }
    }

    loadPyodide()
  }, [])

  // Load all Python files from backend into Pyodide
  const loadPythonFiles = async () => {
    if (!pyodide) return
    
    try {
      // Get list of all files
      const response = await fetch(getApiUrl('fs/list'))
      if (!response.ok) return
      
      const fileTree = await response.json()
      
      // Recursively find all Python files
      const findPythonFiles = (node: any, parentPath = ''): string[] => {
        const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name
        let files: string[] = []
        
        if (node.type === 'file' && node.name.endsWith('.py')) {
          files.push(currentPath)
        } else if (node.type === 'directory' && node.children) {
          node.children.forEach((child: any) => {
            files = files.concat(findPythonFiles(child, currentPath))
          })
        }
        
        return files
      }
      
      const pythonFiles = findPythonFiles(fileTree)
      
      // Load each Python file into Pyodide
      for (const filePath of pythonFiles) {
        try {
          const fileResponse = await fetch(getApiUrl(`fs/file?path=${encodeURIComponent(filePath)}`))
          if (fileResponse.ok) {
            const fileData = await fileResponse.json()
            
            // Skip empty files
            if (!fileData.content || fileData.content.trim() === '') {
              setOutput(prev => [...prev, `⚠ Skipping empty file: ${filePath}`])
              continue
            }
            
            // Write file directly to root of Pyodide FS (no subdirectories for now)
            const fileName = filePath.split('/').pop() || filePath
            
            setOutput(prev => [...prev, `Writing file from backend: ${fileName}`])
            
            try {
              pyodide.FS.writeFile(fileName, fileData.content)
              setOutput(prev => [...prev, `✓ Wrote file: ${fileName} (${fileData.content.length} chars)`])
              
              // Verify file was written
              try {
                const writtenContent = pyodide.FS.readFile(fileName, { encoding: 'utf8' })
                setOutput(prev => [...prev, `✓ Verified file ${fileName} exists`])
              } catch (e) {
                setOutput(prev => [...prev, `✗ File verification failed for ${fileName}: ${e}`])
              }
            } catch (writeError) {
              setOutput(prev => [...prev, `✗ Write error for ${fileName}: ${writeError}`])
            }
          } else {
            setOutput(prev => [...prev, `✗ Failed to fetch file: ${filePath} (${fileResponse.status})`])
          }
        } catch (e) {
          setOutput(prev => [...prev, `✗ Failed to write file: ${filePath}: ${e}`])
        }
      }
    } catch (e) {
      console.error('Failed to load Python files:', e)
    }
  }

  const runCode = async (newCode: string) => {
    setCode(newCode)
    if (!pyodide || loading) return
    
    try {
      setOutput(prev => [...prev, '>>> Running code...'])

      // Load Python files from backend into Pyodide FS
      try {
        const response = await fetch(getApiUrl('fs/list'))
        if (response.ok) {
          const fileTree = await response.json()

          // Find all Python files
          const findPythonFiles = (node: any, parentPath = ''): string[] => {
            const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name
            let files: string[] = []
            if (node.type === 'file' && node.name.endsWith('.py')) {
              files.push(currentPath)
            } else if (node.type === 'directory' && node.children) {
              node.children.forEach((child: any) => {
                files = files.concat(findPythonFiles(child, currentPath))
              })
            }
            return files
          }

          const pythonFiles = findPythonFiles(fileTree)
          setOutput(prev => [...prev, `Found ${pythonFiles.length} Python files to load`])

          // Write each Python file into Pyodide FS
          for (const filePath of pythonFiles) {
            try {
              const fileResponse = await fetch(getApiUrl(`fs/file?path=${encodeURIComponent(filePath)}`))
              if (fileResponse.ok) {
                const fileData = await fileResponse.json()
                
                // Skip empty files
                if (!fileData.content || fileData.content.trim() === '') {
                  setOutput(prev => [...prev, `⚠ Skipping empty file: ${filePath}`])
                  continue
                }
                
                // Write file directly to root of Pyodide FS (no subdirectories for now)
                const fileName = filePath.split('/').pop() || filePath
                
                setOutput(prev => [...prev, `Writing file from backend: ${fileName}`])
                
                try {
                  pyodide.FS.writeFile(fileName, fileData.content)
                  setOutput(prev => [...prev, `✓ Wrote file: ${fileName} (${fileData.content.length} chars)`])
                  
                  // Verify file was written
                  try {
                    const writtenContent = pyodide.FS.readFile(fileName, { encoding: 'utf8' })
                    setOutput(prev => [...prev, `✓ Verified file ${fileName} exists`])
                  } catch (e) {
                    setOutput(prev => [...prev, `✗ File verification failed for ${fileName}: ${e}`])
                  }
                } catch (writeError) {
                  setOutput(prev => [...prev, `✗ Write error for ${fileName}: ${writeError}`])
                }
              } else {
                setOutput(prev => [...prev, `✗ Failed to fetch file: ${filePath} (${fileResponse.status})`])
              }
            } catch (e) {
              setOutput(prev => [...prev, `✗ Failed to write file: ${filePath}: ${e}`])
            }
          }
          
          // Set Python path to include current directory
          await pyodide.runPythonAsync(`
import sys
sys.path.insert(0, '.')
print("Python path set to include current directory")
`)

          // Debug: List files in Pyodide FS
          try {
            const files = pyodide.FS.readdir('.')
            setOutput(prev => [...prev, `Files in Pyodide FS: ${files.join(', ')}`])
          } catch (e) {
            setOutput(prev => [...prev, `Error listing files: ${e}`])
          }
          
          // Test: Write a simple file directly
          try {
            pyodide.FS.writeFile('test_direct.py', 'print("Direct file test")\ndef test_func():\n    return "Hello from direct file"')
            setOutput(prev => [...prev, `✓ Wrote test file directly`])
            
            const testFiles = pyodide.FS.readdir('.')
            setOutput(prev => [...prev, `Files after direct write: ${testFiles.join(', ')}`])
          } catch (e) {
            setOutput(prev => [...prev, `✗ Direct write test failed: ${e}`])
          }
        }
      } catch (e) {
        setOutput(prev => [...prev, `Failed to load Python files: ${e}`])
      }

      pyodide.setStdout({
        batched: (text: string) => {
          setOutput(prev => [...prev, ...text.split('\n').filter(l => l)])
        }
      })
      await pyodide.runPythonAsync(newCode)
    } catch (e: any) {
      setOutput(prev => [...prev, `Error: ${e.message}`])
    }
  }

  const handleEditorChange = (value: string | undefined) => {
    console.log('Editor code updated:', value)
    setCode(value || '')
  }

  return {
    code,
    output,
    runCode,
    isLoading: loading,
    handleEditorChange
  }
}
