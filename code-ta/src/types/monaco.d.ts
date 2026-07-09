declare module 'monaco-editor' {
  export interface IStandaloneCodeEditor {
    getValue(): string
    setValue(newValue: string): void
    onDidChangeModelContent(listener: () => void): void
    dispose(): void
  }
}
