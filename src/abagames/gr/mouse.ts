import { type MouseState, RecordableMouse } from "../util/sdl/mouse";
import { Screen3D } from "../util/sdl/screen3d";

export class GrRecordableMouse extends RecordableMouse {
  private static readonly MOUSE_SCREEN_MAPPING_RATIO_X = 26.0;
  private static readonly MOUSE_SCREEN_MAPPING_RATIO_Y = 19.5;
  public constructor(_screen: Screen3D) {
    super();
  }

  protected override adjustPos(state: MouseState): void {
    state.x =
      ((state.x - Screen3D.width / 2) * GrRecordableMouse.MOUSE_SCREEN_MAPPING_RATIO_X) /
      Screen3D.width;
    state.y =
      (-(state.y - Screen3D.height / 2) * GrRecordableMouse.MOUSE_SCREEN_MAPPING_RATIO_Y) /
      Screen3D.height;
  }
}
