"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp, type ResultadoEscalamiento } from "@/components/proveedores/AppProvider";
import { useUbicacion } from "@/components/proveedores/UbicacionProvider";
import { Icono } from "@/components/ui/Icono";
import { Aviso, Dato, EtiquetaSimulado } from "@/components/ui/primitivos";
import { CATEGORIAS, esIdCategoria, obtenerCategoria } from "@/lib/categorias";
import { TEXTO_ETAPA, type EtapaFlujo, type ResultadoFlujo } from "@/lib/flujo-reporte";
import { abreviarHash, formatearUsd } from "@/lib/formato";
import { formatearCoordenada } from "@/lib/geo";
import { limpiarYComprimirImagen } from "@/lib/imagen";
import type { Coordenada, IdCategoria } from "@/lib/tipos";
import { describirZona, listaDistritos } from "@/lib/zonas";

/**
 * Flujo de reporte en tres pasos (ADR-011).
 *
 * Regla de diseno: nada obligatorio salvo la categoria y la ubicacion. Si alguien
 * esta reportando algo que esta pasando ahora, cada campo obligatorio de mas es
 * una razon para cerrar la app.
 *
 * Las etapas que se muestran mientras se envia son las reales del pipeline
 * (validar, IPFS, hash, anclaje), no una animacion de relleno.
 */

type Paso = "categoria" | "detalle" | "enviando" | "resultado";

/** Punto de respaldo para probar la demo en un escritorio sin GPS. */
const UBICACION_DEMO: Coordenada = { lat: -11.9762, lng: -76.9941 };

