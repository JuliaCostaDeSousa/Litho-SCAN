class Transfer {
  private _file: Blob | null = null;
  set(file: Blob) { this._file = file; }
  take(): Blob | null { const f = this._file; this._file = null; return f; }
}
export const TransferStore = new Transfer();