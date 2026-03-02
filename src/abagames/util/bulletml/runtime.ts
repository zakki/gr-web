import type { BulletMLRunner, BulletMLState } from "./bullet";

type RunnerCallback = (...args: unknown[]) => unknown;
type RunnerCallbackMap = Record<string, RunnerCallback>;

type FormulaVars = {
  rank: number;
  parameters: number[] | null;
  runner: BulletMLRunnerTS;
};

type FormulaFn = (vars: FormulaVars) => number;

enum NodeType {
  NONE,
  AIM,
  ABSOLUTE,
  RELATIVE,
  SEQUENCE,
}

enum NodeName {
  BULLET,
  ACTION,
  FIRE,
  CHANGE_DIRECTION,
  CHANGE_SPEED,
  ACCEL,
  WAIT,
  REPEAT,
  BULLET_REF,
  ACTION_REF,
  FIRE_REF,
  VANISH,
  HORIZONTAL,
  VERTICAL,
  TERM,
  TIMES,
  DIRECTION,
  SPEED,
  PARAM,
  BULLETML,
}

const NAME_FROM_STRING: Record<string, NodeName> = {
  bullet: NodeName.BULLET,
  action: NodeName.ACTION,
  fire: NodeName.FIRE,
  changeDirection: NodeName.CHANGE_DIRECTION,
  changeSpeed: NodeName.CHANGE_SPEED,
  accel: NodeName.ACCEL,
  wait: NodeName.WAIT,
  repeat: NodeName.REPEAT,
  bulletRef: NodeName.BULLET_REF,
  actionRef: NodeName.ACTION_REF,
  fireRef: NodeName.FIRE_REF,
  vanish: NodeName.VANISH,
  horizontal: NodeName.HORIZONTAL,
  vertical: NodeName.VERTICAL,
  term: NodeName.TERM,
  times: NodeName.TIMES,
  direction: NodeName.DIRECTION,
  speed: NodeName.SPEED,
  param: NodeName.PARAM,
  bulletml: NodeName.BULLETML,
};

function parseNodeType(type: string | null): NodeType {
  switch (type) {
    case "aim":
      return NodeType.AIM;
    case "absolute":
      return NodeType.ABSOLUTE;
    case "relative":
      return NodeType.RELATIVE;
    case "sequence":
      return NodeType.SEQUENCE;
    case null:
    case "":
      return NodeType.NONE;
    default:
      throw new Error(`BulletML parser: unknown type ${type}.`);
  }
}

class BulletMLNode {
  public readonly name: NodeName;
  public type = NodeType.NONE;
  public refID = -1;
  private parent: BulletMLNode | null = null;
  private readonly children: BulletMLNode[] = [];
  private formula: FormulaFn | null = null;

  public constructor(tagName: string) {
    const name = NAME_FROM_STRING[tagName];
    if (name === undefined) throw new Error(`BulletML parser: unknown tag ${tagName}.`);
    this.name = name;
  }

  public setParent(parent: BulletMLNode | null): void {
    this.parent = parent;
  }

  public getParent(): BulletMLNode | null {
    return this.parent;
  }

  public addChild(child: BulletMLNode): void {
    child.setParent(this);
    this.children.push(child);
  }

  public childSize(): number {
    return this.children.length;
  }

  public childBegin(): BulletMLNode | null {
    return this.children.length > 0 ? this.children[0] : null;
  }

  public childList(): readonly BulletMLNode[] {
    return this.children;
  }

  public setValue(valueText: string): void {
    this.formula = compileFormula(valueText.trim());
  }

  public getValue(vars: FormulaVars): number {
    if (!this.formula) return 0;
    return this.formula(vars);
  }

  public getChild(name: NodeName): BulletMLNode | null {
    for (const c of this.children) {
      if (c.name === name) return c;
    }
    return null;
  }

  public getAllChildrenVec(name: NodeName, out: BulletMLNode[]): void {
    for (const c of this.children) {
      if (c.name === name) out.push(c);
    }
  }

  public next(): BulletMLNode | null {
    const p = this.parent;
    if (!p) return null;
    const idx = p.children.indexOf(this);
    if (idx < 0 || idx + 1 >= p.children.length) return null;
    return p.children[idx + 1];
  }
}

