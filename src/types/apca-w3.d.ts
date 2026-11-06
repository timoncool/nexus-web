declare module 'apca-w3' {
  /** Lc of text luminance over background luminance; negative for light text on a darker background. */
  export function APCAcontrast(txtY: number, bgY: number, places?: number): number;
  /** Screen luminance Y of an 8-bit sRGB triple. */
  export function sRGBtoY(rgb: readonly [number, number, number]): number;
}
