import { MouseState, RecordableMouse as SDLRecordableMouse } from "../util/sdl/mouse";

type SizableScreen = {
  width: number;
  height: number;
};

/**
 * Mouse input mapped to game-space coordinates.
 */
export class RecordableMouse extends SDLRecordableMouse {
  private static readonly MOUSE_SCREEN_MAPPING_RATIO_X = 26.0;
  private static readonly MOUSE_SCREEN_MAPPING_RATIO_Y = 19.5;
  private readonly screen: SizableScreen;

  public constructor(screen: SizableScreen) {
    super();
    this.screen = screen;
  }

  protected override adjustPos(ms: MouseState): void {
    ms.x = (ms.x - this.screen.width / 2) * RecordableMouse.MOUSE_SCREEN_MAPPING_RATIO_X / this.screen.width;
    ms.y = -(ms.y - this.screen.height / 2) * RecordableMouse.MOUSE_SCREEN_MAPPING_RATIO_Y / this.screen.height;
  }
}