class BulletMLParserTS {
  private bulletml: BulletMLNode | null = null;
  private readonly topActions: BulletMLNode[] = [];
  private readonly bulletMap: Array<BulletMLNode | null> = [];
  private readonly actionMap: Array<BulletMLNode | null> = [];
  private readonly fireMap: Array<BulletMLNode | null> = [];
  private horizontal = false;

  public readonly name: string;

  public constructor(name: string) {
    this.name = name;
  }

  public parse(xmlText: string): void {
    this.bulletml = null;
    this.topActions.length = 0;
    this.bulletMap.length = 0;
    this.actionMap.length = 0;
    this.fireMap.length = 0;
    this.horizontal = false;

    const idPool = {
      bullet: new Map<string, number>(),
      action: new Map<string, number>(),
      fire: new Map<string, number>(),
      bulletMax: 0,
      actionMax: 0,
      fireMax: 0,
    };

    const dom = new DOMParser().parseFromString(xmlText, "application/xml");
    const parserError = dom.querySelector("parsererror");
    if (parserError) {
      throw new Error(`${this.name}: ${parserError.textContent ?? "xml parse error"}`);
    }
    const root = dom.documentElement;
    if (!root) throw new Error(`${this.name}: empty xml`);

    const walk = (elem: Element, parent: BulletMLNode | null): BulletMLNode => {
      const node = new BulletMLNode(getNodeTagName(elem));
      if (node.name === NodeName.BULLETML) {
        this.bulletml = node;
        if (getAttr(elem, "type") === "horizontal") this.horizontal = true;
      } else if (!parent) {
        throw new Error("<bulletml> doesn't come.");
      } else {
        parent.addChild(node);
      }

      if (node.name !== NodeName.BULLETML) {
        const typeAttr = getAttr(elem, "type");
        node.type = parseNodeType(typeAttr);
      }

      const label = getAttr(elem, "label");
      if (label) {
        const domain = resolveDomain(node.name);
        const id = getLabelID(idPool, domain, label);
        if (node.name === NodeName.BULLET) this.bulletMap[id] = node;
        else if (node.name === NodeName.ACTION) this.actionMap[id] = node;
        else if (node.name === NodeName.FIRE) this.fireMap[id] = node;
        else if (
          node.name === NodeName.BULLET_REF ||
          node.name === NodeName.ACTION_REF ||
          node.name === NodeName.FIRE_REF
        ) {
          node.refID = id;
        } else {
          throw new Error('he can\'t have attribute "label".');
        }

        if (node.name === NodeName.ACTION && label.startsWith("top")) {
          this.topActions.push(node);
        }
      }

      let text = "";
      for (const child of Array.from(elem.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child as Element, node);
        } else if (
          child.nodeType === Node.TEXT_NODE ||
          child.nodeType === Node.CDATA_SECTION_NODE
        ) {
          text += child.nodeValue ?? "";
        }
      }
      if (text.trim().length > 0) {
        node.setValue(text);
      }
      return node;
    };

    const parsedRoot = walk(root, null);
    if (parsedRoot.name !== NodeName.BULLETML) throw new Error("<bulletml> doesn't come.");
    this.bulletml = parsedRoot;
    if (this.topActions.length === 0) {
      for (const c of parsedRoot.childList()) {
        if (c.name === NodeName.ACTION) this.topActions.push(c);
      }
    }
  }

  public getTopActions(): readonly BulletMLNode[] {
    return this.topActions;
  }

  public getBulletRef(id: number): BulletMLNode {
    const n = this.bulletMap[id] ?? null;
    if (!n) throw new Error("bulletRef key doesn't exist.");
    return n;
  }

  public getActionRef(id: number): BulletMLNode {
    const n = this.actionMap[id] ?? null;
    if (!n) throw new Error("actionRef key doesn't exist.");
    return n;
  }

  public getFireRef(id: number): BulletMLNode {
    const n = this.fireMap[id] ?? null;
    if (!n) throw new Error("fireRef key doesn't exist.");
    return n;
  }

  public isHorizontal(): boolean {
    return this.horizontal;
  }
}

