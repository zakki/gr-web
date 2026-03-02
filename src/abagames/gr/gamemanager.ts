import { GameManager } from "../util/sdl/gamemanager";
import { Screen3D } from "../util/sdl/screen3d";

export class GrGameManager extends GameManager {
  public static shipTurnSpeed = 1;
  public static shipReverseFire = false;

  public init(): void {}

  public start(): void {}

  public close(): void {}

  public move(): void {}

  public draw(): void {
    // Phase 1 bootstrap: keep rendering active while title/game logic is still being ported.
    Screen3D.glPushMatrix();
    Screen3D.glLoadIdentity();
    Screen3D.glPopMatrix();
  }

  public saveErrorReplay(): void {}
}
