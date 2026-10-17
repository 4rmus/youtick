'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    CREATOR_APPLICATION_LIMITS,
    CREATOR_APPLICATION_TURNSTILE_ACTION,
    CREATOR_WORK_TYPES,
    type CreatorApplicationError,
    type CreatorWorkType,
} from '@/lib/creator-application';
import { applyCopy, CREATOR_APPLICATION_CONTACT, type ApplyLocale } from './apply-copy';

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type Turnstile = {
    render(element: HTMLElement, options: Record<string, unknown>): string;
    reset(widgetId: string): void;
    remove(widgetId: string): void;
};

declare global {
    interface Window { turnstile?: Turnstile }
}

let turnstileScript: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    turnstileScript ??= new Promise<Turnstile>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = TURNSTILE_SCRIPT;
        script.async = true;
        script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile_missing')));
        script.onerror = () => { turnstileScript = null; reject(new Error('turnstile_load_failed')); };
        document.head.appendChild(script);
    });
    return turnstileScript;
}

const ERROR_CODES: readonly CreatorApplicationError[] = ['invalid_request', 'consent_required', 'verification_failed', 'rate_limited', 'unavailable'];

function errorCode(value: unknown): CreatorApplicationError {
    const code = value && typeof value === 'object' ? (value as { error?: unknown }).error : null;
    return ERROR_CODES.find((known) => known === code) ?? 'unavailable';
}

const fieldClass = 'border-white/15 bg-black text-white';
const labelClass = 'mb-2 block text-sm font-semibold text-zinc-200';
const hintClass = 'mt-1 text-xs text-zinc-500';

/** The site key is a build-time public value; without it the page shows the e-mail fallback instead of the form. */
export function CreatorApplicationForm({ locale, siteKey }: { locale: ApplyLocale; siteKey: string | null }) {
    const copy = applyCopy[locale];
    const widgetElement = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
    const [error, setError] = useState<CreatorApplicationError | 'verification_pending' | null>(null);
    const [workType, setWorkType] = useState<CreatorWorkType>('concert');

    useEffect(() => {
        if (!siteKey || state === 'sent') return;
        let cancelled = false;
        loadTurnstile().then((turnstile) => {
            if (cancelled || !widgetElement.current || widgetId.current) return;
            widgetId.current = turnstile.render(widgetElement.current, {
                sitekey: siteKey,
                action: CREATOR_APPLICATION_TURNSTILE_ACTION,
                language: locale,
                theme: 'dark',
                callback: (value: string) => setToken(value),
                'expired-callback': () => setToken(null),
                'error-callback': () => setToken(null),
            });
        }).catch(() => { if (!cancelled) setError('unavailable'); });
        return () => {
            cancelled = true;
            if (widgetId.current) window.turnstile?.remove(widgetId.current);
            widgetId.current = null;
        };
    }, [siteKey, locale, state]);

    if (!siteKey) {
        return (
            <p className="rounded-xl border border-white/10 bg-zinc-950 p-5 text-sm leading-relaxed text-zinc-300">
                {copy.unavailable} <a className="text-emerald-300" href={`mailto:${CREATOR_APPLICATION_CONTACT}`}>{CREATOR_APPLICATION_CONTACT}</a>
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
            const response = await fetch('/api/creator-applications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    locale,
                    name: form.get('name'),
                    email: form.get('email'),
                    country: form.get('country'),
                    workLink: form.get('workLink'),
                    workType,
                    plannedRelease: form.get('plannedRelease'),
                    message: form.get('message'),
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
        if (widgetId.current) window.turnstile?.reset(widgetId.current);
        setState('idle');
    }

    const sending = state === 'sending';
    return (
        <form onSubmit={onSubmit} className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
                <div>
                    <label htmlFor="apply-name" className={labelClass}>{copy.fields.name}</label>
                    <Input id="apply-name" name="name" required maxLength={CREATOR_APPLICATION_LIMITS.name} autoComplete="name" className={fieldClass} />
                </div>
                <div>
                    <label htmlFor="apply-email" className={labelClass}>{copy.fields.email}</label>
                    <Input id="apply-email" name="email" type="email" required maxLength={CREATOR_APPLICATION_LIMITS.email} autoComplete="email" className={fieldClass} />
                </div>
                <div>
                    <label htmlFor="apply-country" className={labelClass}>{copy.fields.country}</label>
                    <Input id="apply-country" name="country" required maxLength={CREATOR_APPLICATION_LIMITS.country} autoComplete="country-name" className={fieldClass} />
                </div>
                <div>
                    <label htmlFor="apply-work-type" className={labelClass}>{copy.fields.workType}</label>
                    <select
                        id="apply-work-type"
                        value={workType}
                        onChange={(event) => setWorkType(event.target.value as CreatorWorkType)}
                        className="flex min-h-10 w-full rounded-md border border-white/15 bg-black px-3 py-2 text-base text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green md:text-sm"
                    >
                        {CREATOR_WORK_TYPES.map((type) => <option key={type} value={type}>{copy.workTypes[type]}</option>)}
                    </select>
                </div>
            </div>
            <div>
                <label htmlFor="apply-work-link" className={labelClass}>{copy.fields.workLink}</label>
                <Input id="apply-work-link" name="workLink" type="url" required pattern="https://.*" maxLength={CREATOR_APPLICATION_LIMITS.workLink} placeholder="https://" className={fieldClass} aria-describedby="apply-work-link-hint" />
                <p id="apply-work-link-hint" className={hintClass}>{copy.fields.workLinkHint}</p>
            </div>
            <div>
                <label htmlFor="apply-planned" className={labelClass}>{copy.fields.plannedRelease} <span className="font-normal text-zinc-500">({copy.fields.optional})</span></label>
                <Input id="apply-planned" name="plannedRelease" maxLength={CREATOR_APPLICATION_LIMITS.plannedRelease} className={fieldClass} aria-describedby="apply-planned-hint" />
                <p id="apply-planned-hint" className={hintClass}>{copy.fields.plannedReleaseHint}</p>
            </div>
            <div>
                <label htmlFor="apply-message" className={labelClass}>{copy.fields.message} <span className="font-normal text-zinc-500">({copy.fields.optional})</span></label>
                <textarea
                    id="apply-message"
                    name="message"
                    rows={5}
                    maxLength={CREATOR_APPLICATION_LIMITS.message}
                    aria-describedby="apply-message-hint"
                    className="flex w-full rounded-md border border-white/15 bg-black px-3 py-2 text-base text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green md:text-sm"
                />
                <p id="apply-message-hint" className={hintClass}>{copy.fields.messageHint}</p>
            </div>
            <label className="flex gap-3 text-sm leading-relaxed text-zinc-300">
                <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 shrink-0 accent-emerald-400" />
                <span>{copy.consent} <Link href="/privacy" className="text-emerald-300">{copy.privacyLink}</Link></span>
            </label>
            <div ref={widgetElement} />
            {error && <p role="alert" className="text-sm text-red-300">{copy.errors[error]}</p>}
            <Button type="submit" size="lg" disabled={sending} className="w-full rounded-full bg-white px-8 py-6 text-base font-bold text-black hover:bg-zinc-200 sm:w-auto">
                {sending ? <><Loader2 aria-hidden="true" className="animate-spin" />{copy.sending}</> : copy.submit}
            </Button>
        </form>
    );
}
