/*
 * $Id: gamemanager.d,v 1.1.1.1 2004/11/10 13:45:22 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

import type { PrefManager } from "../prefmanager";
import type { MainLoop } from "./mainloop";
import type { Screen } from "./screen";
import type { Input } from "./input";

/**
 * Manage the lifecycle of the game.
 */
export abstract class GameManager {
  protected mainLoop!: MainLoop;
  protected abstScreen!: Screen;
  protected input!: Input;
  protected abstPrefManager!: PrefManager;

  public setMainLoop(mainLoop: MainLoop): void {
    this.mainLoop = mainLoop;
  }

  public setUIs(screen: Screen, input: Input): void {
    this.abstScreen = screen;
    this.input = input;
  }

  public setPrefManager(prefManager: PrefManager): void {
    this.abstPrefManager = prefManager;
  }

  public abstract init(): void;
  public abstract start(): void;
  public abstract close(): void;
  public abstract move(): void;
  public abstract draw(): void;
}
