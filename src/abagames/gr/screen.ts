import { Rand } from "../util/rand";
import { LuminousScreen } from "../util/sdl/luminous";
import { Screen3D } from "../util/sdl/screen3d";

export class GrScreen extends Screen3D {
  private static rand = new Rand();
  private static lineWidthBase = 1;

  private luminousScreen: LuminousScreen | null = null;
  private luminosityValue = 0;
  private screenShakeCnt = 0;
  private screenShakeIntense = 0;

  public static setRandSeed(seed: number): void {
    GrScreen.rand.setSeed(seed);
  }

  public get luminosity(): number {
    return this.luminosityValue;
  }

  public set luminosity(v: number) {
    this.luminosityValue = Math.max(0, Math.min(1, v));
  }

  protected init(): void {
    this.setCaption("Gunroar");
    Screen3D.glLineWidth(1);
    Screen3D.glBlendAdditive();
    Screen3D.setClearColor(0, 0, 0, 1);
    if (this.luminosityValue > 0) {
      this.luminousScreen = new LuminousScreen();
      this.luminousScreen.init(this.luminosityValue, Screen3D.width, Screen3D.height);
    } else {
      this.luminousScreen = null;
    }
    this.screenResized();
  }

  protected close(): void {
    this.luminousScreen?.close();
    this.luminousScreen = null;
  }

  public startRenderToLuminousScreen(): boolean {
    if (!this.luminousScreen) return false;
    this.luminousScreen.startRender();
    return true;
  }

  public endRenderToLuminousScreen(): void {
    this.luminousScreen?.endRender();
  }

  public drawLuminous(): void {
    this.luminousScreen?.draw();
  }

  public override resized(width: number, height: number): void {
    this.luminousScreen?.resized(width, height);
    super.resized(width, height);
  }

  public override screenResized(): void {
    super.screenResized();
    let lw = (Screen3D.width / 640 + Screen3D.height / 480) / 2;
    if (lw < 1) lw = 1;
    if (lw > 4) lw = 4;
    GrScreen.lineWidthBase = lw;
    GrScreen.lineWidth(1);
  }

  public static lineWidth(width: number): void {
    Screen3D.glLineWidth((GrScreen.lineWidthBase * width) | 0);
  }

  public override clear(): void {
    Screen3D.glClear(Screen3D.GL_COLOR_BUFFER_BIT);
  }

  public static viewOrthoFixed(): void {
    Screen3D.glMatrixMode(Screen3D.GL_PROJECTION);
    Screen3D.glPushMatrix();
    Screen3D.glLoadIdentity();
    Screen3D.glOrtho(0, 640, 480, 0, -1, 1);
    Screen3D.glMatrixMode(Screen3D.GL_MODELVIEW);
    Screen3D.glPushMatrix();
    Screen3D.glLoadIdentity();
  }

  public static viewPerspective(): void {
    Screen3D.glMatrixMode(Screen3D.GL_PROJECTION);
    Screen3D.glPopMatrix();
    Screen3D.glMatrixMode(Screen3D.GL_MODELVIEW);
    Screen3D.glPopMatrix();
  }

  public setEyepos(): void {
    let ex = 0;
    let ey = 0;
    const ez = 13;
    let lx = 0;
    let ly = 0;
    const lz = 0;

    if (this.screenShakeCnt > 0) {
      const magnitude = this.screenShakeIntense * (this.screenShakeCnt + 4);
      const mx = GrScreen.rand.nextSignedFloat(magnitude);
      const my = GrScreen.rand.nextSignedFloat(magnitude);
      ex += mx;
      ey += my;
      lx += mx;
      ly += my;
    }

    Screen3D.gluLookAt(ex, ey, ez, lx, ly, lz, 0, 1, 0);
  }

  public setScreenShake(cnt: number, intense: number): void {
    this.screenShakeCnt = Math.max(0, cnt | 0);
    this.screenShakeIntense = Math.max(0, Math.min(1, intense));
  }

  public move(): void {
    if (this.screenShakeCnt > 0) this.screenShakeCnt--;
  }

  public static setColorForced(r: number, g: number, b: number, a = 1): void {
    Screen3D.setColor(r, g, b, a);
  }
}
