/** O nome da academia como marca: "Duk" no texto, "Fit" no acento, Manrope 800 (dukfit-app, AC 1). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`text-2xl font-extrabold tracking-tight${className ? ` ${className}` : ''}`} data-slot="wordmark">
      Duk<span className="text-primary">Fit</span>
    </span>
  );
}
