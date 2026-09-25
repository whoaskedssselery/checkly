import { IsNumber } from 'class-validator';

/**
 * Board coordinates. Floats on purpose — the canvas is zoomable and React
 * Flow hands back fractional positions mid-pan, so nothing here is rounded.
 */
export class PositionDto {
  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;
}