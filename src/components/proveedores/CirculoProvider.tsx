"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useApp } from "@/components/proveedores/AppProvider";
import { useGoogleDisponible } from "@/components/proveedores/SesionProvider";
import { useUbicacion } from "@/components/proveedores/UbicacionProvider";
import { obtenerCategoria } from "@/lib/categorias";
import { CONFIG } from "@/lib/config";
import {
  RADIO_AVISO_POR_DEFECTO_M,
  evaluarAvisos,
  type AvisoCercania,
  type ContactoCirculo,
} from "@/lib/circulo";
import { cifrarSobre, descifrarSobre, generarClave, generarVinculoId } from "@/lib/circulo-cifrado";
import {
  BASES_DEMO,
  cargarAvisados,
  cargarContactos,
  cargarOtorgamientos,
  contactosSembrados,
  guardarAvisados,
  guardarContactos,
  guardarOtorgamientos,
  limpiarCirculo,
} from "@/lib/circulo-repositorio";
import {
  INTERVALO_SIMULACION_MS,
  moverContactos,
  posicionSimulada,
  semillaDeTexto,
} from "@/lib/circulo-simulacion";
import { borrarSobre, leerSobre, publicarSobre } from "@/lib/circulo-transporte";
import {
  duracionPorId,
  enlaceDeInvitacion,
  esPosicionCompartida,
  vigenciaDe,
  type InvitacionCirculo,
  type OtorgamientoCirculo,
  type PosicionCompartida,
} from "@/lib/circulo-vinculos";
import type { Coordenada } from "@/lib/tipos";

/**
 * Estado del circulo de cuidado (ADR-101).
 *
 * Cada 20 segundos mueve a los contactos que estan compartiendo y vuelve a evaluar si
 * algun reporte reciente cayo cerca de alguno. Los avisos no se repiten: la clave
 * contacto+reporte se recuerda entre recargas.
 *
 * REQUIERE SESION (ADR-102). A diferencia del resto de la app, el circulo solo funciona
 * con la cuenta de Google iniciada. La razon no es tecnica: aqui se guardan los telefonos
 * de tu familia y las posiciones que te comparten, que es el dato mas sensible que maneja
 * el producto. Atarlo a una cuenta es lo que permite revocarlo y no dejarlo suelto en un
 * telefono prestado. Sin sesion no se cargan contactos, no corre el latido y no se emite
 * ningun aviso.
 */

export type PermisoNotificacion = NotificationPermission | "no_soportado";

/**
 * Salud del canal de sobres, vista desde quien comparte (ADR-046):
 *  - "ok": las publicaciones llegan y el canal persiste entre instancias.
 *  - "efimero": llegan, pero a memoria de un solo proceso (Vercel sin KV) — entre
 *    telefonos distintos los sobres pueden no encontrarse.
 *  - "fallando": las publicaciones estan fallando; el contacto vera "sin senal".
 */
export type EstadoCanal = "ok" | "efimero" | "fallando";

export interface NuevoContacto {
  nombre: string;
  telefono: string;
  relacion: string;
  radioAvisoM: number;
}

interface EstadoCirculo {
  /** Hay sesion de Google iniciada. Sin esto el circulo no existe (ADR-102). */
  habilitado: boolean;
  contactos: ContactoCirculo[];
  avisos: AvisoCercania[];
  permiso: PermisoNotificacion;
  listo: boolean;
  /** Con quien compartes TU ubicacion (ADR-046). */
  otorgamientos: OtorgamientoCirculo[];
  /** Salud del canal de sobres, para no fingir que se comparte cuando no llega. */
  estadoCanal: EstadoCanal;
  agregarContacto: (datos: NuevoContacto) => void;
  eliminarContacto: (id: string) => void;
  alternarCompartir: (id: string) => void;
  cambiarRadio: (id: string, radioM: number) => void;
  descartarAviso: (clave: string) => void;
  solicitarPermiso: () => Promise<void>;
  reiniciarCirculo: () => void;
  /**
   * Crea el vinculo del lado de quien quiere VER (ADR-046): genera id y clave, agrega el
   * contacto en estado "esperando" y devuelve la invitacion lista para QR o enlace.
   */
  crearInvitacion: (datos: NuevoContacto) => Promise<{ invitacion: InvitacionCirculo; enlace: string }>;
  /** Acepta una invitacion leida de un QR o enlace: desde ahora TU compartes con esa persona. */
  aceptarInvitacion: (invitacion: InvitacionCirculo, duracionId: string) => void;
  /** Corta el compartir de inmediato, sin esperar el plazo. Decision unilateral de quien comparte. */
  revocarOtorgamiento: (vinculoId: string) => void;
}

