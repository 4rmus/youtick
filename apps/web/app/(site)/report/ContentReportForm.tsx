'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { COMPANY } from '@/components/legal/legal-facts';
import {
    CONTENT_REPORT_LIMITS,
    CONTENT_REPORT_REASONS,
    CONTENT_REPORT_TURNSTILE_ACTION,
    REASON_LABELS,
    type ContentReportError,
    type ContentReporterRole,
    type ContentReportReason,
} from '@/lib/content-report';

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

const ROLE_LABELS: Record<ContentReporterRole, string> = {
    rights_holder: 'I own rights in the content, or act for someone who does',
    viewer: 'I watched or saw the content',
    other: 'Something else',
};

const ERRORS: Record<ContentReportError | 'verification_pending', string> = {
    invalid_request: 'Please check the fields: every required field must be filled in, the link must start with https://, and the report needs at least 20 characters. Rights holders must name the right concerned.',
    declaration_required: 'Please tick the declaration.',
    verification_failed: 'The security check did not pass. Please try again.',
    verification_pending: 'Please wait for the security check to finish.',
    rate_limited: 'Too many attempts. Please wait a minute and try again.',
    unavailable: `The report could not be sent. Please try again later or email ${COMPANY.reportsEmail}.`,
};
const ERROR_CODES = Object.keys(ERRORS) as (ContentReportError | 'verification_pending')[];

const fieldClass = 'border-white/15 bg-black text-white';
const labelClass = 'mb-2 block text-sm font-semibold text-zinc-200';
const hintClass = 'mt-1 text-xs text-zinc-500';
const selectClass = 'flex min-h-10 w-full rounded-md border border-white/15 bg-black px-3 py-2 text-base text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green md:text-sm';

/** Without the build-time site key the page shows the e-mail address instead of the form. */
export function ContentReportForm({ siteKey }: { siteKey: string | null }) {
    const widgetElement = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
    const [error, setError] = useState<ContentReportError | 'verification_pending' | null>(null);
    const [role, setRole] = useState<ContentReporterRole>('viewer');
    const [reason, setReason] = useState<ContentReportReason>('illegal');

    useEffect(() => {
        if (!siteKey || state === 'sent') return;
        let cancelled = false;
        loadTurnstile().then((turnstile) => {
            if (cancelled || !widgetElement.current || widgetId.current) return;
            widgetId.current = turnstile.render(widgetElement.current, {
                sitekey: siteKey,
                action: CONTENT_REPORT_TURNSTILE_ACTION,
                language: 'en',
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
    }, [siteKey, state]);

    if (!siteKey) {
        return <p className="rounded-xl border border-white/10 bg-zinc-950 p-5 text-sm leading-relaxed text-zinc-300">
            The report form is not open yet. Please email your report, with the details listed above, to{' '}
            <a className="text-emerald-300" href={`mailto:${COMPANY.reportsEmail}`}>{COMPANY.reportsEmail}</a>.
        </p>;
    }

    if (state === 'sent') {
        return <div role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-6">
            <h2 className="text-xl font-bold text-white">Report received</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">Thank you. A person reads every report. We reply by email when we need more information and when we have decided.</p>
        </div>;
    }

    async function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!token) { setError('verification_pending'); return; }
        const form = new FormData(event.currentTarget);
        setState('sending');
        setError(null);
        try {
            const response = await fetch('/api/content-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role, reason,
                    name: form.get('name'),
                    email: form.get('email'),
                    contentLink: form.get('contentLink'),
                    rightsDetails: form.get('rightsDetails'),
                    details: form.get('details'),
                    declaration: form.get('declaration') === 'on',
                    turnstileToken: token,
                }),
            });
            if (response.ok) { setState('sent'); return; }
            const body = await response.json().catch(() => null) as { error?: unknown } | null;
            setError(ERROR_CODES.find((code) => code === body?.error) ?? 'unavailable');
        } catch {
            setError('unavailable');
        }
        // A Turnstile token is single-use: get a fresh one before the next attempt.
        setToken(null);
        if (widgetId.current) (window as { turnstile?: Turnstile }).turnstile?.reset(widgetId.current);
        setState('idle');
    }

    const rightsClaim = role === 'rights_holder' && (reason === 'copyright' || reason === 'other_rights');
    return <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
            <div>
                <label htmlFor="report-role" className={labelClass}>Who are you?</label>
                <select id="report-role" value={role} onChange={(event) => setRole(event.target.value as ContentReporterRole)} className={selectClass}>
                    {(Object.keys(ROLE_LABELS) as ContentReporterRole[]).map((value) => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="report-reason" className={labelClass}>What is the problem?</label>
                <select id="report-reason" value={reason} onChange={(event) => setReason(event.target.value as ContentReportReason)} className={selectClass}>
                    {CONTENT_REPORT_REASONS.map((value) => <option key={value} value={value}>{REASON_LABELS[value]}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="report-name" className={labelClass}>Your name</label>
                <Input id="report-name" name="name" required maxLength={CONTENT_REPORT_LIMITS.name} autoComplete="name" className={fieldClass} />
            </div>
            <div>
                <label htmlFor="report-email" className={labelClass}>Your email</label>
                <Input id="report-email" name="email" type="email" required maxLength={CONTENT_REPORT_LIMITS.email} autoComplete="email" className={fieldClass} />
            </div>
        </div>
        <div>
            <label htmlFor="report-link" className={labelClass}>Link to the content on youtick</label>
            <Input id="report-link" name="contentLink" type="url" required pattern="https://.*" maxLength={CONTENT_REPORT_LIMITS.contentLink} placeholder="https://" className={fieldClass} />
        </div>
        <div>
            <label htmlFor="report-rights" className={labelClass}>The right concerned {rightsClaim ? '' : <span className="font-normal text-zinc-500">(rights holders)</span>}</label>
            <textarea id="report-rights" name="rightsDetails" rows={3} required={rightsClaim} maxLength={CONTENT_REPORT_LIMITS.rightsDetails} aria-describedby="report-rights-hint" className={selectClass} />
            <p id="report-rights-hint" className={hintClass}>The work or right you own, with a link to the original if there is one. If you act for the rights holder, say whom you act for.</p>
        </div>
        <div>
            <label htmlFor="report-details" className={labelClass}>What is wrong, and where</label>
            <textarea id="report-details" name="details" rows={6} required minLength={CONTENT_REPORT_LIMITS.detailsMin} maxLength={CONTENT_REPORT_LIMITS.details} aria-describedby="report-details-hint" className={selectClass} />
            <p id="report-details-hint" className={hintClass}>Explain why the content is not allowed and, for a video, the time in the video. Up to 4,000 characters.</p>
        </div>
        <label className="flex gap-3 text-sm leading-relaxed text-zinc-300">
            <input type="checkbox" name="declaration" required className="mt-1 h-4 w-4 shrink-0 accent-emerald-400" />
            <span>The information in this report is accurate, and I believe in good faith that the content is not allowed. youtick may email me about this report.</span>
        </label>
        <div ref={widgetElement} />
        {error && <p role="alert" className="text-sm text-red-300">{ERRORS[error]}</p>}
        <Button type="submit" size="lg" disabled={state === 'sending'} className="w-full rounded-full bg-white px-8 py-6 text-base font-bold text-black hover:bg-zinc-200 sm:w-auto">
            {state === 'sending' ? <><Loader2 aria-hidden="true" className="animate-spin" />Sending…</> : 'Send report'}
        </Button>
    </form>;
}
