'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Loader2, Upload } from 'lucide-react';
import Link from '@/components/Web4Link';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useWallet } from '@/components/providers/WalletProvider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    authorizeLivepeerPaidJob,
    clearLivepeerUploadDraft,
    createLivepeerJobId,
    parseLivepeerPriceUsdc,
    readLivepeerUploadDraft,
    requestLivepeerUploadIntent,
    uploadLivepeerSource,
    validateLivepeerSourceFile,
    writeLivepeerUploadDraft,
} from '@/lib/livepeer-upload';

export function LivepeerPaidUploadForm() {
    const { t } = useLanguage();
    const u = t.upload_page;
    const { accountId, connect, getWallet, isReady } = useWallet();
    const [file, setFile] = React.useState<File | null>(null);
    const [fileError, setFileError] = React.useState<string | null>(null);
    const [title, setTitle] = React.useState('');
    const [price, setPrice] = React.useState('2.00');
    const [jobId, setJobId] = React.useState<string | null>(null);
    const [rightsAccepted, setRightsAccepted] = React.useState(false);
    const [status, setStatus] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [complete, setComplete] = React.useState(false);

    const selectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selected = event.target.files?.[0] || null;
        setFile(selected);
        setError(null);
        setComplete(false);
        if (!selected) {
            setFileError(null);
            return;
        }
        const validation = validateLivepeerSourceFile(selected);
        setFileError(validation.ok ? null : validationMessage(validation.error, u));
        const draft = accountId ? readLivepeerUploadDraft(accountId, selected) : null;
        setJobId(draft?.jobId || null);
        if (draft) {
            setTitle(draft.title);
            setPrice(draft.price);
        }
    };

    const start = async () => {
        if (!accountId || !file || fileError || !title.trim() || !rightsAccepted) return;
        setBusy(true);
        setError(null);
        try {
            const priceUsdc = parseLivepeerPriceUsdc(price);
            const activeJobId = jobId || createLivepeerJobId();
            const draft = {
                jobId: activeJobId,
                title: title.trim(),
                price,
                sourceBytes: file.size,
                sourceName: file.name,
                sourceLastModified: file.lastModified,
            };
            setJobId(activeJobId);
            writeLivepeerUploadDraft(accountId, draft);
            const wallet = await getWallet();
            setStatus(u.livepeer_authorizing);
            await authorizeLivepeerPaidJob(wallet, {
                accountId,
                jobId: activeJobId,
                title: draft.title,
                priceUsdc,
                expectedSourceBytes: file.size,
            });
            const intent = await requestLivepeerUploadIntent({
                wallet,
                accountId,
                jobId: activeJobId,
                generation: 1,
                expectedSourceBytes: file.size,
            });
            setStatus(u.livepeer_uploading);
            await uploadLivepeerSource(file, intent, {
                onProgress: (uploaded, total) => {
                    setStatus(`${u.livepeer_uploading} ${uploaded}/${total}`);
                },
            });
            clearLivepeerUploadDraft(accountId);
            setComplete(true);
            setStatus(u.livepeer_complete);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : u.livepeer_failed);
        } finally {
            setBusy(false);
        }
    };

    const ready = Boolean(
        accountId
        && file
        && !fileError
        && title.trim()
        && price.trim()
        && rightsAccepted,
    );

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div className="space-y-2">
                <p className="text-sm font-medium text-primary">{u.livepeer_eyebrow}</p>
                <h1 className="text-3xl font-semibold tracking-tight">{u.title}</h1>
                <p className="text-muted-foreground">{u.livepeer_description}</p>
            </div>

            <Alert>
                {complete ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                <AlertTitle>{complete ? u.livepeer_complete : u.livepeer_closed_canary}</AlertTitle>
                <AlertDescription>{u.livepeer_closed_canary_desc}</AlertDescription>
            </Alert>

            <Card>
                <CardHeader>
                    <CardTitle>{u.form_title}</CardTitle>
                    <CardDescription>{u.livepeer_form_desc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="space-y-2">
                        <label htmlFor="livepeer-video" className="text-sm font-medium">{u.file}</label>
                        <Input
                            id="livepeer-video"
                            type="file"
                            accept="video/mp4"
                            disabled={busy}
                            onChange={selectFile}
                        />
                        <p className="text-xs text-muted-foreground">{u.livepeer_file_help}</p>
                        {fileError && <p className="text-sm text-destructive">{fileError}</p>}
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="livepeer-title" className="text-sm font-medium">{u.video_title}</label>
                        <Input
                            id="livepeer-title"
                            value={title}
                            maxLength={200}
                            disabled={busy || complete}
                            onChange={(event) => setTitle(event.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="livepeer-price" className="text-sm font-medium">{u.price}</label>
                        <Input
                            id="livepeer-price"
                            type="number"
                            min="2"
                            step="0.000001"
                            value={price}
                            disabled={busy || complete}
                            onChange={(event) => setPrice(event.target.value)}
                        />
                    </div>

                    <label className="flex items-start gap-3 text-sm">
                        <input
                            type="checkbox"
                            className="mt-1"
                            checked={rightsAccepted}
                            disabled={busy || complete}
                            onChange={(event) => setRightsAccepted(event.target.checked)}
                        />
                        <span>{u.paid_browser_rights}</span>
                    </label>

                    {!accountId ? (
                        <Button type="button" onClick={() => void connect()} disabled={!isReady}>
                            {u.connect_wallet}
                        </Button>
                    ) : complete && jobId ? (
                        <Button asChild className="w-full">
                            <Link href={`/watch?job=${encodeURIComponent(jobId)}`}>{u.livepeer_watch}</Link>
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            className="w-full"
                            disabled={!ready || busy}
                            onClick={() => void start()}
                        >
                            {busy
                                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                : <Upload className="mr-2 h-4 w-4" />}
                            {u.paid_browser_start}
                        </Button>
                    )}

                    {status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                </CardContent>
            </Card>
        </div>
    );
}

function validationMessage(
    error: 'empty_file' | 'source_limit_exceeded' | 'unsupported_video_type',
    copy: ReturnType<typeof useLanguage>['t']['upload_page'],
): string {
    if (error === 'empty_file') return copy.paid_browser_empty_file;
    if (error === 'source_limit_exceeded') return copy.paid_browser_source_limit_exceeded;
    return copy.livepeer_unsupported_video_type;
}
