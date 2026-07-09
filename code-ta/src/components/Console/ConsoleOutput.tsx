export default function ConsoleOutput({ lines }: { lines: string[] }) {
  return (
    <div className="output-console">
      {lines.map((line, i) => <pre key={i}>{line}</pre>)}
    </div>
  )
}
