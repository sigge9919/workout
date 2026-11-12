/**
 * Håller skärmen tänd under sessionen. Wake Lock släpps automatiskt när
 * sidan döljs, så vi tar tillbaka den när appen blir synlig igen.
 */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;

  static get supported(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }

  async acquire(): Promise<boolean> {
    this.wanted = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    return this.request();
  }

  async release(): Promise<void> {
    this.wanted = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    const s = this.sentinel;
    this.sentinel = null;
    try {
      await s?.release();
    } catch {
      /* redan släppt */
    }
  }

  private onVisibility = () => {
    if (this.wanted && document.visibilityState === 'visible' && (!this.sentinel || this.sentinel.released)) {
      void this.request();
    }
  };

  private async request(): Promise<boolean> {
    if (!ScreenWakeLock.supported) return false;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      return true;
    } catch {
      return false;
    }
  }
}
