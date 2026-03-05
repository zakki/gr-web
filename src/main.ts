import { boot } from "./abagames/gr/boot";

interface LaunchOptions {
  noSound: boolean;
  windowMode: boolean;
  exchangeButtons: boolean;
  useResolution: boolean;
  resolutionWidth: number;
  resolutionHeight: number;
}

async function promptLaunchOptions(): Promise<string[]> {
  if (typeof document === "undefined") return [];

  const options: LaunchOptions = {
    noSound: false,
    windowMode: false,
    exchangeButtons: false,
    useResolution: false,
    resolutionWidth: 640,
    resolutionHeight: 480,
  };

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "10000";
    overlay.style.display = "grid";
    overlay.style.placeItems = "center";
    overlay.style.background = "rgba(0, 0, 0, 0.88)";
    overlay.style.color = "#fff";
    overlay.style.fontFamily = "monospace";
    overlay.style.padding = "16px";

    const panel = document.createElement("div");
    panel.style.width = "min(680px, 100%)";
    panel.style.maxHeight = "100%";
    panel.style.overflow = "auto";
    panel.style.boxSizing = "border-box";
    panel.style.padding = "16px";
    panel.style.border = "1px solid rgba(255, 255, 255, 0.35)";
    panel.style.background = "rgba(10, 10, 10, 0.92)";

    panel.innerHTML = `
      <h1 style="margin:0 0 8px 0; font-size:20px;">GUNROAR Options</h1>
      <p style="margin:0 0 12px 0; color:#ddd; line-height:1.45;">
        Configure startup options from readme_e.txt before launch.
      </p>
      <div style="display:grid; gap:10px;">
        <label style="display:flex; gap:8px; align-items:center;">
          <input id="gr-opt-res-enable" type="checkbox" />
          -res x y Set the screen resolution to (x, y).
        </label>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <input id="gr-opt-res-w" type="number" min="320" max="7680" value="640" style="width:120px;" />
          <input id="gr-opt-res-h" type="number" min="240" max="4320" value="480" style="width:120px;" />
        </div>

        <label style="display:flex; gap:8px; align-items:center;">
          <input id="gr-opt-nosound" type="checkbox" />
          -nosound Stop the sound.
        </label>
        <label style="display:flex; gap:8px; align-items:center;">
          <input id="gr-opt-window" type="checkbox" />
          -window Launch in window mode.
        </label>
        <label style="display:flex; gap:8px; align-items:center;">
          <input id="gr-opt-exchange" type="checkbox" />
          -exchange Exchange button A/B.
        </label>
      </div>
      <div style="display:flex; gap:8px; margin-top:16px; justify-content:flex-end;">
        <button id="gr-opt-start" style="padding:8px 14px; cursor:pointer;">Start</button>
      </div>
    `;

    overlay.append(panel);
    document.body.append(overlay);

    const byId = <T extends HTMLElement>(id: string): T => {
      const el = panel.querySelector(`#${id}`);
      if (!el) throw new Error(`Missing element: ${id}`);
      return el as T;
    };

    const useResolutionInput = byId<HTMLInputElement>("gr-opt-res-enable");
    const widthInput = byId<HTMLInputElement>("gr-opt-res-w");
    const heightInput = byId<HTMLInputElement>("gr-opt-res-h");
    const noSoundInput = byId<HTMLInputElement>("gr-opt-nosound");
    const windowInput = byId<HTMLInputElement>("gr-opt-window");
    const exchangeInput = byId<HTMLInputElement>("gr-opt-exchange");
    const startButton = byId<HTMLButtonElement>("gr-opt-start");

    const start = () => {
      options.useResolution = useResolutionInput.checked;
      options.resolutionWidth = clampInt(widthInput.value, 1, 7680, 640);
      options.resolutionHeight = clampInt(heightInput.value, 1, 4320, 480);
      options.noSound = noSoundInput.checked;
      options.windowMode = windowInput.checked;
      options.exchangeButtons = exchangeInput.checked;
      overlay.remove();
      resolve(buildBootArgs(options));
    };

    startButton.addEventListener("click", start);
    panel.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      start();
    });
    startButton.focus();
  });
}

function clampInt(value: string, min: number, max: number, fallback: number): number {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num)) return fallback;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

function buildBootArgs(options: LaunchOptions): string[] {
  const args: string[] = [];
  if (options.useResolution) args.push("-res", String(options.resolutionWidth), String(options.resolutionHeight));
  if (options.noSound) args.push("-nosound");
  if (options.windowMode) args.push("-window");
  if (options.exchangeButtons) args.push("-exchange");
  return args;
}

void (async () => {
  const launchArgs = await promptLaunchOptions();
  void boot((["gr-web", ...launchArgs] as unknown) as string[][]);
})();
