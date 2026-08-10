"use client";

import { useState } from "react";
import { useApp } from "@/components/proveedores/AppProvider";
import { AccesoGoogle } from "@/components/cuenta/AccesoGoogle";
import { FirmaDigital } from "@/components/cuenta/FirmaDigital";
import { RevelacionSelectiva } from "@/components/cuenta/RevelacionSelectiva";
import { HojaDetalle } from "@/components/reportes/HojaDetalle";
import { TarjetaReporte } from "@/components/reportes/TarjetaReporte";
import { Icono } from "@/components/ui/Icono";
import { Aviso, Dato, EtiquetaSimulado } from "@/components/ui/primitivos";
import { describirPolitica, POLITICA_RECOMPENSA } from "@/lib/antisybil";
import { obtenerAdaptadorDeCadena } from "@/lib/chain";
import { abreviarDireccion } from "@/lib/identidad";
import type { Reporte } from "@/lib/tipos";

/**
 * Cuenta: quien eres para la red, cuanto llevas ganado, por que reglas, y
 * el mecanismo que protege tu identidad.
 */
export function PanelCuenta() {
  const { identidad, cuenta, misReportes, saldo, saldoPendiente, reiniciarDemo, cargando } =
    useApp();
  const [detalle, setDetalle] = useState<Reporte | null>(null);
  const [reiniciando, setReiniciando] = useState(false);
  const cadena = obtenerAdaptadorDeCadena();

  const manejarReinicio = async () => {
    setReiniciando(true);
    await reiniciarDemo();
    setReiniciando(false);
  };

  return (
    <div className="space-y-6 px-4">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="etiqueta-seccion">Tu identidad en la red</h2>
          {identidad?.simulado ? (
            <EtiquetaSimulado titulo="Wallet local: aun no firma transacciones reales" />
          ) : null}
        </div>
        <div className="tarjeta p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-superficie-alta text-marca">
              <Icono nombre="cuenta" className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold text-texto">
                {identidad?.seudonimo ?? "…"}
              </p>
              <p className="font-mono text-[11px] text-tenue">
                {identidad ? abreviarDireccion(identidad.direccion) : ""}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-suave">
            {cuenta
              ? "Este es tu alias publico y es lo unico que ve la red. Se deriva de tu cuenta, asi que entrar desde otro telefono te devuelve el mismo. Nunca viste una seed phrase."
              : "Este es tu alias publico y es lo unico que ve la red. Nunca viste una seed phrase: la wallet se creo sola en este dispositivo."}
          </p>
        </div>
      </section>

      <AccesoGoogle />

      {/* Firma embebida (ADR-050): solo existe con Privy configurado y cadena real. */}
      <FirmaDigital />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="etiqueta-seccion">Recompensas</h2>
          <EtiquetaSimulado titulo="Recompensas de demostracion: el token aun no tiene valor real" />
        </div>
        <div className="tarjeta p-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-semibold tabular-nums text-marca">{saldo}</p>
              <p className="text-xs text-tenue">{POLITICA_RECOMPENSA.simbolo} disponibles</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-semibold tabular-nums text-suave">{saldoPendiente}</p>
              <p className="text-xs text-tenue">pendientes de corroborar</p>
            </div>
          </div>
          <div className="mt-4 divide-y divide-borde border-t border-borde pt-1">
            <Dato etiqueta="Reportes publicados" valor={misReportes.length} />
            <Dato
              etiqueta="Saldo en cadena"
              valor={cadena.simulado ? "pendiente de TokenReward.sol" : `${saldo} VSG`}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-tenue">
            Estas recompensas son una simulacion: la aplicacion aun esta en demo y el token
            todavia no tiene valor real.
          </p>
        </div>
      </section>

      <section>
        <h2 className="etiqueta-seccion mb-2">Por que ese monto</h2>
        <ul className="tarjeta space-y-2 p-4">
          {describirPolitica().map((linea) => (
            <li key={linea} className="flex gap-2 text-xs leading-relaxed text-suave">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-tenue" />
              {linea}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-relaxed text-tenue">
          Estas reglas viven en <span className="font-mono">src/lib/antisybil.ts</span> con tests, y
          son la especificacion que el equipo porta a TokenReward.sol. El limite conocido: un
          adversario con varios dispositivos todavia puede farmear.
        </p>
      </section>

      <RevelacionSelectiva />

      <section>
        <h2 className="etiqueta-seccion mb-2">Tus reportes ({misReportes.length})</h2>
        {cargando ? (
          <p className="py-6 text-center text-sm text-tenue">Cargando…</p>
        ) : misReportes.length === 0 ? (
          <Aviso tono="info" icono="reportar">
            Todavia no has publicado nada. Tu primer reporte genera tu primer comprobante en cadena.
          </Aviso>
        ) : (
          <div className="space-y-2">
            {misReportes.map((r) => (
              <TarjetaReporte key={r.id} reporte={r} onClick={() => setDetalle(r)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="etiqueta-seccion mb-2">Demo</h2>
        <button
          type="button"
          onClick={() => void manejarReinicio()}
          disabled={reiniciando}
          className="toque w-full rounded-xl border border-borde bg-superficie-alta py-3 text-sm font-medium text-suave disabled:opacity-50"
        >
          {reiniciando ? "Reiniciando…" : "Reiniciar datos de demostracion"}
        </button>
        <p className="mt-2 text-[11px] leading-relaxed text-tenue">
          Borra los reportes de este dispositivo y vuelve a sembrar la red de ejemplo. Util antes de
          presentar.
        </p>
      </section>

      {detalle ? <HojaDetalle reporte={detalle} onCerrar={() => setDetalle(null)} /> : null}
    </div>
  );
}
