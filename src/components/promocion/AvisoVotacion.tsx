"use client";

import { useEffect, useState } from "react";
import { RedesSociales } from "@/components/promocion/RedesSociales";
import { Icono } from "@/components/ui/Icono";
import { URL_VOTACION, votacionAbierta } from "@/lib/promocion";

/**
 * Popup de campania (ADR-055): pide el voto por Vecino Seguro en la plataforma de
 * ETH Lima hasta el 12 de agosto inclusive. Despues de esa fecha no se vuelve a
 * montar (la regla vive en src/lib/promocion.ts, con tests).
 *
 * Se muestra una sola vez por dispositivo: cerrado o votado, queda recordado en
 * localStorage. Nunca debe taparle la demo a nadie en bucle.
 */

const CLAVE = "vecino-seguro:aviso-votacion:v1";

export function AvisoVotacion() {
  const [visible, setVisible] = useState(false);

  // En useEffect a proposito: localStorage no existe en el servidor y leerlo durante
  // el render rompe la hidratacion. El popup aparece un tick despues, y esta bien.
  useEffect(() => {
    if (!votacionAbierta(Date.now())) return;
    try {
      if (window.localStorage.getItem(CLAVE) === "1") return;
    } catch {
      // modo privado sin almacenamiento: se muestra igual, solo que cada vez
    }
    setVisible(true);
  }, []);

  const cerrar = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(CLAVE, "1");
    } catch {
      // sin almacenamiento no hay memoria del cierre; no es grave
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-fondo/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Apoya a Vecino Seguro con tu voto"
      onClick={cerrar}
    >
      <div
        className="tarjeta w-full max-w-sm space-y-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-marca/15 text-marca">
            <Icono nombre="megafono" className="h-5 w-5" />
          </span>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar aviso"
            className="toque grid h-8 w-8 place-items-center rounded-full text-tenue transition hover:text-texto"
          >
            <Icono nombre="cerrar" className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-texto">
            Apoyanos con tu voto
          </h2>
          <p className="text-sm leading-relaxed text-suave">
            Vecino Seguro compite en el Hackathon Ethereum Lima 2026. Tu voto en la
            plataforma oficial nos ayuda a que esta red vecinal siga creciendo.
            La votacion cierra el 12 de agosto.
          </p>
        </div>

        <div className="space-y-2">
          <a
            href={URL_VOTACION}
            target="_blank"
            rel="noreferrer"
            onClick={cerrar}
            className="toque flex items-center justify-center gap-2 rounded-xl bg-marca py-3 text-sm font-semibold text-fondo transition active:scale-[0.99]"
          >
            Votar por Vecino Seguro
            <Icono nombre="enlace" className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={cerrar}
            className="toque w-full rounded-xl border border-borde py-2.5 text-sm font-medium text-suave"
          >
            Ahora no
          </button>
        </div>

        <RedesSociales conTitulo />
      </div>
    </div>
  );
}
