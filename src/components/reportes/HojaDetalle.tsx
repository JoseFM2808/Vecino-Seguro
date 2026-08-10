"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/proveedores/AppProvider";
import { Icono } from "@/components/ui/Icono";
import { Aviso, Dato, EtiquetaSimulado } from "@/components/ui/primitivos";
import { POLITICA_RECOMPENSA } from "@/lib/antisybil";
import { obtenerCategoria } from "@/lib/categorias";
import { abreviarHash, formatearBytes, formatearUsd, tiempoRelativo } from "@/lib/formato";
import { formatearCoordenada } from "@/lib/geo";
import type { DestinoEscalamiento, Reporte } from "@/lib/tipos";

/**
 * Detalle de un reporte: que paso, que quedo en cadena, cuanto pago y como escalar.
 *
 * La seccion "Prueba en cadena" es deliberadamente explicita — es la diferencia
 * entre este producto y un grupo de WhatsApp, y el jurado tiene que poder verla.
 */

const DESTINOS: { id: DestinoEscalamiento; etiqueta: string }[] = [
  { id: "serenazgo", etiqueta: "Serenazgo" },
  { id: "policia", etiqueta: "Policia" },
  { id: "ambulancia", etiqueta: "Ambulancia" },
];

export function HojaDetalle({ reporte, onCerrar }: { reporte: Reporte; onCerrar: () => void }) {
  const { identidad, corroborar, escalar } = useApp();
  /** Que destino se esta enviando, para que solo ESE boton lo diga. */
  const [escalando, setEscalando] = useState<DestinoEscalamiento | null>(null);
  const [errorEscalamiento, setErrorEscalamiento] = useState<string | null>(null);
  /** Motivo por el que se rechazo la ultima corroboracion, para decirlo en pantalla. */
  const [rechazoCorroboracion, setRechazoCorroboracion] = useState<string | null>(null);
  const categoria = obtenerCategoria(reporte.categoria);

  const esMio =
    identidad !== null &&
    identidad.direccion.toLowerCase() === reporte.autorDireccion.toLowerCase();
  const yaCorrobore =
    identidad !== null &&
    reporte.corroboraciones.some((d) => d.toLowerCase() === identidad.direccion.toLowerCase());

  // onCerrar llega como arrow nueva en cada render de quien la monta, asi que se guarda
  // en un ref para que el listener no se vuelva a suscribir en cada render.
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrarRef.current();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, []);

  const manejarEscalar = async (destino: DestinoEscalamiento) => {
    setEscalando(destino);
    setErrorEscalamiento(null);
    const resultado = await escalar(reporte.id, destino);
    setEscalando(null);
    // Si falla, se dice. Un boton que se queda mudo hace pensar que el aviso salio.
    if (!resultado.ok) setErrorEscalamiento(resultado.mensaje);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Detalle del reporte"
      onClick={onCerrar}
    >
      <div
        className="subir-hoja max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl border-t border-borde bg-superficie pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-borde bg-superficie px-4 pb-3 pt-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
              style={{ backgroundColor: `${categoria.color}1f`, color: categoria.color }}
            >
              <Icono nombre={categoria.icono} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-texto">{categoria.nombre}</p>
              <p className="truncate text-xs text-tenue">
                {reporte.zonaNombre} · {tiempoRelativo(reporte.creadoEn)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="toque -mr-2 -mt-1 grid place-items-center rounded-full text-tenue"
          >
            <Icono nombre="cerrar" className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-4 pt-4">
          <p className="text-sm leading-relaxed text-texto">{reporte.descripcion}</p>

          {reporte.evidencia?.miniatura ? (
            <img
              src={reporte.evidencia.miniatura}
              alt="Evidencia del reporte"
              className="w-full rounded-xl border border-borde object-cover"
            />
          ) : null}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="etiqueta-seccion">Prueba en cadena</h3>
              {reporte.cadena?.simulado ? <EtiquetaSimulado /> : null}
            </div>
            <div className="tarjeta divide-y divide-borde px-4 py-1">
              <Dato etiqueta="Hash del reporte" valor={abreviarHash(reporte.contentHash)} mono />
              {reporte.cadena ? (
                <>
                  <Dato etiqueta="Transaccion" valor={abreviarHash(reporte.cadena.txHash)} mono />
                  <Dato
                    etiqueta="Bloque"
                    valor={reporte.cadena.bloque.toLocaleString("es-PE")}
                    mono
                  />
                  <Dato etiqueta="Costo del anclaje" valor={formatearUsd(reporte.cadena.costoGasUsd)} />
                </>
              ) : null}
              <Dato etiqueta="Coordenada (truncada)" valor={formatearCoordenada(reporte.coordenada)} mono />
              {reporte.evidencia ? (
                <Dato
                  etiqueta="Evidencia IPFS"
                  valor={`${abreviarHash(reporte.evidencia.cid, 5)} · ${formatearBytes(reporte.evidencia.bytes)}`}
                  mono
                />
              ) : null}
            </div>
            {reporte.cadena ? (
              <a
                href={reporte.cadena.urlExplorador}
                target="_blank"
                rel="noreferrer noopener"
                className="toque mt-2 inline-flex items-center gap-1.5 text-xs text-info"
              >
                Ver en el explorador
                <Icono nombre="enlace" className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="etiqueta-seccion">Recompensa</h3>
              <EtiquetaSimulado titulo="Recompensa de demostracion: el token aun no tiene valor real" />
            </div>
            <div className="tarjeta p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums text-marca">
                  {reporte.recompensa.monto}
                </span>
                <span className="text-sm text-suave">{reporte.recompensa.simbolo}</span>
                {reporte.recompensa.multiplicador > 1 ? (
                  <span className="rounded-full bg-marca/12 px-2 py-0.5 text-[10px] font-semibold text-marca">
                    x{reporte.recompensa.multiplicador}
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-suave">{reporte.recompensa.motivo}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-tenue">
                Esta recompensa es una simulacion: la aplicacion aun esta en demo y el token
                todavia no tiene valor real.
              </p>
            </div>
          </section>

          <section>
            <h3 className="etiqueta-seccion mb-2">
              Corroboracion ({reporte.corroboraciones.length})
            </h3>
            {esMio ? (
              <p className="text-xs text-tenue">
                Es tu reporte. La corroboracion tiene que venir de otro vecino.
              </p>
            ) : yaCorrobore ? (
              <Aviso tono="exito" icono="check">
                Ya confirmaste este reporte.
              </Aviso>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const veredicto = corroborar(reporte.id);
                    // Solo se guarda el rechazo: si sale bien, el reporte cambia y la
                    // rama de "ya confirmaste" toma el relevo sola.
                    setRechazoCorroboracion(veredicto.permitido ? null : veredicto.mensaje);
                  }}
                  className="toque flex w-full items-center justify-center gap-2 rounded-xl border border-marca/40 bg-marca/10 py-3 text-sm font-semibold text-marca transition active:scale-[0.99]"
                >
                  <Icono nombre="check" className="h-4 w-4" />
                  Yo tambien lo vi
                </button>

                {rechazoCorroboracion ? (
                  <div className="mt-2">
                    <Aviso tono="alerta" icono="ubicacion">
                      {rechazoCorroboracion}
                    </Aviso>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] leading-relaxed text-tenue">
                    Solo puede confirmar quien este a menos de {POLITICA_RECOMPENSA.radioCorroboracionM} m
                    del hecho. Es la prueba de presencia que sostiene la recompensa (ADR-041).
                  </p>
                )}
              </>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="etiqueta-seccion">Escalar a la autoridad</h3>
              {reporte.escalamiento?.simulado ? <EtiquetaSimulado /> : null}
            </div>

            {reporte.escalamiento ? (
              <Aviso tono="info" icono="megafono">
                Folio <span className="font-mono">{reporte.escalamiento.folio}</span> ·{" "}
                {reporte.escalamiento.mensaje}
              </Aviso>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {DESTINOS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      disabled={escalando !== null}
                      onClick={() => void manejarEscalar(d.id)}
                      className="toque rounded-xl border border-alerta/40 bg-alerta/10 px-2 py-3 text-sm font-semibold text-alerta transition active:scale-[0.98] disabled:opacity-50"
                    >
                      {escalando === d.id ? "Enviando…" : d.etiqueta}
                    </button>
                  ))}
                </div>
                {errorEscalamiento ? (
                  <div className="mt-2">
                    <Aviso tono="alerta" icono="alerta">
                      {errorEscalamiento}
                    </Aviso>
                  </div>
                ) : null}
                <p className="mt-2 text-[11px] leading-relaxed text-tenue">
                  Se envia hash, categoria, zona y coordenada truncada. Nunca tu identidad.
                </p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
