import { useRef, useState } from 'react'

type Props = {
  onFile: (file: File) => void
  onSample: () => void
}

export function ImportZone({ onFile, onSample }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const accept = (file: File | null | undefined) => {
    if (!file) return
    onFile(file)
  }

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          accept(e.dataTransfer.files[0])
        }}
        className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          dragging
            ? 'border-emerald-500/60 bg-emerald-500/5'
            : 'border-zinc-800 bg-zinc-900/40'
        }`}
      >
        <div className="text-zinc-300">Drop your Apple Health export here</div>
        <div className="mt-1 text-xs text-zinc-500">export.xml — typically 50–500 MB</div>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            type="button"
            className="rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
            onClick={() => inputRef.current?.click()}
          >
            Choose file
          </button>
          <button
            type="button"
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/20"
            onClick={onSample}
          >
            Try with sample data
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xml,application/xml,text/xml"
          className="hidden"
          onChange={(e) => accept(e.target.files?.[0])}
        />
      </div>

      <details className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
        <summary className="cursor-pointer text-zinc-300">
          How to get your Apple Health export
        </summary>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-zinc-400">
          <li>On iPhone, open the Health app.</li>
          <li>Tap your profile photo (top right).</li>
          <li>Scroll down and tap "Export All Health Data".</li>
          <li>AirDrop or email the zip to your computer.</li>
          <li>Unzip — drop the export.xml here.</li>
        </ol>
        <p className="mt-3 text-xs text-zinc-500">
          Parsing happens entirely in this browser tab. The file never leaves your
          device.
        </p>
      </details>

      <p className="text-center text-xs text-zinc-500">
        Exploratory training signal, not medical advice.
      </p>
    </div>
  )
}
