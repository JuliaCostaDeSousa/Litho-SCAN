export type Stashed = Blob | File | null;

class Transfer {
  private _v: Stashed = null;
  set(v: Stashed) { this._v = v; }
  take(): Stashed { const v = this._v; this._v = null; return v; }
  peek(): Stashed { return this._v; }        // <-- nouveau
  clear() { this._v = null; }
}

export const TransferStore = new Transfer();