export function FlujoReporte() {
  const { enviarReporte, escalar } = useApp();
  const { coordenada: ubicacionCompartida, precisionM: precisionCompartida } = useUbicacion();

  // El panel comunitario de sismos enlaza a /reportar?categoria=sismo_sentido para que
  // "Yo tambien lo senti" sea un solo toque. Se valida contra el catalogo: un parametro
  // inventado en la URL no puede crear una categoria que no existe.
  const parametros = useSearchParams();
  const preseleccion = parametros.get("categoria");
  const categoriaPrevia =
    preseleccion !== null && esIdCategoria(preseleccion) ? preseleccion : null;

  const [paso, setPaso] = useState<Paso>(categoriaPrevia ? "detalle" : "categoria");
  const [categoria, setCategoria] = useState<IdCategoria | null>(categoriaPrevia);
  const [descripcion, setDescripcion] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  /** La foto se esta limpiando y comprimiendo (ADR-056). */
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [coordenada, setCoordenada] = useState<Coordenada | null>(null);
  /** Radio de incertidumbre que reporta el navegador, en metros. */
  const [precisionM, setPrecisionM] = useState<number | null>(null);
  const [zonaManual, setZonaManual] = useState<string | null>(null);
  const [estadoGps, setEstadoGps] = useState<"inactivo" | "buscando" | "listo" | "error">(
    "inactivo",
  );
  const [etapa, setEtapa] = useState<EtapaFlujo>("validando");
  const [resultado, setResultado] = useState<ResultadoFlujo | null>(null);
  const [escalamiento, setEscalamiento] = useState<ResultadoEscalamiento | null>(null);
  /** Que destino se esta enviando, para que solo ESE boton diga "Enviando". */
  const [escalando, setEscalando] = useState<"serenazgo" | "policia" | "ambulancia" | null>(null);

  const inputArchivo = useRef<HTMLInputElement>(null);

  const pedirUbicacion = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setEstadoGps("error");
      return;
    }
    setEstadoGps("buscando");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoordenada({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        // La precision la reporta el navegador. En un telefono con GPS son metros;
        // en una laptop, que se ubica por wifi o IP, pueden ser kilometros — y ahi el
        // distrito detectado no va a ser el correcto por mas fina que sea nuestra lista.
        // Mostrarla es lo que permite al vecino saber si puede confiar en el resultado.
        setPrecisionM(Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null);
        setEstadoGps("listo");
      },
      () => setEstadoGps("error"),
      // maximumAge: 0 evita que el navegador reutilice una posicion vieja y ya invalida.
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    if (paso !== "detalle" || estadoGps !== "inactivo") return;

    // Si el proveedor compartido ya tiene una posicion reciente, se muestra al instante
    // y aun asi se pide una lectura fresca: en una emergencia, esperar al GPS con la
    // pantalla en blanco es justo lo que hace que la gente cierre la app.
    if (ubicacionCompartida) {
      setCoordenada(ubicacionCompartida);
      setPrecisionM(precisionCompartida);
      setEstadoGps("listo");
    }
    pedirUbicacion();
  }, [estadoGps, paso, pedirUbicacion, precisionCompartida, ubicacionCompartida]);

  useEffect(() => {
    if (!archivo) {
      setVistaPrevia(null);
      return;
    }
    const url = URL.createObjectURL(archivo);
    setVistaPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  const reiniciar = () => {
    setPaso("categoria");
    setCategoria(null);
    setDescripcion("");
    setArchivo(null);
    setErrorFoto(null);
    setCoordenada(null);
    setPrecisionM(null);
    setZonaManual(null);
    setEstadoGps("inactivo");
    setResultado(null);
    setEscalamiento(null);
    setEscalando(null);
  };

  const enviar = async () => {
    if (!categoria || !coordenada) return;
    setPaso("enviando");
    setEtapa("validando");

    const res = await enviarReporte(
      { categoria, descripcion, coordenada, archivo, zonaNombreManual: zonaManual },
      setEtapa,
    );

    // Confirmacion fisica: en la calle la persona puede haber bajado el telefono o estar
    // mirando la situacion en vez de la pantalla. Dos pulsos si salio, uno largo si no.
    // navigator.vibrate no existe en iOS Safari; por eso nunca es la unica senal.
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(res.ok ? [40, 60, 40] : 180);
    }

    setResultado(res);
    setPaso("resultado");
  };

  // --- Paso 1: categoria ----------------------------------------------------

  if (paso === "categoria") {
    return (
      <div className="space-y-3 px-4">
        <p className="text-sm text-suave">Que esta pasando?</p>
        {/*
          sismo_sentido ya no se reporta a mano (ADR-042): el sismo llega del IGP y el
          vecino responde la intensidad desde la alarma. El indiceContrato 2 se conserva
          en categorias.ts porque ya esta escrito en cadena y las respuestas de
          intensidad viajaran con esa categoria.
        */}
        {CATEGORIAS.filter((c) => c.id !== "sismo_sentido").map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              // Si lo escrito venia de un chip de la categoria anterior, se limpia: si no,
              // "Robo en curso" acabaria publicado como descripcion de un poste sin luz.
              // Lo que la persona escribio a mano se respeta.
              if (categoria && obtenerCategoria(categoria).sugerencias.includes(descripcion)) {
                setDescripcion("");
              }
              setCategoria(c.id);
              setPaso("detalle");
            }}
            className="tarjeta flex w-full items-start gap-3.5 p-4 text-left transition active:scale-[0.99]"
          >
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
              style={{ backgroundColor: `${c.color}1f`, color: c.color }}
            >
              <Icono nombre={c.icono} className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-texto">{c.nombre}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-suave">
                {c.descripcionCorta}
              </span>
              <span className="mt-1.5 block text-[11px] leading-relaxed text-tenue">
                {c.ejemplos}
              </span>
            </span>
          </button>
        ))}

        <Aviso tono="info" icono="candado">
          Reportas con un alias. Tu identidad real no sale de este dispositivo y no se escribe en
          la cadena.
        </Aviso>
      </div>
    );
  }

  // --- Paso 2: detalle ------------------------------------------------------

  if (paso === "detalle" && categoria) {
    const cat = obtenerCategoria(categoria);
    const listoParaEnviar = coordenada !== null;

    return (
      <div className="space-y-4 px-4">
        <button
          type="button"
          onClick={() => setPaso("categoria")}
          className="toque -ml-1 inline-flex items-center gap-1.5 text-xs text-tenue"
        >
          <Icono nombre="flecha" className="h-3.5 w-3.5 rotate-180" />
          Cambiar categoria
        </button>

        <div
          className="flex items-center gap-3 rounded-xl border p-3"
          style={{ borderColor: `${cat.color}55`, backgroundColor: `${cat.color}12` }}
        >
          <Icono nombre={cat.icono} className="h-5 w-5" />
          <span className="text-sm font-medium">{cat.nombre}</span>
        </div>

        <div>
          <label htmlFor="descripcion" className="etiqueta-seccion mb-1.5 block">
            {categoria === "sismo_sentido" ? "Que tan fuerte lo sentiste" : "Que viste (opcional)"}
          </label>

          {/* Un toque en vez de teclear. En sismos hacen de escala de intensidad. */}
          <div className="mb-2 flex flex-wrap gap-1.5">
            {cat.sugerencias.map((s) => {
              const activa = descripcion === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDescripcion(activa ? "" : s)}
                  aria-pressed={activa}
                  className="toque flex items-center rounded-full border border-borde px-3.5 text-left text-xs leading-tight transition"
                  style={
                    activa
                      ? { borderColor: cat.color, backgroundColor: `${cat.color}1f`, color: cat.color }
                      : undefined
                  }
                >
                  <span className={activa ? "" : "text-suave"}>{s}</span>
                </button>
              );
            })}
          </div>

          <textarea
            id="descripcion"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value.slice(0, 280))}
            rows={3}
            placeholder="Dos personas en moto dando vueltas a la cuadra…"
            className="w-full resize-none rounded-xl border border-borde bg-superficie px-3.5 py-3 text-sm text-texto placeholder:text-tenue focus:border-marca/60 focus:outline-none"
          />
          <p className="mt-1 text-right text-[11px] text-tenue">{descripcion.length}/280</p>
        </div>

        <div>
          <span className="etiqueta-seccion mb-1.5 block">Evidencia (opcional)</span>
          <input
            ref={inputArchivo}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const crudo = e.target.files?.[0] ?? null;
              // Se vacia el input para poder reelegir la misma foto tras un error.
              e.target.value = "";
              if (!crudo) return;

              setErrorFoto(null);
              setProcesandoFoto(true);
              try {
                // El original nunca sigue viaje (ADR-056): lo que se guarda, se
                // previsualiza y se sube es la copia sin EXIF/GPS y comprimida.
                setArchivo(await limpiarYComprimirImagen(crudo));
              } catch {
                setArchivo(null);
                setErrorFoto("No se pudo procesar esa imagen. Intenta con otra foto.");
              } finally {
                setProcesandoFoto(false);
              }
            }}
          />
          {vistaPrevia ? (
            <div className="relative">
              <img
                src={vistaPrevia}
                alt="Vista previa de la evidencia"
                className="w-full rounded-xl border border-borde object-cover"
              />
              <button
                type="button"
                onClick={() => setArchivo(null)}
                aria-label="Quitar foto"
                className="toque absolute right-2 top-2 grid place-items-center rounded-full bg-fondo/85 text-texto"
              >
                <Icono nombre="cerrar" className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={procesandoFoto}
              onClick={() => inputArchivo.current?.click()}
              className="toque flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-borde bg-superficie py-5 text-sm text-suave transition active:scale-[0.99] disabled:opacity-60"
            >
              <Icono nombre="camara" className="h-5 w-5" />
              {procesandoFoto ? "Procesando la foto…" : "Tomar o elegir una foto"}
            </button>
          )}
          {errorFoto ? (
            <p role="alert" className="mt-1.5 text-[11px] leading-relaxed text-alerta">
              {errorFoto}
            </p>
          ) : null}
          <p className="mt-1.5 text-[11px] leading-relaxed text-tenue">
            Antes de subirla, la foto se comprime y se le quitan los metadatos
            (ubicacion GPS y datos del telefono): lo unico que viaja es la imagen.
          </p>
        </div>

        <div>
          <span className="etiqueta-seccion mb-1.5 block">Ubicacion</span>
          <div className="tarjeta p-3.5">
            {estadoGps === "buscando" ? (
              <p className="text-sm text-suave">Buscando tu ubicacion…</p>
            ) : coordenada ? (
              (() => {
                const zona = describirZona(coordenada);
                const etiqueta = zonaManual ?? zona.etiqueta;
                // El navegador se ubica por wifi o IP cuando no hay GPS: ahi el error puede
                // ser de kilometros y ningun catalogo de distritos lo puede arreglar.
                const precisionPobre = precisionM !== null && precisionM > 200;

                return (
                  <>
                    <div className="flex items-center gap-2">
                      <Icono
                        nombre="ubicacion"
                        className={`h-4 w-4 ${zona.confiable && !precisionPobre ? "text-marca" : "text-ambar"}`}
                      />
                      <span className="text-sm text-texto">{etiqueta}</span>
                      {zonaManual ? (
                        <span className="rounded-full bg-superficie-alta px-2 py-0.5 text-[10px] text-tenue">
                          corregido
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 font-mono text-[11px] text-tenue">
                      {formatearCoordenada(coordenada)}
                      {precisionM !== null ? ` · ±${Math.round(precisionM)} m` : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-tenue">
                      Se trunca a ~11 m antes de salir del telefono.
                    </p>

                    {precisionPobre ? (
                      <p className="mt-2 text-[11px] leading-relaxed text-ambar">
                        Tu navegador te ubico con un margen de ±{Math.round(precisionM)} m
                        (probablemente por wifi, no por GPS). El distrito de abajo puede estar
                        mal: revisalo antes de publicar.
                      </p>
                    ) : null}

                    {!zona.confiable && !zonaManual ? (
                      <p className="mt-2 text-[11px] leading-relaxed text-ambar">
                        Estas entre distritos. Lo detectado es una aproximacion.
                      </p>
                    ) : null}

                    <label htmlFor="distrito" className="mt-3 block text-[11px] text-tenue">
                      Distrito (corrigelo si no es el tuyo)
                    </label>
                    <select
                      id="distrito"
                      value={zonaManual ?? zona.distrito ?? ""}
                      onChange={(e) => setZonaManual(e.target.value || null)}
                      className="toque mt-1 w-full rounded-lg border border-borde bg-superficie-alta px-3 text-sm text-texto focus:border-marca/60 focus:outline-none"
                    >
                      <option value="">Sin especificar</option>
                      {listaDistritos().map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </>
                );
              })()
            ) : (
              <div className="space-y-2.5">
                <p className="text-sm text-suave">
                  {estadoGps === "error"
                    ? "No se pudo obtener el GPS (permiso denegado o navegador sin ubicacion)."
                    : "Hace falta la ubicacion para publicar el reporte."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={pedirUbicacion}
                    className="toque rounded-lg border border-borde bg-superficie-alta px-3 py-2 text-xs font-medium text-texto"
                  >
                    Reintentar GPS
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCoordenada(UBICACION_DEMO);
                      setEstadoGps("listo");
                    }}
                    className="toque inline-flex items-center gap-1.5 rounded-lg border border-ambar/40 bg-ambar/10 px-3 py-2 text-xs font-medium text-ambar"
                  >
                    Usar ubicacion de demo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/*
          Pegajoso al fondo: con las sugerencias largas de actividad sospechosa, el paso 2
          pasa de 800 px y el boton quedaba ~200 px por debajo del pliegue, fuera del
          alcance del pulgar. Se ancla por encima de la barra de pestanas.
        */}
        <div className="sticky bottom-[calc(var(--alto-barra)+env(safe-area-inset-bottom,0px)+0.5rem)] z-10 -mx-4 bg-fondo px-4 pb-2 pt-3">
          <button
            type="button"
            disabled={!listoParaEnviar}
            onClick={() => void enviar()}
            className="toque flex w-full items-center justify-center gap-2 rounded-2xl bg-alerta py-4 text-base font-semibold text-white shadow-lg shadow-alerta/20 transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
          >
            <Icono nombre="reportar" className="h-5 w-5" />
            {/* El boton explica por que esta apagado, en vez de quedarse gris y mudo. */}
            {listoParaEnviar
              ? "Publicar reporte"
              : estadoGps === "buscando"
                ? "Buscando tu ubicacion…"
                : "Falta la ubicacion"}
          </button>
        </div>
      </div>
    );
  }

  // --- Paso 3: enviando -----------------------------------------------------

  if (paso === "enviando") {
    const etapas: EtapaFlujo[] = archivo
      ? ["validando", "subiendo_evidencia", "calculando_hash", "anclando"]
      : ["validando", "calculando_hash", "anclando"];
    const indiceActual = etapas.indexOf(etapa);

    return (
      <div className="space-y-4 px-4">
        <p className="text-sm text-suave">Publicando tu reporte…</p>
        {/* Region viva: los cambios de etapa se anuncian a quien usa lector de pantalla. */}
        <ol className="space-y-2.5" role="status" aria-live="polite">
          {etapas.map((e, i) => {
            const hecha = indiceActual > i || etapa === "listo";
            const activa = indiceActual === i && etapa !== "listo";
            return (
              <li key={e} className="flex items-center gap-3">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10px] ${
                    hecha
                      ? "border-marca bg-marca text-fondo"
                      : activa
                        ? "border-marca text-marca"
                        : "border-borde text-tenue"
                  }`}
                >
                  {hecha ? <Icono nombre="check" className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={`text-sm ${activa || hecha ? "text-texto" : "text-tenue"}`}>
                  {TEXTO_ETAPA[e]}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  // --- Paso 4: resultado ----------------------------------------------------

  if (paso === "resultado" && resultado) {
    if (!resultado.ok) {
      // Un fallo de red se puede reintentar; un limite anti-Sybil dura minutos, asi que
      // ahi prometer un reintento seria mentir. Lo que sirve en ambos casos es no perder
      // el borrador: volver al paso 2 conserva foto, texto y ubicacion.
      const esFalloTecnico = resultado.codigo === "error";

      return (
        <div className="space-y-4 px-4 pt-2">
          <div role="alert">
            <Aviso tono="alerta" icono="alerta">
              {resultado.mensaje}
            </Aviso>
          </div>
          {!esFalloTecnico ? (
            <p className="text-xs leading-relaxed text-tenue">
              Este limite es la defensa anti-Sybil del MVP: evita que una sola cuenta inunde la red
              para farmear tokens. Se aplica igual en el contrato, no solo en la app.
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => {
              setResultado(null);
              setPaso("detalle");
              if (esFalloTecnico) void enviar();
            }}
            className="toque w-full rounded-xl bg-marca text-sm font-semibold text-fondo transition active:scale-[0.99]"
          >
            {esFalloTecnico ? "Reintentar" : "Volver a mi reporte"}
          </button>
          <p className="text-center text-[11px] leading-relaxed text-tenue">
            Tu foto y lo que escribiste siguen guardados.
          </p>

          <button
            type="button"
            onClick={reiniciar}
            className="toque w-full rounded-xl border border-borde py-3 text-sm font-medium text-suave"
          >
            Empezar un reporte nuevo
          </button>
        </div>
      );
    }

    const { reporte } = resultado;
    const cat = obtenerCategoria(reporte.categoria);

    return (
      <div className="aparecer space-y-5 px-4 pt-2">
        <div className="flex items-center gap-3 rounded-2xl border border-marca/40 bg-marca/10 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-marca text-fondo">
            <Icono nombre="check" className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-semibold text-texto">Reporte publicado</p>
            <p className="text-xs text-suave">
              La red vecinal de {reporte.zonaNombre} ya lo puede ver.
            </p>
          </div>
        </div>

        {cat.urgente && !escalamiento?.ok ? (
          <section>
            <h2 className="etiqueta-seccion mb-2">Necesitas ayuda ahora?</h2>
            <div className="grid grid-cols-3 gap-2">
              {(["serenazgo", "policia", "ambulancia"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={escalando !== null}
                  onClick={async () => {
                    setEscalando(d);
                    setEscalamiento(await escalar(reporte.id, d));
                    setEscalando(null);
                  }}
                  className="toque rounded-xl border border-alerta/40 bg-alerta/10 px-2 py-3 text-sm font-semibold capitalize text-alerta transition active:scale-[0.98] disabled:opacity-50"
                >
                  {escalando === d ? "Enviando…" : d}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-tenue">
              La red vecinal ya fue avisada. Esto agrega la ruta institucional.
            </p>
          </section>
        ) : null}

        {escalamiento?.ok ? (
          <Aviso tono="info" icono="megafono">
            Aviso escalado con folio <span className="font-mono">{escalamiento.folio}</span>.
          </Aviso>
        ) : null}

        {escalamiento && !escalamiento.ok ? (
          <Aviso tono="alerta" icono="alerta">
            {escalamiento.mensaje}
          </Aviso>
        ) : null}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="etiqueta-seccion">Comprobante</h2>
            {reporte.cadena?.simulado ? <EtiquetaSimulado /> : null}
          </div>
          <div className="tarjeta divide-y divide-borde px-4 py-1">
            <Dato etiqueta="Categoria" valor={cat.nombre} />
            <Dato etiqueta="Hash del reporte" valor={abreviarHash(reporte.contentHash)} mono />
            {reporte.cadena ? (
              <>
                <Dato etiqueta="Transaccion" valor={abreviarHash(reporte.cadena.txHash)} mono />
                <Dato etiqueta="Costo del anclaje" valor={formatearUsd(reporte.cadena.costoGasUsd)} />
              </>
            ) : null}
            {reporte.evidencia ? (
              <Dato etiqueta="Evidencia IPFS" valor={abreviarHash(reporte.evidencia.cid, 5)} mono />
            ) : null}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="etiqueta-seccion">Recompensa</h2>
            <EtiquetaSimulado titulo="Recompensa de demostracion: el token aun no tiene valor real" />
          </div>
          <div className="tarjeta p-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums text-marca">
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


        <div className="flex gap-2">
          <Link
            href="/mapa"
            className="toque flex flex-1 items-center justify-center rounded-xl bg-superficie-alta py-3 text-sm font-medium text-texto"
          >
            Ver en el mapa
          </Link>
          <button
            type="button"
            onClick={reiniciar}
            className="toque flex-1 rounded-xl border border-borde py-3 text-sm font-medium text-suave"
          >
            Otro reporte
          </button>
        </div>
      </div>
    );
  }

  return null;
}
