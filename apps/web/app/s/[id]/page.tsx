import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ScreeningView } from '@/components/screening/ScreeningView';
import { RuntimeClosed } from '@/components/RuntimeClosed';
import { FEATURE_FLAGS } from '@/lib/constants';
import { GENERIC_SCREENING_METADATA, screeningMetadata } from './screening-metadata';

const JOB_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id } = await params;
    if (!FEATURE_FLAGS.enablePaidMediaLivepeerV1 || !JOB_ID_PATTERN.test(id)) return GENERIC_SCREENING_METADATA;
    return screeningMetadata(id, (await headers()).get('cf-connecting-ip'));
}

export default async function ScreeningPage({ params }: Props) {
    const { id } = await params;
    if (!JOB_ID_PATTERN.test(id)) notFound();
    if (!FEATURE_FLAGS.enablePaidMediaLivepeerV1) return <RuntimeClosed />;
    return <ScreeningView jobId={id} />;
}
