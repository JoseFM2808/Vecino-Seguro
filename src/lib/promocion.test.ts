import { describe, expect, it } from "vitest";
import { FIN_VOTACION_MS, votacionAbierta } from "./promocion";

describe("votacionAbierta — ventana de la campania de votos (ADR-055)", () => {
  it("esta abierta durante el 12 de agosto de 2026 en Lima", () => {
    // 12 de agosto, 3:59 pm en Lima (UTC-5): una hora antes del cierre del hackathon.
    const mediodiaDel12 = Date.UTC(2026, 7, 12, 20, 59, 0);
    expect(votacionAbierta(mediodiaDel12)).toBe(true);
  });

  it("esta abierta justo antes de la medianoche del 12 en Lima", () => {
    expect(votacionAbierta(FIN_VOTACION_MS - 1)).toBe(true);
  });

  it("se apaga a partir del 13 de agosto en Lima", () => {
    expect(votacionAbierta(FIN_VOTACION_MS)).toBe(false);
    const tresDiasDespues = FIN_VOTACION_MS + 3 * 24 * 60 * 60 * 1000;
    expect(votacionAbierta(tresDiasDespues)).toBe(false);
  });
});