function getNodeTagName(elem: Element): string {
  const n = (elem.localName && elem.localName.length > 0 ? elem.localName : elem.tagName).trim();
  const idx = n.indexOf(":");
  return idx >= 0 ? n.slice(idx + 1) : n;
}

function getAttr(elem: Element, name: string): string | null {
  const direct = elem.getAttribute(name);
  if (direct !== null) return direct;
  for (const a of Array.from(elem.attributes)) {
    const an = (a.localName && a.localName.length > 0 ? a.localName : a.name).trim();
    if (an === name) return a.value;
    const idx = an.indexOf(":");
    if (idx >= 0 && an.slice(idx + 1) === name) return a.value;
  }
  return null;
}

function resolveDomain(name: NodeName): "bullet" | "action" | "fire" {
  if (name === NodeName.BULLET || name === NodeName.BULLET_REF) return "bullet";
  if (name === NodeName.ACTION || name === NodeName.ACTION_REF) return "action";
  if (name === NodeName.FIRE || name === NodeName.FIRE_REF) return "fire";
  throw new Error("invalid label domain");
}

function getLabelID(
  idPool: {
    bullet: Map<string, number>;
    action: Map<string, number>;
    fire: Map<string, number>;
    bulletMax: number;
    actionMax: number;
    fireMax: number;
  },
  domain: "bullet" | "action" | "fire",
  key: string,
): number {
  const map = idPool[domain];
  const found = map.get(key);
  if (found !== undefined) return found;
  const maxKey = `${domain}Max` as const;
  const id = idPool[maxKey];
  idPool[maxKey]++;
  map.set(key, id);
  return id;
}

export class BulletMLStateAsset {
  public readonly bulletml: BulletMLParserTS;
  public readonly node: BulletMLNode[];
  public readonly para: number[] | null;

  public constructor(bulletml: BulletMLParserTS, node: BulletMLNode[], para: number[] | null) {
    this.bulletml = bulletml;
    this.node = node;
    this.para = para;
  }

  public createRunner(): BulletMLRunner {
    return new BulletMLRunnerTS(this);
  }
}

class LinearFunc {
  private readonly gradient: number;

  public constructor(
    private readonly firstX: number,
    private readonly lastX: number,
    private readonly firstY: number,
    private readonly lastY: number,
  ) {
    const d = this.lastX - this.firstX;
    this.gradient = d !== 0 ? (this.lastY - this.firstY) / d : 0;
  }

  public getValue(x: number): number {
    return this.firstY + this.gradient * (x - this.firstX);
  }

  public isLast(x: number): boolean {
    return x >= this.lastX;
  }

  public getLast(): number {
    return this.lastY;
  }
}

class BulletMLRunnerImpl {
  private act: BulletMLNode | null;
  private readonly node: BulletMLNode[];
  private actTurn = -1;
  private endTurn = 0;
  private actIte = 0;
  private end = false;

  private spd: number | null = null;
  private dir: number | null = null;
  private prevSpd: number | null = null;
  private prevDir: number | null = null;

  private changeDir: LinearFunc | null = null;
  private changeSpeed: LinearFunc | null = null;
  private accelX: LinearFunc | null = null;
  private accelY: LinearFunc | null = null;

  private parameters: number[] | null;

  private readonly repeatStack: Array<{ ite: number; end: number; act: BulletMLNode }> = [];
  private readonly refStack: Array<{ act: BulletMLNode; para: number[] | null }> = [];

  public constructor(
    private readonly state: BulletMLStateAsset,
    private readonly runner: BulletMLRunnerTS,
  ) {
    this.node = [...state.node];
    this.parameters = state.para;
    this.act = this.node[0] ?? null;
    for (const n of this.node) n.setParent(null);
  }

  public isEnd(): boolean {
    return this.end;
  }

  public run(): void {
    if (this.isEnd()) return;

    this.applyChanges();
    this.endTurn = this.runner.getTurn();

    if (!this.act) {
      if (!this.isTurnEnd()) {
        if (!this.changeDir && !this.changeSpeed && !this.accelX && !this.accelY) {
          this.end = true;
        }
      }
      return;
    }

    this.act = this.node[this.actIte] ?? null;
    if (this.actTurn === -1) this.actTurn = this.runner.getTurn();

    this.runSub();

    if (!this.act) {
      this.actIte++;
      this.act = this.node[this.actIte] ?? null;
    } else {
      this.node[this.actIte] = this.act;
    }
  }

