'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OPENING_NOTICE_LIMITS, OPENING_NOTICE_TURNSTILE_ACTION, type OpeningNoticeError } from '@/lib/opening-notice';
import { notifyCopy, OPENING_NOTICE_CONTACT, type NotifyLocale } from './notify-copy';

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type Turnstile = {
    render(element: HTMLElement, options: Record<string, unknown>): string;
    reset(widgetId: string): void;
    remove(widgetId: string): void;
};

let turnstileScript: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
    const existing = (window as { turnstile?: Turnstile }).turnstile;
    if (existing) return Promise.resolve(existing);
    turnstileScript ??= new Promise<Turnstile>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = TURNSTILE_SCRIPT;
        script.async = true;
        script.onload = () => {
            const loaded = (window as { turnstile?: Turnstile }).turnstile;
            if (loaded) resolve(loaded); else reject(new Error('turnstile_missing'));
        };
        script.onerror = () => { turnstileScript = null; reject(new Error('turnstile_load_failed')); };
        document.head.appendChild(script);
    });
    return turnstileScript;
}

const ERROR_CODES: readonly OpeningNoticeError[] = ['invalid_request', 'consent_required', 'verification_failed', 'rate_limited', 'unavailable'];

function errorCode(value: unknown): OpeningNoticeError {
    const code = value && typeof value === 'object' ? (value as { error?: unknown }).error : null;
    return ERROR_CODES.find((known) => known === code) ?? 'unavailable';
}

export function OpeningNoticeForm({ locale, siteKey }: { locale: NotifyLocale; siteKey: string | null }) {
    const copy = notifyCopy[locale];
    const widgetElement = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
    const [error, setError] = useState<OpeningNoticeError | 'verification_pending' | null>(null);

    useEffect(() => {
        if (!siteKey || state === 'sent') return;
        let cancelled = false;
        loadTurnstile().then((turnstile) => {
            if (cancelled || !widgetElement.current || widgetId.current) return;
            widgetId.current = turnstile.render(widgetElement.current, {
                sitekey: siteKey,
                action: OPENING_NOTICE_TURNSTILE_ACTION,
                language: locale,
                theme: 'dark',
                callback: (value: string) => setToken(value),
                'expired-callback': () => setToken(null),
                'error-callback': () => setToken(null),
            });
        }).catch(() => { if (!cancelled) setError('unavailable'); });
        return () => {
            cancelled = true;
            if (widgetId.current) (window as { turnstile?: Turnstile }).turnstile?.remove(widgetId.current);
            widgetId.current = null;
        };
    }, [siteKey, locale, state]);

    if (!siteKey) {
        return (
            <p className="rounded-xl border border-white/10 bg-zinc-950 p-5 text-sm leading-relaxed text-zinc-300">
                {copy.unavailable} <a className="text-emerald-300" href={`mailto:${OPENING_NOTICE_CONTACT}`}>{OPENING_NOTICE_CONTACT}</a>
            </p>
        );
    }

    if (state === 'sent') {
        return (
            <div role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-6">
                <h2 className="text-xl font-bold text-white">{copy.sent.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">{copy.sent.body}</p>
            </div>
        );
    }

    async function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!token) { setError('verification_pending'); return; }
        const form = new FormData(event.currentTarget);
        setState('sending');
        setError(null);
        try {
            const response = await fetch('/api/opening-notices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    locale,
                    email: form.get('email'),
                    consent: form.get('consent') === 'on',
                    turnstileToken: token,
                }),
            });
            if (response.ok) { setState('sent'); return; }
            setError(errorCode(await response.json().catch(() => null)));
        } catch {
            setError('unavailable');
        }
        // A Turnstile token is single-use: get a fresh one before the next attempt.
        setToken(null);
        if (widgetId.current) (window as { turnstile?: Turnstile }).turnstile?.reset(widgetId.current);
        setState('idle');
    }

    const sending = state === 'sending';
    return (
        <form onSubmit={onSubmit} className="space-y-6">
            <div>
                <label htmlFor="notify-email" className="mb-2 block text-sm font-semibold text-zinc-200">{copy.email}</label>
                <Input id="notify-email" name="email" type="email" required maxLength={OPENING_NOTICE_LIMITS.email} autoComplete="email" className="border-white/15 bg-black text-white" />
            </div>
            <label className="flex gap-3 text-sm leading-relaxed text-zinc-300">
                <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 shrink-0 accent-emerald-400" />
                <span>{copy.consent} <Link href="/privacy#opening-notices" className="text-emerald-300">{copy.privacyLink}</Link></span>
            </label>
            <div ref={widgetElement} />
            {error && <p role="alert" className="text-sm text-red-300">{copy.errors[error]}</p>}
            <Button type="submit" size="lg" disabled={sending} className="w-full rounded-full bg-white px-8 py-6 text-base font-bold text-black hover:bg-zinc-200 sm:w-auto">
                {sending ? <><Loader2 aria-hidden="true" className="animate-spin" />{copy.sending}</> : copy.submit}
            </Button>
        </form>
    );
}
