/*
 * $Id: screen.d,v 1.1.1.1 2004/11/10 13:45:22 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

/**
 * SDL screen handler interface.
 */
export interface Screen {
  initSDL(): void;
  closeSDL(): void;
  flip(): void;
  clear(): void;
}