  private runSub(): void {
    while (this.act && !this.isTurnEnd()) {
      let prev = this.act;
      this.dispatch(prev);

      if (!this.act && prev.getParent()?.name === NodeName.BULLETML) {
        const ref = this.refStack.pop();
        if (!ref) throw new Error("ref stack underflow");
        prev = ref.act;
        this.parameters = ref.para;
      }

      if (!this.act) this.act = prev.next();

      while (!this.act) {
        const parent = prev.getParent();
        if (parent?.name === NodeName.REPEAT) {
          const rep = this.repeatStack[this.repeatStack.length - 1];
          if (!rep) throw new Error("repeat stack underflow");
          rep.ite++;
          if (rep.ite < rep.end) {
            this.act = rep.act;
            break;
          }
          this.repeatStack.pop();
        }

        this.act = prev.getParent();
        if (!this.act) break;
        prev = this.act;

        if (this.act.getParent()?.name === NodeName.BULLETML) {
          const ref = this.refStack.pop();
          if (!ref) throw new Error("ref stack underflow");
          prev = ref.act;
          this.act = ref.act;
          this.parameters = ref.para;
        }

        this.act = this.act.next();
      }
    }
  }

  private dispatch(node: BulletMLNode): void {
    switch (node.name) {
      case NodeName.BULLET:
        this.runBullet();
        return;
      case NodeName.ACTION:
        this.runAction();
        return;
      case NodeName.FIRE:
        this.runFire();
        return;
      case NodeName.CHANGE_DIRECTION:
        this.runChangeDirection();
        return;
      case NodeName.CHANGE_SPEED:
        this.runChangeSpeed();
        return;
      case NodeName.ACCEL:
        this.runAccel();
        return;
      case NodeName.WAIT:
        this.runWait();
        return;
      case NodeName.REPEAT:
        this.runRepeat();
        return;
      case NodeName.BULLET_REF:
        this.runBulletRef();
        return;
      case NodeName.ACTION_REF:
        this.runActionRef();
        return;
      case NodeName.FIRE_REF:
        this.runFireRef();
        return;
      case NodeName.VANISH:
        this.runVanish();
        return;
      default:
        this.act = null;
    }
  }

  private runBullet(): void {
    if (!this.act) return;
    this.setSpeed();
    this.setDirection();
    if (this.spd == null) this.prevSpd = this.spd = this.runner.getDefaultSpeed();
    if (this.dir == null) this.prevDir = this.dir = this.runner.getAimDirection();

    if (!this.act.getChild(NodeName.ACTION) && !this.act.getChild(NodeName.ACTION_REF)) {
      this.runner.createSimpleBullet(this.dir, this.spd);
    } else {
      const acts: BulletMLNode[] = [];
      this.act.getAllChildrenVec(NodeName.ACTION, acts);
      this.act.getAllChildrenVec(NodeName.ACTION_REF, acts);
      this.runner.createBullet(new BulletMLStateAsset(this.state.bulletml, acts, this.parameters), this.dir, this.spd);
    }
    this.act = null;
  }

  private runFire(): void {
    if (!this.act) return;
    this.shotInit();
    this.setSpeed();
    this.setDirection();

    let bullet = this.act.getChild(NodeName.BULLET);
    if (!bullet) bullet = this.act.getChild(NodeName.BULLET_REF);
    if (!bullet) throw new Error("<fire> must have contents bullet or bulletRef");
    this.act = bullet;
  }

  private runAction(): void {
    if (!this.act) return;
    this.act = this.act.childBegin();
  }

  private runWait(): void {
    if (!this.act) return;
    this.doWait(Math.trunc(this.getNumberContents(this.act)));
    this.act = null;
  }

  private runRepeat(): void {
    if (!this.act) return;
    const timesNode = this.act.getChild(NodeName.TIMES);
    if (!timesNode) return;
    const timesNum = Math.trunc(this.getNumberContents(timesNode));

    let action = this.act.getChild(NodeName.ACTION);
    if (!action) action = this.act.getChild(NodeName.ACTION_REF);
    if (!action) throw new Error("repeat elem must have contents action or actionRef");

    this.repeatStack.push({ ite: 0, end: timesNum, act: action });
    this.act = action;
  }

