import { IsNumber, Max, Min } from 'class-validator';

/**
 * Board coordinates. Floats on purpose — the canvas is zoomable and React
 * Flow hands back fractional positions mid-pan, so nothing here is rounded.
 * Bounded so one bad request cannot park a card at a distance no viewport
 * can ever reach. `IsNumber` already rejects NaN and Infinity.
 */
export class PositionDto {
  @IsNumber()
  @Min(-1_000_000)
  @Max(1_000_000)
  x!: number;

  @IsNumber()
  @Min(-1_000_000)
  @Max(1_000_000)
  y!: number;
}
