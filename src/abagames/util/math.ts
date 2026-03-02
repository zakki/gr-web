export class MathUtil {
  public static normalizeDeg(d: number): number {
    if (d < -Math.PI) d = Math.PI * 2 - (-d % (Math.PI * 2));
    d = ((d + Math.PI) % (Math.PI * 2)) - Math.PI;
    return d;
  }

  public static normalizeDeg360(d: number): number {
    if (d < -180) d = 360 - (-d % 360);
    d = ((d + 180) % 360) - 180;
    return d;
  }
}
