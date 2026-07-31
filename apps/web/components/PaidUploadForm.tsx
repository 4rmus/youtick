'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Loader2, Upload } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useWallet } from '@/components/providers/WalletProvider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    authorizePaidUpload,
    createPaidUploadDraft,
    findPaidUploadDraft,
    readR2IngestProbe,
    uploadPaidSource,
    validatePaidSourceFile,
    type R2IngestProbe,
} from '@/lib/storage/r2-ingest';

export function PaidUploadForm() {
    const { t } = useLanguage();
    const u = t.upload_page;
    const { accountId, connect, getWallet, isReady } = useWallet();
    const [file, setFile] = React.useState<File | null>(null);
    const [fileError, setFileError] = React.useState<string | null>(null);
    const [title, setTitle] = React.useState('');
    const [price, setPrice] = React.useState('2.00');
    const [rightsAccepted, setRightsAccepted] = React.useState(false);
    const [probe, setProbe] = React.useState<R2IngestProbe | null>(null);
    const [status, setStatus] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        const controller = new AbortController();
        readR2IngestProbe(controller.signal)
            .then(setProbe)
            .catch((reason: unknown) => {
                if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
                    setError(u.paid_browser_control_not_ready_desc);
                }
            });
        return () => controller.abort();
    }, [u.paid_browser_control_not_ready_desc]);

    const selectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selected = event.target.files?.[0] || null;
        setFile(selected);
        setError(null);
        if (!selected) {
            setFileError(null);
            return;
        }
        const result = validatePaidSourceFile(selected);
        setFileError(result.ok ? null : validationMessage(result.error, u));
    };

    const start = async () => {
        if (!accountId || !file || fileError || !probe?.ready || !rightsAccepted) return;
        setBusy(true);
        setError(null);
        try {
            let draft = await findPaidUploadDraft(accountId, file);
            if (!draft) {
                draft = await createPaidUploadDraft({
                    accountId,
                    title,
                    price,
                    file,
                });
                setStatus(u.paid_browser_authorizing);
                await authorizePaidUpload(await getWallet(), draft);
            }
            if (draft.state === 'SOURCE_UPLOADED') {
                setStatus(u.paid_browser_complete);
                return;
            }

            setStatus(u.paid_browser_uploading);
            try {
                await uploadPaidSource(file, draft, {
                    onProgress: (uploaded, total) => {
                        setStatus(`${u.paid_browser_uploading} ${uploaded}/${total}`);
                    },
                });
            } catch (reason) {
                if (reason instanceof Error && reason.message === 'on_chain_job_mismatch') {
                    setStatus(u.paid_browser_authorizing);
                    await authorizePaidUpload(await getWallet(), draft);
                    await uploadPaidSource(file, draft, {
                        onProgress: (uploaded, total) => {
                            setStatus(`${u.paid_browser_uploading} ${uploaded}/${total}`);
                        },
                    });
                } else {
                    throw reason;
                }
            }
            setStatus(u.paid_browser_complete);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : u.paid_browser_failed);
        } finally {
            setBusy(false);
        }
    };

    const formReady = Boolean(
        accountId
        && file
        && !fileError
        && title.trim()
        && price.trim()
        && rightsAccepted
        && probe?.ready,
    );

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div className="space-y-2">
                <p className="text-sm font-medium text-primary">{u.paid_browser_eyebrow}</p>
                <h1 className="text-3xl font-semibold tracking-tight">{u.title}</h1>
                <p className="text-muted-foreground">{u.paid_browser_description}</p>
            </div>

            <Alert variant={probe?.ready ? 'default' : 'destructive'}>
                {probe?.ready
                    ? <CheckCircle2 className="h-4 w-4" />
                    : probe
                        ? <AlertCircle className="h-4 w-4" />
                        : <Loader2 className="h-4 w-4 animate-spin" />}
                <AlertTitle>
                    {probe?.ready
                        ? u.paid_browser_control_ready
                        : probe
                            ? u.paid_browser_control_not_ready
                            : u.paid_browser_control_checking}
                </AlertTitle>
                <AlertDescription>
                    {probe?.ready
                        ? u.paid_browser_control_ready_desc
                        : u.paid_browser_control_not_ready_desc}
                </AlertDescription>
            </Alert>

            <Card>
                <CardHeader>
                    <CardTitle>{u.form_title}</CardTitle>
                    <CardDescription>{u.paid_browser_form_desc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="space-y-2">
                        <label htmlFor="paid-video" className="text-sm font-medium">{u.file}</label>
                        <Input
                            id="paid-video"
                            type="file"
                            accept="video/mp4,video/quicktime"
                            disabled={busy}
                            onChange={selectFile}
                        />
                        <p className="text-xs text-muted-foreground">{u.paid_browser_file_help}</p>
                        {fileError && <p className="text-sm text-destructive">{fileError}</p>}
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="paid-title" className="text-sm font-medium">{u.video_title}</label>
                        <Input
                            id="paid-title"
                            value={title}
                            maxLength={200}
                            disabled={busy}
                            onChange={(event) => setTitle(event.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="paid-price" className="text-sm font-medium">{u.price}</label>
                        <Input
                            id="paid-price"
                            type="number"
                            min="2"
                            step="0.01"
                            value={price}
                            disabled={busy}
                            onChange={(event) => setPrice(event.target.value)}
                        />
                    </div>

                    <label className="flex items-start gap-3 text-sm">
                        <input
                            type="checkbox"
                            className="mt-1"
                            checked={rightsAccepted}
                            disabled={busy}
                            onChange={(event) => setRightsAccepted(event.target.checked)}
                        />
                        <span>{u.paid_browser_rights}</span>
                    </label>

                    {!accountId ? (
                        <Button type="button" onClick={() => void connect()} disabled={!isReady}>
                            {u.connect_wallet}
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            className="w-full"
                            disabled={!formReady || busy}
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
    return copy.paid_browser_unsupported_video_type;
}
