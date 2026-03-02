/*
 * $Id: sdlexception.d,v 1.1.1.1 2004/11/10 13:45:22 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

/**
 * SDL initialize failed.
 */
export class SDLInitFailedException extends Error {
  public constructor(msg: string) {
    super(msg);
    this.name = "SDLInitFailedException";
  }
}

/**
 * SDL general exception.
 */
export class SDLException extends Error {
  public constructor(msg: string) {
    super(msg);
    this.name = "SDLException";
  }
}
