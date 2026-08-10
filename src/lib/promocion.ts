/**
 * Campania de votacion del hackathon (ADR-055).
 *
 * El aviso pide el voto en la plataforma de ETH Lima y se apaga solo despues del
 * 12 de agosto de 2026 (fin del dia, hora de Lima): pasado el plazo no hay nada que
 * votar y un popup vencido resta credibilidad al resto del producto.
 *
 * Funcion pura como el resto de las reglas de negocio: recibe `ahora` como parametro,
 * no toca React ni `window`.
 */

export const URL_VOTACION =
  "https://platform.ethlima.org/proyectos#:~:text=Vecino%20Seguro";

export const REDES_SOCIALES = [
  {
    nombre: "LinkedIn",
    url: "https://www.linkedin.com/in/vecino-seguro-6b8a52427/",
  },
  {
    nombre: "Instagram",
    url: "https://www.instagram.com/vecinoseguro.a/",
  },
] as const;

/** 2026-08-13 00:00 en Lima (UTC-5): cubre el 12 de agosto completo, inclusive. */
export const FIN_VOTACION_MS = Date.UTC(2026, 7, 13, 5, 0, 0);

/** La campana de votos sigue abierta en el instante dado. */
export function votacionAbierta(ahora: number): boolean {
  return ahora < FIN_VOTACION_MS;
}
