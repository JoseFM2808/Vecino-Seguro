/**
 * Limpieza y compresion de la evidencia fotografica (ADR-056).
 *
 * Reencodar la foto en un canvas hace las dos cosas de una vez:
 *
 * - Privacidad: al canvas solo pasan los PIXELES, asi que el JPEG resultante no
 *   lleva ningun metadato del original — ni EXIF, ni GPS, ni modelo del telefono.
 *   Para una red pseudonima es obligatorio: la evidencia termina en IPFS, que es
 *   publico y permanente, y una foto con GPS delata la casa del vecino.
 * - Peso: la foto tipica de un telefono (3–8 MB) queda en cientos de KB, que es lo
 *   que una subida movil y el sitio aguantan bien.
 *
 * Si la foto no se puede procesar, NO se usa la original (fail-closed): antes que
 * filtrar la ubicacion exacta de alguien, se le pide otra imagen.
 *
 * `dimensionesDestino` y `nombreJpeg` son puras y tienen tests;
 * `limpiarYComprimirImagen` necesita canvas, asi que solo corre en el navegador.
 * Los navegadores aplican la orientacion EXIF al decodificar (image-orientation:
 * from-image es el valor por defecto), de modo que la copia sale derecha sin
 * conservar la etiqueta.
 */

/** Lado mayor de la evidencia subida. 1600 px sobra para leer una placa o un rostro. */
export const LADO_MAXIMO_EVIDENCIA = 1600;

/** Calidad JPEG de la reencodificacion. */
export const CALIDAD_EVIDENCIA = 0.8;

/** Escala (ancho, alto) para que el lado mayor no pase de `ladoMaximo`, sin agrandar. */
export function dimensionesDestino(
  ancho: number,
  alto: number,
  ladoMaximo: number = LADO_MAXIMO_EVIDENCIA,
): { ancho: number; alto: number } {
  if (!Number.isFinite(ancho) || !Number.isFinite(alto) || ancho <= 0 || alto <= 0) {
    return { ancho: 1, alto: 1 };
  }
  const escala = Math.min(1, ladoMaximo / Math.max(ancho, alto));
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  };
}

/** Nombre de salida: el mismo, con extension .jpg (la salida siempre es JPEG). */
export function nombreJpeg(nombre: string): string {
  const base = nombre.replace(/\.[^.]+$/, "").trim();
  return `${base || "evidencia"}.jpg`;
}

/**
 * Devuelve una copia de la imagen sin metadatos, redimensionada y comprimida.
 * Lanza si el archivo no se puede decodificar o reencodar: quien llama decide
 * que decirle a la persona, pero el original nunca sigue viaje.
 */
export async function limpiarYComprimirImagen(archivo: File): Promise<File> {
  if (typeof document === "undefined") {
    throw new Error("La limpieza de imagen solo corre en el navegador");
  }

  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No se pudo decodificar la imagen"));
      el.src = url;
    });

    const { ancho, alto } = dimensionesDestino(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");
    // Fondo blanco: JPEG no tiene canal alfa y sin esto un PNG transparente sale negro.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(img, 0, 0, ancho, alto);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", CALIDAD_EVIDENCIA),
    );
    if (!blob) throw new Error("No se pudo reencodar la imagen");

    return new File([blob], nombreJpeg(archivo.name), { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
