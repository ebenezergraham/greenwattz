import { Injectable, signal } from '@angular/core';
import { FIREBASE_CONFIG } from './firebase-config';
import { SAVE_LIMITS, SaveKind, buildSave, isEmail } from './saves';
import type { Client, RemoteSave, RemoteUser } from './firebase-sdk';

const HINT = 'gw.account';
const EMAIL = 'gw.email';

const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ } };

/**
 * Optional accounts. A visitor can sign in with an email link and save plans and quote comparisons to their account.
 * The Firebase SDK loads only when someone signs in, or when this browser signed in before (a small marker tells us so).
 * Visitors who never sign in never load it and nothing is stored for them.
 */
@Injectable({ providedIn: 'root' })
export class Account {
  readonly enabled = !!FIREBASE_CONFIG.apiKey;
  readonly user = signal<RemoteUser | null>(null);
  /** False only while a returning visitor's session is being restored. */
  readonly ready = signal(true);
  readonly saves = signal<RemoteSave[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly linkSentTo = signal('');
  /** They came back through a sign-in link on a device that does not know their email, so we ask for it. */
  readonly needEmail = signal(false);

  private client: Promise<Client> | null = null;
  private listening = false;

  private connect(): Promise<Client> {
    this.client ??= import('./firebase-sdk').then((m) => m.createClient());
    return this.client;
  }

  private async listen() {
    if (this.listening) return;
    this.listening = true;
    const c = await this.connect();
    c.onUser((u) => {
      this.user.set(u);
      this.ready.set(true);
      if (u) { write(HINT, '1'); void this.refresh(); } else { this.saves.set([]); }
    });
  }

  /** Bring back a session only if this browser signed in before. Nothing loads for anyone else. */
  restore() {
    if (!this.enabled || this.listening) return;
    if (read(HINT)) { this.ready.set(false); void this.listen().catch(() => this.ready.set(true)); }
  }

  /** Called by the account page: finish a sign-in if the visitor arrived through an emailed link. */
  async handleReturn(href: string = location.href) {
    if (!this.enabled || !/[?&]oobCode=/.test(href)) { this.restore(); return; }
    this.busy.set(true); this.error.set('');
    try {
      await this.listen();
      const c = await this.connect();
      if (!c.isLink(href)) { this.error.set('That sign-in link is not valid. Ask for a new one.'); return; }
      const email = read(EMAIL);
      if (!email) { this.needEmail.set(true); return; }
      await this.finish(c, email, href);
    } catch (e) {
      this.error.set(this.friendly(e));
    } finally {
      this.busy.set(false);
    }
  }

  async confirmEmail(email: string, href: string = location.href) {
    if (!isEmail(email)) { this.error.set('Enter the email address the link was sent to.'); return; }
    this.busy.set(true); this.error.set('');
    try { await this.finish(await this.connect(), email.trim(), href); } catch (e) { this.error.set(this.friendly(e)); } finally { this.busy.set(false); }
  }

  private async finish(c: Client, email: string, href: string) {
    await c.completeLink(email, href);
    write(EMAIL, null); write(HINT, '1');
    this.needEmail.set(false);
    try { history.replaceState({}, '', '/account'); } catch { /* ignore */ }
  }

  /** Email a one-time sign-in link. No password is involved. */
  async sendLink(email: string) {
    if (!this.enabled) return;
    if (!isEmail(email)) { this.error.set('Enter a valid email address.'); return; }
    this.busy.set(true); this.error.set('');
    try {
      const c = await this.connect();
      await this.listen();
      await c.sendLink(email.trim(), `${location.origin}/account`);
      write(EMAIL, email.trim());
      this.linkSentTo.set(email.trim());
    } catch (e) {
      this.error.set(this.friendly(e));
    } finally {
      this.busy.set(false);
    }
  }

  async signOut() {
    const c = await this.connect();
    await c.signOut();
    write(HINT, null);
    this.user.set(null); this.saves.set([]); this.linkSentTo.set('');
  }

  async refresh() {
    const u = this.user();
    if (!u) return;
    try { this.saves.set(await (await this.connect()).list(u.uid)); } catch (e) { this.error.set(this.friendly(e)); }
  }

  /** Save a plan or a quote comparison to the account. Returns the name it was saved under. */
  async save(kind: SaveKind, name: string, dataJson: string): Promise<string> {
    const u = this.user();
    if (!u) throw new Error('Sign in to save.');
    const payload = buildSave(kind, name, dataJson);
    if (this.saves().length >= SAVE_LIMITS.perAccount) throw new Error(`You have ${SAVE_LIMITS.perAccount} saved items. Delete one to save another.`);
    this.busy.set(true);
    try {
      await (await this.connect()).add(u.uid, payload);
      await this.refresh();
      return payload.name;
    } catch (e) {
      throw new Error(this.friendly(e));
    } finally {
      this.busy.set(false);
    }
  }

  async remove(id: string) {
    const u = this.user();
    if (!u) return;
    this.busy.set(true);
    try { await (await this.connect()).remove(u.uid, id); await this.refresh(); } catch (e) { this.error.set(this.friendly(e)); } finally { this.busy.set(false); }
  }

  /** Delete every saved item and the sign-in record. */
  async deleteAccount() {
    const u = this.user();
    if (!u) return;
    this.busy.set(true); this.error.set('');
    try {
      await (await this.connect()).deleteEverything(u.uid);
      write(HINT, null); write(EMAIL, null);
      this.user.set(null); this.saves.set([]);
    } catch (e) {
      this.error.set(this.friendly(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** Plain words for the errors a visitor can hit. */
  friendly(e: unknown): string {
    const code = (e as { code?: string })?.code ?? '';
    if (/requires-recent-login/.test(code)) return 'For your safety, sign in again with a fresh link, then try this again.';
    if (/invalid-email/.test(code)) return 'That email address does not look right.';
    if (/expired-action-code|invalid-action-code/.test(code)) return 'That sign-in link has expired or was already used. Ask for a new one.';
    if (/too-many-requests/.test(code)) return 'Too many tries. Wait a few minutes and try again.';
    if (/network/.test(code)) return 'We could not reach the sign-in service. Check your connection and try again.';
    if (/permission-denied/.test(code)) return 'That was not allowed. Sign in again and retry.';
    if (/operation-not-allowed|configuration-not-found/.test(code)) return 'Sign-in is not switched on yet. Please try again later.';
    return e instanceof Error && !code ? e.message : 'Something went wrong. Please try again.';
  }
}