  private runFireRef(): void {
    if (!this.act) return;
    const prevAct = this.act;
    const prevPara = this.parameters;
    this.parameters = this.getParameters();
    this.refStack.push({ act: prevAct, para: prevPara });
    this.act = this.state.bulletml.getFireRef(prevAct.refID);
  }

  private runActionRef(): void {
    if (!this.act) return;
    const prevAct = this.act;
    const prevPara = this.parameters;
    this.parameters = this.getParameters();
    this.refStack.push({ act: prevAct, para: prevPara });
    this.act = this.state.bulletml.getActionRef(prevAct.refID);
  }

  private runBulletRef(): void {
    if (!this.act) return;
    const prevAct = this.act;
    const prevPara = this.parameters;
    this.parameters = this.getParameters();
    this.refStack.push({ act: prevAct, para: prevPara });
    this.act = this.state.bulletml.getBulletRef(prevAct.refID);
  }

  private runChangeDirection(): void {
    if (!this.act) return;
    const termNode = this.act.getChild(NodeName.TERM);
    const dirNode = this.act.getChild(NodeName.DIRECTION);
    if (!termNode || !dirNode) {
      this.act = null;
      return;
    }
    const term = Math.trunc(this.getNumberContents(termNode));
    const type = dirNode.type;
    const dir = type !== NodeType.SEQUENCE ? this.getDirection(dirNode, false) : this.getNumberContents(dirNode);
    this.calcChangeDirection(dir, term, type === NodeType.SEQUENCE);
    this.act = null;
  }

  private runChangeSpeed(): void {
    if (!this.act) return;
    const termNode = this.act.getChild(NodeName.TERM);
    const speedNode = this.act.getChild(NodeName.SPEED);
    if (!termNode || !speedNode) {
      this.act = null;
      return;
    }
    const term = Math.trunc(this.getNumberContents(termNode));
    let speed: number;
    if (speedNode.type !== NodeType.SEQUENCE) {
      speed = this.getSpeed(speedNode);
    } else {
      speed = this.getNumberContents(speedNode) * term + this.runner.getBulletSpeed();
    }
    this.calcChangeSpeed(speed, term);
    this.act = null;
  }

  private runAccel(): void {
    if (!this.act) return;
    const termNode = this.act.getChild(NodeName.TERM);
    if (!termNode) {
      this.act = null;
      return;
    }
    const term = Math.trunc(this.getNumberContents(termNode));
    const hnode = this.act.getChild(NodeName.HORIZONTAL);
    const vnode = this.act.getChild(NodeName.VERTICAL);

    if (this.state.bulletml.isHorizontal()) {
      if (vnode) this.calcAccelX(this.getNumberContents(vnode), term, vnode.type);
      if (hnode) this.calcAccelY(-this.getNumberContents(hnode), term, hnode.type);
    } else {
      if (hnode) this.calcAccelX(this.getNumberContents(hnode), term, hnode.type);
      if (vnode) this.calcAccelY(this.getNumberContents(vnode), term, vnode.type);
    }
    this.act = null;
  }

  private runVanish(): void {
    this.runner.doVanish();
    this.act = null;
  }

  private applyChanges(): void {
    const now = this.runner.getTurn();

    if (this.changeDir) {
      if (this.changeDir.isLast(now)) {
        this.runner.doChangeDirection(this.changeDir.getLast());
        this.changeDir = null;
      } else {
        this.runner.doChangeDirection(this.changeDir.getValue(now));
      }
    }

    if (this.changeSpeed) {
      if (this.changeSpeed.isLast(now)) {
        this.runner.doChangeSpeed(this.changeSpeed.getLast());
        this.changeSpeed = null;
      } else {
        this.runner.doChangeSpeed(this.changeSpeed.getValue(now));
      }
    }

    if (this.accelX) {
      if (this.accelX.isLast(now)) {
        this.runner.doAccelX(this.accelX.getLast());
        this.accelX = null;
      } else {
        this.runner.doAccelX(this.accelX.getValue(now));
      }
    }

    if (this.accelY) {
      if (this.accelY.isLast(now)) {
        this.runner.doAccelY(this.accelY.getLast());
        this.accelY = null;
      } else {
        this.runner.doAccelY(this.accelY.getValue(now));
      }
    }
  }

