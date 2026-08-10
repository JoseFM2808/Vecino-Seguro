import { REDES_SOCIALES } from "@/lib/promocion";

/**
 * Enlaces a las redes del proyecto (ADR-055). Iconos SVG en linea, como el resto
 * (ver Icono.tsx): cero dependencias y cero peticiones extra, la CSP ni se entera.
 */

const ICONOS: Record<(typeof REDES_SOCIALES)[number]["nombre"], React.ReactNode> = {
  LinkedIn: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M8 10.5V17M8 7.5v.01M12 17v-6.5m0 2.3a2.3 2.3 0 0 1 4.6 0V17" />
    </>
  ),
  Instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M16.9 7.1h.01" />
    </>
  ),
};

export function RedesSociales({ conTitulo = false }: { conTitulo?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {conTitulo ? (
        <p className="text-[11px] font-medium uppercase tracking-wide text-tenue">
          Sigue a Vecino Seguro
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        {REDES_SOCIALES.map((red) => (
          <a
            key={red.nombre}
            href={red.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`${red.nombre} de Vecino Seguro (se abre en otra pestana)`}
            className="toque grid h-9 w-9 place-items-center rounded-full border border-borde text-suave transition hover:border-marca/50 hover:text-marca"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4.5 w-4.5"
              aria-hidden
            >
              {ICONOS[red.nombre]}
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
}
