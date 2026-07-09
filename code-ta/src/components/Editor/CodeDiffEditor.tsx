import Editor from '@monaco-editor/react'

export default function CodeDiffEditor({ original, modified }: {
  original: string
  modified: string
}) {
  return (
    <div className="diff-editor">
      <Editor
        height="500px"
        original={original}
        modified={modified}
        language="python"
        options={{
          readOnly: true,
          renderSideBySide: true,
          enableSplitViewResizing: false
        }}
      />
    </div>
  )
}
