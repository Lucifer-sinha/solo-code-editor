import { DiffEditor } from '@monaco-editor/react'

interface Props {
  original: string
  modified: string
  explanation?: string
  onApply: () => void
  onEdit: (newCode: string) => void
  onDiscard: () => void
}

export default function CodeDiffEditor({ 
  explanation, 
  original, 
  modified, 
  onApply, 
  onEdit, 
  onDiscard 
}: Props) {
  return (
    <div className="diff-container">
      {explanation && (
        <div className="explanation">
          <h4>Explanation</h4>
          <pre>{explanation}</pre>
        </div>
      )}
      <div className="diff-editor">
        <DiffEditor
          height="500px"
          original={original}
          modified={modified}
          language="python"
          options={{ readOnly: false }}
          onMount={(editor) => {
            editor.onDidUpdateDiff(() => {
              const modified = editor.getModifiedEditor().getValue()
              onEdit(modified)
            })
          }}
        />
        <div className="diff-controls">
          <button onClick={onApply}>Apply Fix</button>
          <button onClick={onDiscard}>Discard</button>
        </div>
      </div>
    </div>
  )
}
