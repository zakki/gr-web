/*
 * $Id: bulletsmanager.d,v 1.1.1.1 2004/11/10 13:45:22 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

import type { Bullet, BulletMLState } from "./bullet";

/**
 * Interface for bullet's instances manager.
 */
export interface BulletsManager {
  addSimpleBullet(deg: number, speed: number): void;
  addStateBullet(state: BulletMLState, deg: number, speed: number): void;
  getTurn(): number;
  killMe(bullet: Bullet): void;
}