  private isTurnEnd(): boolean {
    return this.end || this.actTurn > this.endTurn;
  }

  private doWait(frame: number): void {
    if (frame <= 0) return;
    this.actTurn += frame;
  }

  private shotInit(): void {
    this.spd = null;
    this.dir = null;
  }

  private setSpeed(): void {
    if (!this.act) return;
    const spd = this.act.getChild(NodeName.SPEED);
    if (!spd) return;
    this.spd = this.getSpeed(spd);
  }

  private setDirection(): void {
    if (!this.act) return;
    const dir = this.act.getChild(NodeName.DIRECTION);
    if (!dir) return;
    this.dir = this.getDirection(dir, true);
  }

  private getNumberContents(node: BulletMLNode): number {
    return node.getValue({
      rank: this.runner.getRank(),
      parameters: this.parameters,
      runner: this.runner,
    });
  }

  private getSpeed(spdNode: BulletMLNode): number {
    let spd = this.getNumberContents(spdNode);
    if (spdNode.type === NodeType.RELATIVE) {
      spd += this.runner.getBulletSpeed();
    } else if (spdNode.type === NodeType.SEQUENCE) {
      if (this.prevSpd == null) spd = 1;
      else spd += this.prevSpd;
    }
    this.prevSpd = spd;
    return spd;
  }

  private getDirection(dirNode: BulletMLNode, prevChange: boolean): number {
    let dir = this.getNumberContents(dirNode);
    let isDefault = true;

    if (dirNode.type !== NodeType.NONE) {
      isDefault = false;
      if (dirNode.type === NodeType.ABSOLUTE) {
        if (this.state.bulletml.isHorizontal()) dir -= 90;
      } else if (dirNode.type === NodeType.RELATIVE) {
        dir += this.runner.getBulletDirection();
      } else if (dirNode.type === NodeType.SEQUENCE) {
        if (this.prevDir == null) {
          dir = 0;
          isDefault = true;
        } else {
          dir += this.prevDir;
        }
      } else {
        isDefault = true;
      }
    }

    if (isDefault) dir += this.runner.getAimDirection();

    while (dir > 360) dir -= 360;
    while (dir < 0) dir += 360;

    if (prevChange) this.prevDir = dir;
    return dir;
  }

  private calcChangeDirection(direction: number, term: number, seq: boolean): void {
    const finalTurn = this.actTurn + term;
    const dirFirst = this.runner.getBulletDirection();

    if (seq) {
      this.changeDir = new LinearFunc(this.actTurn, finalTurn, dirFirst, dirFirst + direction * term);
      return;
    }

    const dirSpace1 = direction - dirFirst;
    const dirSpace2 = dirSpace1 > 0 ? dirSpace1 - 360 : dirSpace1 + 360;
    const dirSpace = Math.abs(dirSpace1) < Math.abs(dirSpace2) ? dirSpace1 : dirSpace2;
    this.changeDir = new LinearFunc(this.actTurn, finalTurn, dirFirst, dirFirst + dirSpace);
  }

  private calcChangeSpeed(speed: number, term: number): void {
    const finalTurn = this.actTurn + term;
    const spdFirst = this.runner.getBulletSpeed();
    this.changeSpeed = new LinearFunc(this.actTurn, finalTurn, spdFirst, speed);
  }

  private calcAccelX(vertical: number, term: number, type: NodeType): void {
    const finalTurn = this.actTurn + term;
    const firstSpd = this.runner.getBulletSpeedX();
    let finalSpd: number;
    if (type === NodeType.SEQUENCE) {
      finalSpd = firstSpd + vertical * term;
    } else if (type === NodeType.RELATIVE) {
      finalSpd = firstSpd + vertical;
    } else {
      finalSpd = vertical;
    }
    this.accelX = new LinearFunc(this.actTurn, finalTurn, firstSpd, finalSpd);
  }

