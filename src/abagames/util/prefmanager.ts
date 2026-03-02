/*
 * $Id: prefmanager.d,v 1.1.1.1 2004/11/10 13:45:22 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

/**
 * Save/load the preference(e.g. high-score).
 */
export interface PrefManager {
  save(): void;
  load(): void;
}
