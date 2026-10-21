/** O nome da academia como marca, como o logotipo da referência: "Duk" e "Fit" no acento, peso médio. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`text-2xl font-semibold tracking-tight text-primary${className ? ` ${className}` : ''}`} data-slot="wordmark">
      Duk<span>Fit</span>
    </span>
  );
}
