import { Actor, ActorPool } from "../util/actor";
import { Vector } from "../util/vector";
import { Ship } from "./ship";
import { Screen3D } from "../util/sdl/screen3d";
import { CrystalShape } from "./shape";

/**
 * Bonus crystals.
 */
export class Crystal extends Actor {
  private static readonly COUNT = 60;
  private static readonly PULLIN_COUNT = Math.floor(Crystal.COUNT * 0.8);
  private static _shape: CrystalShape;
  private ship!: Ship;
  private pos: Vector;
  private vel: Vector;
  private cnt: number = 0;

  public static init(): void {
    Crystal._shape = new CrystalShape();
  }

  public static close(): void {
    Crystal._shape.close();
  }

  constructor() {
    super();
    this.pos = new Vector();
    this.vel = new Vector();
  }

  public override init(args: any[]): void {
    this.ship = args[0] as Ship;
  }

  public set(p: Vector): void {
    this.pos.x = p.x;
    this.pos.y = p.y;
    this.cnt = Crystal.COUNT;
    this.vel.x = 0;
    this.vel.y = 0.1;
    this.exists = true;
  }

  public override move(): void {
    this.cnt--;
    let dist = this.pos.dist(this.ship.midstPos);
    if (dist < 0.1) dist = 0.1;
    if (this.cnt < Crystal.PULLIN_COUNT) {
      this.vel.x += (this.ship.midstPos.x - this.pos.x) / dist * 0.07;
      this.vel.y += (this.ship.midstPos.y - this.pos.y) / dist * 0.07;
      if (this.cnt < 0 || dist < 2) {
        this.exists = false;
        return;
      }
    }
    this.vel.mul(0.95);
    this.pos.add(this.vel);
  }

  public override draw(): void {
    let r = 0.25;
    let d = this.cnt * 0.1;
    if (this.cnt > Crystal.PULLIN_COUNT) {
      r *= (Crystal.COUNT - this.cnt) / (Crystal.COUNT - Crystal.PULLIN_COUNT);
    }
    for (let i = 0; i < 4; i++) {
      Screen3D.glPushMatrix();
      Screen3D.glTranslatef(this.pos.x + Math.sin(d) * r, this.pos.y + Math.cos(d) * r, 0);
      Crystal._shape.draw();
      Screen3D.glPopMatrix();
      d += Math.PI / 2;
    }
  }
}

export class CrystalPool extends ActorPool<Crystal> {
  constructor(n: number, args: any[]) {
    super(n, args, () => new Crystal());
  }
}