const Contexto = createContext<EstadoCirculo | null>(null);

/** Punto de partida para un contacto nuevo: alrededor del centro de Lima. */
const CENTRO_LIMA: Coordenada = { lat: -12.05, lng: -77.03 };

function permisoActual(): PermisoNotificacion {
  if (typeof window === "undefined" || !("Notification" in window)) return "no_soportado";
  return Notification.permission;
}

export function CirculoProvider({ children }: { children: ReactNode }) {
  const { reportes, cuenta, identidad } = useApp();
  const { coordenada: miPosicion, precisionM } = useUbicacion();
  const googleDisponible = useGoogleDisponible();
  // La misma valvula que la puerta y el canal (ADR-035/046): sin login configurado no
  // puede existir sesion, y exigirla dejaria el circulo muerto en local y en despliegues
  // sin variables. Con login configurado, la cuenta sigue siendo obligatoria (ADR-102).
  const habilitado = cuenta !== null || !googleDisponible;

  const [contactos, setContactos] = useState<ContactoCirculo[]>([]);
  const [avisos, setAvisos] = useState<AvisoCercania[]>([]);
  const [permiso, setPermiso] = useState<PermisoNotificacion>("default");
  const [listo, setListo] = useState(false);
  const [otorgamientos, setOtorgamientos] = useState<OtorgamientoCirculo[]>([]);
  const [estadoCanal, setEstadoCanal] = useState<EstadoCanal>("ok");

  /** Punto alrededor del cual vagabundea cada contacto. No se persiste: se recalcula. */
  const bases = useRef<Map<string, Coordenada>>(new Map());
  const avisados = useRef<Set<string>>(new Set());

  const registrarBase = useCallback((id: string, base: Coordenada) => {
    bases.current.set(id, base);
  }, []);

  // Arranque: contactos guardados o los sembrados de demo. Solo con sesion iniciada.
  useEffect(() => {
    if (!habilitado) {
      setContactos([]);
      setAvisos([]);
      setListo(false);
      return;
    }

    const ahora = Date.now();
    const guardados = cargarContactos();
    // Sin datos de demo (ADR-040) el circulo arranca vacio: los contactos los agrega
    // la persona. En una prueba real, contactos inventados solo confunden los avisos.
    // Los contactos de demo que quedaron persistidos de una version anterior se
    // purgan aqui (ADR-054), igual que las semillas de reportes.
    const depurados =
      guardados && !CONFIG.datosDemo ? guardados.filter((c) => c.origen !== "demo") : guardados;
    const iniciales = depurados ?? (CONFIG.datosDemo ? contactosSembrados(ahora) : []);

    if (CONFIG.datosDemo) {
      for (const { id, base } of BASES_DEMO) registrarBase(id, base);
    }
    // Un contacto agregado a mano conserva su ultima posicion como punto base.
    for (const c of iniciales) {
      if (!bases.current.has(c.id) && c.coordenada) registrarBase(c.id, c.coordenada);
    }

    avisados.current = cargarAvisados();
    setContactos(iniciales);
    setOtorgamientos(cargarOtorgamientos());
    setPermiso(permisoActual());
    setListo(true);
    if (!guardados) guardarContactos(iniciales);
    else if (depurados && depurados.length !== guardados.length) guardarContactos(depurados);
  }, [habilitado, registrarBase]);

  // Latido simulado: SOLO mueve a los contactos de demo (ADR-046). A una persona real
  // no se le inventa movimiento — su posicion llega cifrada por el canal o no llega.
  useEffect(() => {
    if (!listo || !habilitado) return;

    const latir = () => {
      setContactos((previos) => {
        const demo = previos.filter((c) => c.origen === "demo");
        if (demo.length === 0) return previos;
        const movidos = moverContactos(demo, bases.current, Date.now());
        const porId = new Map(movidos.map((c) => [c.id, c]));
        const siguientes = previos.map((c) => porId.get(c.id) ?? c);
        guardarContactos(siguientes);
        return siguientes;
      });
    };

    const id = window.setInterval(latir, INTERVALO_SIMULACION_MS);
    return () => window.clearInterval(id);
  }, [habilitado, listo]);

  /*
   * Los dos latidos de red (observar y publicar) leen el estado desde refs y sus efectos
   * dependen solo de BOOLEANOS. La version anterior dependia de `contactos`, `miPosicion`
   * y `otorgamientos` directamente, y eso creaba dos bugs reales detectados en auditoria:
   *
   *  1. Bucle de fetch: cada sobre recibido actualizaba `contactos`, el cambio reiniciaba
   *     el efecto y el reinicio consultaba DE INMEDIATO — el latido de 20 s se convertia
   *     en una consulta continua limitada solo por la latencia.
   *  2. Tormenta de publicaciones: cada tick del GPS (watchPosition puede emitir por
   *     segundo) reiniciaba el efecto publicador con publicacion inmediata, quemando el
   *     limite de 12 escrituras/minuto del canal con 429.
   */
  const contactosRef = useRef<ContactoCirculo[]>([]);
  const otorgamientosRef = useRef<OtorgamientoCirculo[]>([]);
  const posicionRef = useRef<{ coordenada: Coordenada | null; precisionM: number | null }>({
    coordenada: null,
    precisionM: null,
  });
  const aliasRef = useRef("vecino");

  contactosRef.current = contactos;
  otorgamientosRef.current = otorgamientos;
  posicionRef.current = { coordenada: miPosicion, precisionM };
  aliasRef.current = identidad?.seudonimo ?? "vecino";

  const hayVinculados = contactos.some((c) => c.origen === "vinculo" && c.vinculoId && c.clave);
  const hayOtorgamientosActivos = otorgamientos.some(
    (o) => vigenciaDe(o, Date.now()) === "activo",
  );

  // Observar vinculos (ADR-046): baja los sobres de quienes te comparten y los descifra
  // con la clave que trajo la invitacion. El servidor nunca ve una posicion en claro.
  useEffect(() => {
    if (!listo || !habilitado || !hayVinculados) return;
    let vigente = true;

    const consultar = async () => {
      const vinculados = contactosRef.current.filter(
        (c) => c.origen === "vinculo" && c.vinculoId && c.clave,
      );
      if (vinculados.length === 0) return;

      const ahora = Date.now();
      const cambios = new Map<string, Partial<ContactoCirculo>>();

      await Promise.all(
        vinculados.map(async (contacto) => {
          const sobre = await leerSobre(contacto.vinculoId ?? "");
          if (!sobre) return;
          const abierta = await descifrarSobre<PosicionCompartida>(contacto.clave ?? "", sobre);
          if (!abierta || !esPosicionCompartida(abierta)) return;

          // Nada anterior al ultimo sobre aplicado cuenta: un sobre viejo re-publicado
          // (o que sobrevivio en el canal) no puede resucitar un compartir ya cortado
          // ni retroceder la posicion. El tiempo solo avanza.
          if (abierta.timestamp <= contacto.actualizadoEn) return;

          if (abierta.revocado === true) {
            cambios.set(contacto.id, {
              compartiendo: false,
              coordenada: null,
              dejoDeCompartir: true,
              actualizadoEn: abierta.timestamp,
            });
            return;
          }
          // El plazo viaja cifrado dentro del sobre: si ya vencio, se respeta aqui tambien.
          if (abierta.expiraEn !== null && ahora >= abierta.expiraEn) return;

          cambios.set(contacto.id, {
            compartiendo: true,
            dejoDeCompartir: false,
            coordenada: abierta.coordenada,
            actualizadoEn: abierta.timestamp,
            alias: abierta.alias || contacto.alias,
          });
        }),
      );

      if (!vigente || cambios.size === 0) return;
      setContactos((previos) => {
        const siguientes = previos.map((c) =>
          cambios.has(c.id) ? { ...c, ...cambios.get(c.id) } : c,
        );
        guardarContactos(siguientes);
        return siguientes;
      });
    };

    void consultar();
    const id = window.setInterval(() => void consultar(), INTERVALO_SIMULACION_MS);
    return () => {
      vigente = false;
      window.clearInterval(id);
    };
  }, [habilitado, hayVinculados, listo]);

  // Publicar mi posicion (ADR-046): un sobre cifrado por cada otorgamiento activo.
  // La vigencia se re-verifica desde el ref EN CADA publicacion: una revocacion corta
  // tambien a la publicacion que ya estaba en vuelo, sin closure viejo de por medio.
  useEffect(() => {
    if (!listo || !habilitado || !hayOtorgamientosActivos) return;

    const publicar = async () => {
      const { coordenada, precisionM: precision } = posicionRef.current;
      if (!coordenada) return;

      const ahora = Date.now();
      const resultados = await Promise.all(
        otorgamientosRef.current.map(async (otorgamiento) => {
          if (vigenciaDe(otorgamiento, ahora) !== "activo") return null;
          const contenido: PosicionCompartida = {
            coordenada,
            precisionM: precision,
            timestamp: ahora,
            alias: aliasRef.current,
            expiraEn: otorgamiento.expiraEn,
          };
          const sobre = await cifrarSobre(otorgamiento.clave, contenido);
          return publicarSobre(otorgamiento.vinculoId, sobre, 300);
        }),
      );

      // La salud del canal se muestra, no se adivina: si las publicaciones fallan o el
      // canal es efimero (Vercel sin KV), quien comparte tiene que poder verlo.
      const efectivos = resultados.filter((r) => r !== null);
      if (efectivos.length === 0) return;
      const nuevoEstado = efectivos.some((r) => !r.ok)
        ? "fallando"
        : efectivos.some((r) => r.efimero)
          ? "efimero"
          : "ok";
      setEstadoCanal((previo) => (previo === nuevoEstado ? previo : nuevoEstado));
    };

    void publicar();
    const id = window.setInterval(() => void publicar(), INTERVALO_SIMULACION_MS);
    return () => window.clearInterval(id);
  }, [habilitado, hayOtorgamientosActivos, listo]);

  // Evaluacion de cercania: corre con cada latido y con cada reporte nuevo.
  useEffect(() => {
    if (!listo || !habilitado || contactos.length === 0) return;

    const nuevos = evaluarAvisos(contactos, reportes, Date.now(), avisados.current);
    if (nuevos.length === 0) return;

    for (const aviso of nuevos) avisados.current.add(aviso.clave);
    guardarAvisados(avisados.current);
    setAvisos((previos) => [...nuevos, ...previos].slice(0, 20));

    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        for (const aviso of nuevos) {
          const categoria = obtenerCategoria(aviso.categoria);
          new Notification(`Reporte cerca de ${aviso.contactoNombre}`, {
            body: `${categoria.nombre} a ${aviso.distanciaM} m · ${aviso.zonaNombre}`,
            icon: "/icono.svg",
            // Reemplaza la notificacion anterior del mismo contacto en vez de apilarlas.
            tag: `circulo-${aviso.contactoId}`,
          });
        }
      }
    }
  }, [contactos, habilitado, listo, reportes]);

  const persistir = useCallback((siguiente: ContactoCirculo[]) => {
    setContactos(siguiente);
    guardarContactos(siguiente);
  }, []);

  const agregarContacto = useCallback<EstadoCirculo["agregarContacto"]>(
    (datos) => {
      const id = `c-${Date.now().toString(36)}`;
      // El punto base se dispersa de forma determinista para que dos contactos
      // nuevos no queden exactamente encima uno del otro en el mapa.
      const semilla = semillaDeTexto(id);
      registrarBase(id, {
        lat: CENTRO_LIMA.lat + (semilla - 0.5) * 0.08,
        lng: CENTRO_LIMA.lng + (semilla - 0.5) * 0.06,
      });

      const nuevo: ContactoCirculo = {
        id,
        nombre: datos.nombre.trim(),
        telefono: datos.telefono.trim(),
        relacion: datos.relacion.trim() || "Contacto",
        alias: "sin vincular",
        // Compartir es decision del contacto, no tuya: nace como invitacion pendiente.
        compartiendo: false,
        coordenada: null,
        actualizadoEn: 0,
        radioAvisoM: datos.radioAvisoM || RADIO_AVISO_POR_DEFECTO_M,
      };

      persistir([...contactos, nuevo]);
    },
    [contactos, persistir, registrarBase],
  );

  const eliminarContacto = useCallback<EstadoCirculo["eliminarContacto"]>(
    (id) => {
      bases.current.delete(id);
      persistir(contactos.filter((c) => c.id !== id));
    },
    [contactos, persistir],
  );

  const alternarCompartir = useCallback<EstadoCirculo["alternarCompartir"]>(
    (id) => {
      const ahora = Date.now();
      persistir(
        contactos.map((c) => {
          if (c.id !== id) return c;
          const activando = !c.compartiendo;
          if (!activando) return { ...c, compartiendo: false };

          const base = bases.current.get(id) ?? CENTRO_LIMA;
          return {
            ...c,
            compartiendo: true,
            coordenada: posicionSimulada(base, semillaDeTexto(id), ahora),
            actualizadoEn: ahora,
          };
        }),
      );
    },
    [contactos, persistir],
  );

  const cambiarRadio = useCallback<EstadoCirculo["cambiarRadio"]>(
    (id, radioM) => {
      persistir(contactos.map((c) => (c.id === id ? { ...c, radioAvisoM: radioM } : c)));
    },
    [contactos, persistir],
  );

  const descartarAviso = useCallback<EstadoCirculo["descartarAviso"]>((clave) => {
    setAvisos((previos) => previos.filter((a) => a.clave !== clave));
  }, []);

  const solicitarPermiso = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermiso("no_soportado");
      return;
    }
    setPermiso(await Notification.requestPermission());
  }, []);

  const reiniciarCirculo = useCallback(() => {
    const ahora = Date.now();
    limpiarCirculo();
    avisados.current = new Set();
    bases.current = new Map(BASES_DEMO.map(({ id, base }) => [id, base]));
    setAvisos([]);
    setOtorgamientos([]);
    // Sin datos de demo (ADR-040), reiniciar es simplemente vaciar el circulo.
    persistir(CONFIG.datosDemo ? contactosSembrados(ahora) : []);
  }, [persistir]);

  const persistirOtorgamientos = useCallback((siguientes: OtorgamientoCirculo[]) => {
    setOtorgamientos(siguientes);
    guardarOtorgamientos(siguientes);
  }, []);

  const crearInvitacion = useCallback<EstadoCirculo["crearInvitacion"]>(
    async (datos) => {
      const invitacion: InvitacionCirculo = {
        v: 1,
        id: generarVinculoId(),
        k: await generarClave(),
        alias: identidad?.seudonimo ?? "vecino",
      };

      const contacto: ContactoCirculo = {
        id: `v-${invitacion.id}`,
        nombre: datos.nombre.trim() || "Sin nombre",
        telefono: datos.telefono.trim(),
        relacion: datos.relacion.trim() || "Contacto",
        alias: "esperando aceptacion",
        compartiendo: false,
        coordenada: null,
        actualizadoEn: 0,
        radioAvisoM: datos.radioAvisoM || RADIO_AVISO_POR_DEFECTO_M,
        origen: "vinculo",
        vinculoId: invitacion.id,
        clave: invitacion.k,
      };
      persistir([...contactos, contacto]);

      return { invitacion, enlace: enlaceDeInvitacion(window.location.origin, invitacion) };
    },
    [contactos, identidad, persistir],
  );

  const aceptarInvitacion = useCallback<EstadoCirculo["aceptarInvitacion"]>(
    (invitacion, duracionId) => {
      const duracion = duracionPorId(duracionId);
      if (!duracion) return;

      const ahora = Date.now();
      const nuevo: OtorgamientoCirculo = {
        vinculoId: invitacion.id,
        clave: invitacion.k,
        aliasObservador: invitacion.alias,
        otorgadoEn: ahora,
        expiraEn: duracion.ms === null ? null : ahora + duracion.ms,
        revocadoEn: null,
      };
      // Aceptar dos veces el mismo QR renueva el plazo en vez de duplicar la entrada.
      persistirOtorgamientos([
        nuevo,
        ...otorgamientos.filter((o) => o.vinculoId !== invitacion.id),
      ]);
    },
    [otorgamientos, persistirOtorgamientos],
  );

  const revocarOtorgamiento = useCallback<EstadoCirculo["revocarOtorgamiento"]>(
    (vinculoId) => {
      const ahora = Date.now();
      const objetivo = otorgamientos.find((o) => o.vinculoId === vinculoId);
      persistirOtorgamientos(
        otorgamientos.map((o) => (o.vinculoId === vinculoId ? { ...o, revocadoEn: ahora } : o)),
      );

      // La tumba cifrada avisa al observador de inmediato; el TTL corto la disuelve sola.
      if (objetivo) {
        void (async () => {
          try {
            const tumba = await cifrarSobre(objetivo.clave, {
              revocado: true,
              timestamp: ahora,
            });
            // TTL maximo del canal: si el observador esta sin conexion mas de 15 min,
            // vera "sin senal" en vez de "dejo de compartir" — anotado en REVISION-PENDIENTE.
            await publicarSobre(vinculoId, tumba, 900);
          } catch {
            // Si la tumba no sale, el silencio hace el mismo trabajo mas lento:
            // sin sobres nuevos, el ultimo caduca por TTL y el contacto queda sin senal.
            await borrarSobre(vinculoId);
          }
        })();
      }
    },
    [otorgamientos, persistirOtorgamientos],
  );

  const valor = useMemo<EstadoCirculo>(
    () => ({
      habilitado,
      contactos,
      avisos,
      permiso,
      listo,
      otorgamientos,
      estadoCanal,
      agregarContacto,
      eliminarContacto,
      alternarCompartir,
      cambiarRadio,
      descartarAviso,
      solicitarPermiso,
      reiniciarCirculo,
      crearInvitacion,
      aceptarInvitacion,
      revocarOtorgamiento,
    }),
    [
      aceptarInvitacion,
      agregarContacto,
      alternarCompartir,
      avisos,
      cambiarRadio,
      contactos,
      crearInvitacion,
      descartarAviso,
      eliminarContacto,
      estadoCanal,
      habilitado,
      listo,
      otorgamientos,
      permiso,
      reiniciarCirculo,
      revocarOtorgamiento,
      solicitarPermiso,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useCirculo(): EstadoCirculo {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useCirculo debe usarse dentro de <CirculoProvider>");
  return ctx;
}