  private calcAccelY(horizontal: number, term: number, type: NodeType): void {
    const finalTurn = this.actTurn + term;
    const firstSpd = this.runner.getBulletSpeedY();
    let finalSpd: number;
    if (type === NodeType.SEQUENCE) {
      finalSpd = firstSpd + horizontal * term;
    } else if (type === NodeType.RELATIVE) {
      finalSpd = firstSpd + horizontal;
    } else {
      finalSpd = horizontal;
    }
    this.accelY = new LinearFunc(this.actTurn, finalTurn, firstSpd, finalSpd);
  }

  private getParameters(): number[] | null {
    if (!this.act) return null;
    let para: number[] | null = null;
    for (const node of this.act.childList()) {
      if (node.name !== NodeName.PARAM) continue;
      if (!para) para = [0];
      para.push(this.getNumberContents(node));
    }
    return para;
  }
}

class BulletMLRunnerTS implements BulletMLRunner {
  public callbacks: RunnerCallbackMap = {};
  public end = false;
  private readonly impl: BulletMLRunnerImpl[] = [];

  public constructor(source: BulletMLParserTS | BulletMLStateAsset) {
    if (source instanceof BulletMLStateAsset) {
      this.impl.push(new BulletMLRunnerImpl(source, this));
      return;
    }
    for (const a of source.getTopActions()) {
      this.impl.push(new BulletMLRunnerImpl(new BulletMLStateAsset(source, [a], null), this));
    }
  }

  public run(): void {
    if (this.end) return;
    for (const i of this.impl) i.run();
  }

  public isEnd(): boolean {
    if (this.end) return true;
    for (const i of this.impl) {
      if (!i.isEnd()) return false;
    }
    return this.impl.length > 0;
  }

  public getBulletDirection(): number {
    return this.callNumber("getBulletDirection", 0);
  }

  public getAimDirection(): number {
    return this.callNumber("getAimDirection", 0);
  }

  public getBulletSpeed(): number {
    return this.callNumber("getBulletSpeed", 0);
  }

  public getDefaultSpeed(): number {
    return this.callNumber("getDefaultSpeed", 1);
  }

  public getRank(): number {
    return this.callNumber("getRank", 0);
  }

  public createSimpleBullet(direction: number, speed: number): void {
    this.callVoid("createSimpleBullet", direction, speed);
  }

  public createBullet(state: BulletMLStateAsset, direction: number, speed: number): void {
    this.callVoid("createBullet", state as unknown as BulletMLState, direction, speed);
  }

  public getTurn(): number {
    return Math.trunc(this.callNumber("getTurn", 0));
  }

  public doVanish(): void {
    this.callVoid("doVanish");
  }

  public doChangeDirection(v: number): void {
    this.callVoid("doChangeDirection", v);
  }

  public doChangeSpeed(v: number): void {
    this.callVoid("doChangeSpeed", v);
  }

  public doAccelX(v: number): void {
    this.callVoid("doAccelX", v);
  }

  public doAccelY(v: number): void {
    this.callVoid("doAccelY", v);
  }

  public getBulletSpeedX(): number {
    return this.callNumber("getBulletSpeedX", 0);
  }

  public getBulletSpeedY(): number {
    return this.callNumber("getBulletSpeedY", 0);
  }

  public getRand(): number {
    return this.callNumber("getRand", Math.random());
  }

  private callNumber(name: string, fallback: number): number {
    const fn = this.callbacks[name];
    if (!fn) return fallback;
    const v = fn(this);
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  }

  private callVoid(name: string, ...args: unknown[]): void {
    const fn = this.callbacks[name];
    if (!fn) return;
    fn(this, ...args);
  }
}

export class BulletMLParserAsset {
  public readonly name: string;
  public readonly url: string;
  public readonly inlineXmlText: string | null;

  private parser: BulletMLParserTS | null = null;
  private preloadPromise: Promise<void> | null = null;

  public constructor(name: string, url: string, inlineXmlText: string | null = null) {
    this.name = name;
    this.url = url;
    this.inlineXmlText = inlineXmlText;
  }

