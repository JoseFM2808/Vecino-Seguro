"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn } from "next-auth/react";
import { useApp } from "@/components/proveedores/AppProvider";
import { useCirculo } from "@/components/proveedores/CirculoProvider";
import { useGoogleDisponible } from "@/components/proveedores/SesionProvider";
import { RedesSociales } from "@/components/promocion/RedesSociales";
import { Icono, type NombreIcono } from "@/components/ui/Icono";

/**
 * Barra inferior fija.
 *
 * Dos modos (ADR-043):
 *  - Visitante (login configurado, sin sesion): Inicio, Mapa y el boton de Entrar en el
 *    centro. La vitrina publica es la historia y el mapa; el resto pide cuenta.
 *  - Con sesion (o sin login configurado): las seis pestanas de siempre. "Circulo" sigue
 *    exigiendo sesion (ADR-102). Verificado que las seis entran en 360 px sin truncarse;
 *    "Arquitectura" va abreviada por eso.
 *
 * El boton del centro es la accion principal de cada modo: reportar con cuenta,
 * entrar sin ella.
 */

interface Pestana {
  href: string;
  etiqueta: string;
  icono: NombreIcono;
  destacada?: boolean;
  /** Nombre completo para lectores de pantalla cuando la etiqueta va abreviada. */
  nombreAccesible?: string;
  /** Solo se muestra con sesion de Google iniciada (ADR-102). */
  requiereSesion?: boolean;
}

const PESTANAS: readonly Pestana[] = [
  { href: "/", etiqueta: "Inicio", icono: "inicio" },
  { href: "/mapa", etiqueta: "Mapa", icono: "mapa" },
  { href: "/reportar", etiqueta: "Reportar", icono: "reportar", destacada: true },
  { href: "/circulo", etiqueta: "Circulo", icono: "circulo", requiereSesion: true },
  { href: "/cuenta", etiqueta: "Cuenta", icono: "cuenta" },
  // Con seis pestanas "Arquitectura" no entra en 360 px; se abrevia solo en la barra.
  {
    href: "/arquitectura",
    etiqueta: "Arquit.",
    icono: "arquitectura",
    nombreAccesible: "Arquitectura",
  },
];

