declare module 'pyodide' {
  interface PyodideInterface {
    runPythonAsync(code: string): Promise<void>
    setStdout(options: { batched: (text: string) => void }): void
  }
}

declare function loadPyodide(config: { indexURL: string }): Promise<PyodideInterface>
