import { describe, expect, it } from "vitest";
import { dimensionesDestino, LADO_MAXIMO_EVIDENCIA, nombreJpeg } from "./imagen";

describe("dimensionesDestino — escala de la evidencia (ADR-056)", () => {
  it("reduce una foto horizontal tipica de telefono al lado maximo", () => {
    expect(dimensionesDestino(4032, 3024)).toEqual({ ancho: 1600, alto: 1200 });
  });

  it("reduce una foto vertical por su lado mayor", () => {
    expect(dimensionesDestino(3024, 4032)).toEqual({ ancho: 1200, alto: 1600 });
  });

  it("nunca agranda una imagen que ya es chica", () => {
    expect(dimensionesDestino(640, 480)).toEqual({ ancho: 640, alto: 480 });
  });

  it("respeta un lado maximo explicito", () => {
    expect(dimensionesDestino(1000, 500, 100)).toEqual({ ancho: 100, alto: 50 });
  });

  it("una imagen extrema jamas colapsa a cero pixeles", () => {
    const { ancho, alto } = dimensionesDestino(100000, 10, LADO_MAXIMO_EVIDENCIA);
    expect(ancho).toBe(1600);
    expect(alto).toBeGreaterThanOrEqual(1);
  });

  it("dimensiones invalidas caen a 1x1 en vez de romper el canvas", () => {
    expect(dimensionesDestino(0, 500)).toEqual({ ancho: 1, alto: 1 });
    expect(dimensionesDestino(NaN, 500)).toEqual({ ancho: 1, alto: 1 });
  });
});

describe("nombreJpeg — nombre del archivo limpio", () => {
  it("cambia la extension a .jpg", () => {
    expect(nombreJpeg("IMG_2043.HEIC")).toBe("IMG_2043.jpg");
    expect(nombreJpeg("foto.png")).toBe("foto.jpg");
  });

  it("agrega .jpg cuando no habia extension", () => {
    expect(nombreJpeg("captura")).toBe("captura.jpg");
  });

  it("nunca devuelve un nombre vacio", () => {
    expect(nombreJpeg(".jpg")).toBe("evidencia.jpg");
    expect(nombreJpeg("")).toBe("evidencia.jpg");
  });
});