export function BarraPestanas() {
  const ruta = usePathname();
  const { habilitado: circuloHabilitado } = useCirculo();
  const { cuenta } = useApp();
  const googleDisponible = useGoogleDisponible();

  // Modo visitante (ADR-043): hay login configurado pero nadie ha entrado.
  // Sin credenciales en el despliegue, la barra completa sigue: no hay forma de entrar.
  const visitante = googleDisponible && !cuenta;

  // La vitrina del visitante: historia, mapa y arquitectura (ADR-044 — el escaparate
  // tecnico se queda abierto). Reportar, circulo y cuenta llegan al entrar.
  const RUTAS_VISITANTE = ["/", "/mapa", "/arquitectura"];
  const visibles = visitante
    ? PESTANAS.filter((p) => RUTAS_VISITANTE.includes(p.href))
    : PESTANAS.filter((p) => !p.requiereSesion || circuloHabilitado);

  return (
    <nav
      aria-label="Navegacion principal"
      /*
       * Una sola barra con dos formas (ADR-028): abajo y horizontal en movil, lateral y
       * vertical desde `md`. Se resuelve con clases responsivas y no con JavaScript para
       * que no haya diferencia entre lo que se pinta en el servidor y en el cliente.
       */
      className="fixed inset-x-0 bottom-0 z-50 border-t border-borde bg-superficie/95 backdrop-blur safe-abajo md:inset-y-0 md:right-auto md:w-60 md:border-r md:border-t-0 md:pb-0"
    >
      {/* Solo en escritorio: la barra lateral tiene sitio para la marca. */}
      <div className="hidden items-center gap-2 px-5 pb-2 pt-6 md:flex">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-marca/15 text-marca">
          <Icono nombre="escudo" className="h-5 w-5" />
        </span>
        <span className="text-sm font-semibold tracking-tight text-texto">Vecino Seguro</span>
      </div>

      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1 md:mx-0 md:max-w-none md:flex-col md:items-stretch md:gap-1 md:px-3 md:pt-2">
        {visitante ? (
          // El centro del modo visitante: entrar. Mismo sitio y peso que Reportar,
          // porque es la accion que desbloquea todo lo demas.
          <li className="order-2 flex flex-1 justify-center md:order-none md:flex-none">
            <button
              type="button"
              onClick={() => void signIn("google", { redirectTo: "/reportar" })}
              className="toque -mt-5 flex w-full flex-col items-center gap-1 pb-2 md:mt-2 md:mb-1 md:flex-row md:justify-start md:gap-3 md:rounded-xl md:bg-marca md:px-3 md:pb-0 md:text-fondo"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full border-4 border-fondo bg-marca text-fondo shadow-lg md:h-6 md:w-6 md:border-0 md:bg-transparent md:shadow-none">
                <Icono nombre="cuenta" className="h-6 w-6 md:h-5 md:w-5" />
              </span>
              <span className="text-[10px] font-semibold text-suave md:text-sm md:text-fondo">
                Entrar
              </span>
            </button>
          </li>
        ) : null}
        {visibles.map((pestana, indice) => {
          const activa = ruta === pestana.href;
          // En modo visitante el boton de Entrar (order-2) parte la fila: Inicio queda
          // antes y Mapa y Arquitectura despues, en su orden de siempre. Clases literales
          // a proposito: Tailwind no genera nombres interpolados.
          const ORDEN_VISITANTE = ["order-1", "order-3", "order-4"] as const;
          const orden = visitante ? (ORDEN_VISITANTE[indice] ?? "order-5") : "";

          if (pestana.destacada) {
            return (
              <li key={pestana.href} className="flex flex-1 justify-center md:flex-none">
                <Link
                  href={pestana.href}
                  aria-current={activa ? "page" : undefined}
                  aria-label="Crear reporte"
                  className="toque -mt-5 flex w-full flex-col items-center gap-1 pb-2 md:mt-2 md:mb-1 md:flex-row md:justify-start md:gap-3 md:rounded-xl md:bg-alerta md:px-3 md:pb-0 md:text-white"
                >
                  <span
                    className={`grid h-12 w-12 place-items-center rounded-full border-4 border-fondo shadow-lg transition md:h-6 md:w-6 md:border-0 md:bg-transparent md:shadow-none ${
                      activa ? "bg-marca text-fondo" : "bg-alerta text-white"
                    } md:text-white`}
                  >
                    <Icono nombre={pestana.icono} className="h-6 w-6 md:h-5 md:w-5" />
                  </span>
                  <span className="text-[10px] font-semibold text-suave md:text-sm md:text-white">
                    {pestana.etiqueta}
                  </span>
                </Link>
              </li>
            );
          }

          return (
            <li key={pestana.href} className={`flex flex-1 md:flex-none ${orden}`}>
              <Link
                href={pestana.href}
                aria-current={activa ? "page" : undefined}
                aria-label={pestana.nombreAccesible ?? pestana.etiqueta}
                className={`toque flex w-full flex-col items-center justify-center gap-1 py-2.5 transition md:flex-row md:justify-start md:gap-3 md:rounded-xl md:px-3 md:py-2 ${
                  activa ? "text-marca md:bg-marca/10" : "text-tenue md:hover:bg-superficie-alta"
                }`}
              >
                <Icono nombre={pestana.icono} className="h-5 w-5 shrink-0" />
                <span className="max-w-full truncate px-0.5 text-[10px] font-medium leading-none md:px-0 md:text-sm">
                  {/* En escritorio cabe el nombre completo; la abreviatura es cosa del movil. */}
                  <span className="md:hidden">{pestana.etiqueta}</span>
                  <span className="hidden md:inline">
                    {pestana.nombreAccesible ?? pestana.etiqueta}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Solo escritorio: redes del proyecto al pie de la barra lateral (ADR-055). */}
      <div className="absolute inset-x-0 bottom-5 hidden md:flex md:justify-center">
        <RedesSociales />
      </div>
    </nav>
  );
}