  public async preload(): Promise<void> {
    if (this.parser) return;
    if (!this.preloadPromise) {
      this.preloadPromise = (async () => {
        let xml = this.inlineXmlText;
        if (xml == null) {
          const res = await fetch(this.url);
          if (!res.ok) throw new Error(`Unable to load BulletML: ${this.url}`);
          xml = await res.text();
        }
        const p = new BulletMLParserTS(this.name);
        p.parse(xml);
        this.parser = p;
      })();
    }
    await this.preloadPromise;
  }

  public createRunner(): BulletMLRunner {
    if (!this.parser) {
      // D source fallback is not present. Runtime must preload xml before use.
      // Original C++ source equivalent has synchronous parser object creation:
      //   parser = BulletMLParserTinyXML_new(path);
      //   BulletMLParserTinyXML_parse(parser);
      throw new Error(`BulletML parser is not loaded yet: ${this.name}`);
    }
    return new BulletMLRunnerTS(this.parser);
  }
}

function compileFormula(expr: string): FormulaFn {
  const tokens = tokenizeFormula(expr);
  let idx = 0;

  function parsePrimary(): FormulaFn {
    const t = tokens[idx++];
    if (!t) return () => 0;
    if (t.type === "num") {
      const n = t.value;
      return () => n;
    }
    if (t.type === "var") {
      if (t.value === "rand") return (v) => v.runner.getRand();
      if (t.value === "rank") return (v) => v.rank;
      const id = Number.parseInt(t.value, 10);
      return (v) => {
        if (!Number.isFinite(id)) return 1;
        if (!v.parameters || id < 0 || id >= v.parameters.length) return 1;
        return v.parameters[id];
      };
    }
    if (t.type === "op" && t.value === "(") {
      const e = parseExpression();
      const close = tokens[idx++];
      if (!close || close.type !== "op" || close.value !== ")") throw new Error("formula: missing ')' ");
      return e;
    }
    if (t.type === "op" && t.value === "-") {
      const rhs = parsePrimary();
      return (v) => -rhs(v);
    }
    throw new Error(`formula: invalid token ${t.value}`);
  }

  function parseMulDiv(): FormulaFn {
    let lhs = parsePrimary();
    while (idx < tokens.length) {
      const t = tokens[idx];
      if (!t || t.type !== "op" || (t.value !== "*" && t.value !== "/")) break;
      idx++;
      const rhs = parsePrimary();
      const prev = lhs;
      if (t.value === "*") lhs = (v) => prev(v) * rhs(v);
      else lhs = (v) => prev(v) / rhs(v);
    }
    return lhs;
  }

  function parseExpression(): FormulaFn {
    let lhs = parseMulDiv();
    while (idx < tokens.length) {
      const t = tokens[idx];
      if (!t || t.type !== "op" || (t.value !== "+" && t.value !== "-")) break;
      idx++;
      const rhs = parseMulDiv();
      const prev = lhs;
      if (t.value === "+") lhs = (v) => prev(v) + rhs(v);
      else lhs = (v) => prev(v) - rhs(v);
    }
    return lhs;
  }

  if (tokens.length === 0) return () => 0;
  const fn = parseExpression();
  if (idx < tokens.length) {
    throw new Error(`formula: trailing token ${tokens[idx].value}`);
  }
  return fn;
}

type FormulaToken =
  | { type: "num"; value: number }
  | { type: "var"; value: string }
  | { type: "op"; value: string };

function tokenizeFormula(expr: string): FormulaToken[] {
  const out: FormulaToken[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch >= "0" && ch <= "9" || ch === ".") {
      let j = i + 1;
      while (j < expr.length) {
        const c = expr[j];
        if ((c >= "0" && c <= "9") || c === ".") j++;
        else break;
      }
      out.push({ type: "num", value: Number.parseFloat(expr.slice(i, j)) });
      i = j;
      continue;
    }
    if (ch === "$") {
      let j = i + 1;
      while (j < expr.length) {
        const c = expr[j];
        if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_") j++;
        else break;
      }
      const sym = expr.slice(i + 1, j);
      out.push({ type: "var", value: sym });
      i = j;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      out.push({ type: "op", value: ch });
      i++;
      continue;
    }
    throw new Error(`formula: unsupported character '${ch}'`);
  }
  return out;
}
